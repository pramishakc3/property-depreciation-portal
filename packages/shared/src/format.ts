export const aud = (n: number, digits = 0) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: digits, maximumFractionDigits: digits });
