/**
 * Tax depreciation engine for Australian investment properties.
 *
 * Division 40 (plant and equipment): diminishing value or prime cost
 * Division 43 (capital works): 2.5% or 4% a year depending on when construction started
 *
 * Simplified for demonstration. Real schedules are prepared by a qualified quantity
 * surveyor and follow current ATO rulings; low-value pooling and immediate write-offs
 * are not modelled here.
 */
import type { AssetCategory, Method, PropertyType } from './contracts';

const DAY_MS = 86_400_000;

/** Second-hand plant in established residential property is not deductible for contracts after this date (s40-27 ITAA 1997). */
export const PREVIOUSLY_USED_CUTOFF = '2017-05-09';

export interface ScheduleAsset {
  name: string;
  category: AssetCategory;
  cost: number;
  effectiveLife?: number | null;
  method: Method;
  /** Install date for plant, or construction start date for capital works. */
  startDate: string;
  previouslyUsed: boolean;
}

export interface ScheduleInput {
  purchaseDate: string;
  propertyType: PropertyType;
  assets: ScheduleAsset[];
  years?: number;
}

export interface AssetSchedule {
  name: string;
  category: AssetCategory;
  method: Method | 'capital_works';
  cost: number;
  openingValue: number;
  rate: number;
  excluded: boolean;
  reason?: string;
  yearly: number[];
}

export interface ScheduleRow {
  financialYear: string;
  plant: number;
  capitalWorks: number;
  total: number;
  cumulative: number;
}

export interface Schedule {
  rows: ScheduleRow[];
  assets: AssetSchedule[];
  totals: { plant: number; capitalWorks: number; total: number; firstFiveYears: number };
  notes: string[];
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date: ${iso}`);
  return new Date(Date.UTC(y, m - 1, d));
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Year in which the financial year containing this date ends (FY runs 1 July to 30 June). */
export function financialYearEnd(date: Date): number {
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() + 1 : date.getUTCFullYear();
}

export function financialYearLabel(endYear: number): string {
  return `${endYear - 1}-${String(endYear).slice(2)}`;
}

/** Days held in a financial year, counting both the start date and 30 June. */
function daysHeldInYear(fyEnd: number, from: Date): number {
  const fyStart = new Date(Date.UTC(fyEnd - 1, 6, 1));
  const fyFinish = new Date(Date.UTC(fyEnd, 5, 30));
  const start = from > fyStart ? from : fyStart;
  if (start > fyFinish) return 0;
  return Math.min(365, Math.round((fyFinish.getTime() - start.getTime()) / DAY_MS) + 1);
}

/**
 * Division 43 rate based on construction start date, using the residential rules.
 * Non-residential and short-term accommodation buildings have extra rates that are not modelled here.
 */
export function capitalWorksRate(constructionStart: string): number {
  const d = parseDate(constructionStart);
  if (d < parseDate('1985-07-18')) return 0;
  if (d <= parseDate('1987-09-15')) return 0.04;
  return 0.025;
}

export function isExcludedSecondHand(asset: ScheduleAsset, purchaseDate: string, propertyType: PropertyType): boolean {
  return (
    asset.category === 'plant' &&
    asset.previouslyUsed &&
    propertyType !== 'commercial' &&
    parseDate(purchaseDate) > parseDate(PREVIOUSLY_USED_CUTOFF)
  );
}

export function buildSchedule(input: ScheduleInput): Schedule {
  const years = input.years ?? 10;
  const purchase = parseDate(input.purchaseDate);
  const firstFy = financialYearEnd(purchase);
  const fyEnds = Array.from({ length: years }, (_, i) => firstFy + i);

  const assets: AssetSchedule[] = input.assets.map((asset) => {
    const assetStart = parseDate(asset.startDate);
    const claimStart = assetStart > purchase ? assetStart : purchase;

    if (asset.category === 'capital_works') {
      const rate = capitalWorksRate(asset.startDate);
      const annual = asset.cost * rate;
      // Decline already claimed (or claimable) by previous owners before this purchase
      const priorYears = assetStart < purchase ? (purchase.getTime() - assetStart.getTime()) / DAY_MS / 365 : 0;
      let remaining = Math.max(0, asset.cost - annual * priorYears);
      const opening = round(remaining);
      const yearly = fyEnds.map((fy) => {
        const claim = Math.min(remaining, (annual * daysHeldInYear(fy, claimStart)) / 365);
        remaining -= claim;
        return round(claim);
      });
      return {
        name: asset.name, category: asset.category, method: 'capital_works', cost: asset.cost,
        openingValue: opening, rate, excluded: rate === 0,
        reason: rate === 0 ? 'Construction started before 18 July 1985, so no capital works deduction is available' : undefined,
        yearly,
      };
    }

    const life = asset.effectiveLife ?? 0;
    if (isExcludedSecondHand(asset, input.purchaseDate, input.propertyType) || life <= 0) {
      return {
        name: asset.name, category: asset.category, method: asset.method, cost: asset.cost,
        openingValue: asset.cost, rate: 0, excluded: true,
        reason: life <= 0
          ? 'No effective life provided'
          : 'Second-hand plant in a residential property bought after 9 May 2017 is not deductible',
        yearly: fyEnds.map(() => 0),
      };
    }

    const rate = asset.method === 'diminishing_value' ? 2 / life : 1 / life;
    let remaining = asset.cost;
    const yearly = fyEnds.map((fy) => {
      const fraction = daysHeldInYear(fy, claimStart) / 365;
      const base = asset.method === 'diminishing_value' ? remaining : asset.cost;
      const claim = Math.min(remaining, base * fraction * rate);
      remaining -= claim;
      return round(claim);
    });
    return {
      name: asset.name, category: asset.category, method: asset.method, cost: asset.cost,
      openingValue: asset.cost, rate, excluded: false, yearly,
    };
  });

  let cumulative = 0;
  const rows: ScheduleRow[] = fyEnds.map((fy, i) => {
    const sum = (category: AssetCategory) =>
      round(assets.filter((a) => a.category === category).reduce((s, a) => s + (a.yearly[i] ?? 0), 0));
    const plant = sum('plant');
    const capitalWorks = sum('capital_works');
    const total = round(plant + capitalWorks);
    cumulative = round(cumulative + total);
    return { financialYear: financialYearLabel(fy), plant, capitalWorks, total, cumulative };
  });

  const totalOf = (key: 'plant' | 'capitalWorks' | 'total') => round(rows.reduce((s, r) => s + r[key], 0));
  const notes = [
    'Year 1 is pro-rated from the settlement date to 30 June.',
    'Estimates only. A qualified quantity surveyor must confirm costs, effective lives and eligibility.',
  ];
  if (assets.some((a) => a.excluded && a.category === 'plant' && a.reason?.includes('Second-hand'))) {
    notes.push('Some second-hand plant is excluded but may reduce capital gains tax when the property is sold.');
  }

  return {
    rows,
    assets,
    totals: {
      plant: totalOf('plant'),
      capitalWorks: totalOf('capitalWorks'),
      total: totalOf('total'),
      firstFiveYears: round(rows.slice(0, 5).reduce((s, r) => s + r.total, 0)),
    },
    notes,
  };
}

export function scheduleToCsv(schedule: Schedule): string {
  const header = ['Financial year', 'Plant & equipment', 'Capital works', 'Total', 'Cumulative'];
  const lines = schedule.rows.map((r) =>
    [r.financialYear, r.plant.toFixed(2), r.capitalWorks.toFixed(2), r.total.toFixed(2), r.cumulative.toFixed(2)].join(','),
  );
  return [header.join(','), ...lines].join('\n') + '\n';
}
