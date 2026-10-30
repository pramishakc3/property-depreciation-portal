/**
 * Sample effective lives (years) for common residential rental items, used to prefill the asset form.
 * Illustrative values for this demo only: always confirm against the ATO's current effective life ruling.
 */
export interface EffectiveLifePreset {
  name: string;
  effectiveLife: number;
}

export const EFFECTIVE_LIFE_PRESETS: EffectiveLifePreset[] = [
  { name: 'Carpet', effectiveLife: 8 },
  { name: 'Hot water system (electric)', effectiveLife: 12 },
  { name: 'Split system air conditioner', effectiveLife: 10 },
  { name: 'Dishwasher', effectiveLife: 8 },
  { name: 'Oven', effectiveLife: 12 },
  { name: 'Cooktop', effectiveLife: 12 },
  { name: 'Rangehood', effectiveLife: 12 },
  { name: 'Window blinds', effectiveLife: 10 },
  { name: 'Ceiling fan', effectiveLife: 5 },
  { name: 'Smoke alarm', effectiveLife: 6 },
  { name: 'Garage door motor', effectiveLife: 5 },
];
