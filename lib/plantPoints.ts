export type PlantPointFlags = {
  is_native?: boolean | null;
  is_endangered?: boolean | null;
  is_invasive?: boolean | null;
  default_co2_kg_per_year?: number | null;
};

export const WATERING_POINTS_PER_PLANT = 10;
export const CO2_POINT_FACTOR = 1;

// Points are derived from plant attributes stored in the DB.
// Base: 15 points for adding a plant.
// Native bonus: +5 (static).
// CO2 bonus: +`default_co2_kg_per_year` scaled by `CO2_POINT_FACTOR`.
// Multipliers: x1.5 if endangered, x0.5 if invasive.
export function computePlantPoints(
  flags: PlantPointFlags,
  quantity = 1,
): number {
  const co2PerYear = Math.max(flags.default_co2_kg_per_year ?? 0, 0);
  const base = 15 + (flags.is_native ? 5 : 0) + co2PerYear * CO2_POINT_FACTOR;
  const endangeredMultiplier = flags.is_endangered ? 1.5 : 1;
  const invasiveMultiplier = flags.is_invasive ? 0.5 : 1;

  return base * endangeredMultiplier * invasiveMultiplier * quantity;
}

export function formatPlantPoints(points: number): string {
  return String(Math.round(points));
}
