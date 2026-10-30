import { describe, expect, it } from 'vitest';
import {
  buildSchedule,
  capitalWorksRate,
  financialYearEnd,
  financialYearLabel,
  parseDate,
  scheduleToCsv,
  type ScheduleAsset,
} from './depreciation';
import { assetSchema, canTransition, reportRequestSchema } from './contracts';

const carpet = (overrides: Partial<ScheduleAsset> = {}): ScheduleAsset => ({
  name: 'Carpet', category: 'plant', cost: 4000, effectiveLife: 8,
  method: 'diminishing_value', startDate: '2025-07-01', previouslyUsed: false, ...overrides,
});

describe('financial years', () => {
  it('runs from 1 July to 30 June', () => {
    expect(financialYearEnd(parseDate('2026-06-30'))).toBe(2026);
    expect(financialYearEnd(parseDate('2026-07-01'))).toBe(2027);
    expect(financialYearLabel(2027)).toBe('2026-27');
  });
});

describe('plant and equipment (Division 40)', () => {
  it('calculates diminishing value at 200% / effective life on the reducing balance', () => {
    const s = buildSchedule({ purchaseDate: '2025-07-01', propertyType: 'house', assets: [carpet()], years: 3 });
    expect(s.assets[0]!.yearly).toEqual([1000, 750, 562.5]);
  });

  it('calculates prime cost evenly and never claims more than the cost', () => {
    const s = buildSchedule({
      purchaseDate: '2025-07-01', propertyType: 'house', assets: [carpet({ method: 'prime_cost' })], years: 10,
    });
    expect(s.assets[0]!.yearly.slice(0, 8)).toEqual(Array(8).fill(500));
    expect(s.assets[0]!.yearly.slice(8)).toEqual([0, 0]);
    expect(s.totals.plant).toBe(4000);
  });

  it('pro-rates the first year from settlement to 30 June', () => {
    const s = buildSchedule({
      purchaseDate: '2026-01-01', propertyType: 'house', assets: [carpet({ startDate: '2026-01-01' })], years: 1,
    });
    // 181 days held: 4000 x 181/365 x 25%
    expect(s.assets[0]!.yearly[0]).toBe(495.89);
    expect(s.rows[0]!.financialYear).toBe('2025-26');
  });

  it('excludes second-hand plant in residential property bought after 9 May 2017', () => {
    const s = buildSchedule({
      purchaseDate: '2025-07-01', propertyType: 'house', assets: [carpet({ previouslyUsed: true })], years: 2,
    });
    expect(s.assets[0]!.excluded).toBe(true);
    expect(s.totals.total).toBe(0);
    expect(s.notes.join(' ')).toContain('capital gains');
  });

  it('still allows second-hand plant for commercial property and pre-2017 purchases', () => {
    const commercial = buildSchedule({
      purchaseDate: '2025-07-01', propertyType: 'commercial', assets: [carpet({ previouslyUsed: true })], years: 1,
    });
    const older = buildSchedule({
      purchaseDate: '2016-07-01', propertyType: 'unit', assets: [carpet({ previouslyUsed: true, startDate: '2016-07-01' })], years: 1,
    });
    expect(commercial.totals.total).toBe(1000);
    expect(older.totals.total).toBe(1000);
  });
});

describe('capital works (Division 43)', () => {
  it('uses the rate for the construction start date', () => {
    expect(capitalWorksRate('1980-01-01')).toBe(0);
    expect(capitalWorksRate('1986-06-01')).toBe(0.04);
    expect(capitalWorksRate('2020-01-01')).toBe(0.025);
  });

  it('claims 2.5% a year of construction cost', () => {
    const s = buildSchedule({
      purchaseDate: '2025-07-01', propertyType: 'house', years: 2,
      assets: [{ name: 'Building', category: 'capital_works', cost: 300_000, method: 'prime_cost', startDate: '2020-01-01', previouslyUsed: false }],
    });
    expect(s.assets[0]!.yearly).toEqual([7500, 7500]);
    expect(s.rows[0]).toMatchObject({ capitalWorks: 7500, total: 7500, cumulative: 7500 });
  });

  it('stops once the 40-year life is used up by previous owners', () => {
    const s = buildSchedule({
      purchaseDate: '2026-07-01', propertyType: 'house', years: 5,
      assets: [{ name: 'Building', category: 'capital_works', cost: 100_000, method: 'prime_cost', startDate: '1988-01-01', previouslyUsed: false }],
    });
    const a = s.assets[0]!;
    const claimed = a.yearly.reduce((x, y) => x + y, 0);
    expect(a.openingValue).toBeLessThan(5000);
    expect(claimed).toBeCloseTo(a.openingValue, 1);
    expect(a.yearly.at(-1)).toBe(0);
  });
});

describe('schedule totals and export', () => {
  it('adds plant and capital works and exports CSV', () => {
    const s = buildSchedule({
      purchaseDate: '2025-07-01', propertyType: 'house', years: 2,
      assets: [carpet(), { name: 'Building', category: 'capital_works', cost: 300_000, method: 'prime_cost', startDate: '2020-01-01', previouslyUsed: false }],
    });
    expect(s.rows[0]!.total).toBe(8500);
    expect(s.rows[1]!.cumulative).toBe(8500 + 8250);
    const csv = scheduleToCsv(s).split('\n');
    expect(csv[0]).toBe('Financial year,Plant & equipment,Capital works,Total,Cumulative');
    expect(csv[1]).toBe('2025-26,1000.00,7500.00,8500.00,8500.00');
  });
});

describe('contracts', () => {
  it('validates the public request form', () => {
    const bad = reportRequestSchema.safeParse({ ownerEmail: 'nope', postcode: '20' });
    expect(bad.success).toBe(false);
  });

  it('requires an effective life for plant but not capital works', () => {
    const base = { name: 'Oven', cost: 1200, method: 'diminishing_value', startDate: '2025-07-01' };
    expect(assetSchema.safeParse({ ...base, category: 'plant' }).success).toBe(false);
    expect(assetSchema.safeParse({ ...base, category: 'capital_works' }).success).toBe(true);
  });

  it('only allows valid workflow moves', () => {
    expect(canTransition('new', 'inspection_booked')).toBe(true);
    expect(canTransition('new', 'completed')).toBe(false);
    expect(canTransition('qa', 'in_progress')).toBe(true);
  });
});
