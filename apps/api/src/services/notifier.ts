import type { Job } from '@pdp/shared';
import { config } from '../config';

/** Sends a notification when a new report request arrives. */
export interface Notifier {
  requestReceived(job: Job): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async requestReceived(job: Job): Promise<void> {
    console.log(`[notify] New report request ${job.reference} for ${job.propertyAddress}, ${job.suburb}`);
  }
}

export class MemoryNotifier implements Notifier {
  sent: Job[] = [];
  async requestReceived(job: Job): Promise<void> {
    this.sent.push(job);
  }
}

interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  sender: string;
  notifyTo: string;
}

/**
 * Emails the team through the Microsoft Graph API (Microsoft 365), using an
 * Entra ID app registration with the Mail.Send application permission.
 */
export class GraphMailNotifier implements Notifier {
  constructor(private cfg: GraphConfig, private http: typeof fetch = fetch) {}

  private async token(): Promise<string> {
    const res = await this.http(`https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.cfg.clientId,
        client_secret: this.cfg.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) throw new Error(`Graph token request failed (${res.status})`);
    return ((await res.json()) as { access_token: string }).access_token;
  }

  async requestReceived(job: Job): Promise<void> {
    const message = {
      subject: `New depreciation report request ${job.reference}`,
      body: {
        contentType: 'Text',
        content: [
          `Reference: ${job.reference}`,
          `Property: ${job.propertyAddress}, ${job.suburb} ${job.state} ${job.postcode} (${job.propertyType})`,
          `Owner: ${job.ownerName}, ${job.ownerEmail}, ${job.ownerPhone}`,
          `Purchased: ${job.purchaseDate}`,
        ].join('\n'),
      },
      toRecipients: [{ emailAddress: { address: this.cfg.notifyTo } }],
    };
    const res = await this.http(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.cfg.sender)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, saveToSentItems: false }),
    });
    if (!res.ok) throw new Error(`Graph sendMail failed (${res.status})`);
  }
}

export function createNotifier(): Notifier {
  const g = config.graph;
  if (g.tenantId && g.clientId && g.clientSecret && g.sender && g.notifyTo) {
    return new GraphMailNotifier({
      tenantId: g.tenantId, clientId: g.clientId, clientSecret: g.clientSecret, sender: g.sender, notifyTo: g.notifyTo,
    });
  }
  return new ConsoleNotifier();
}
