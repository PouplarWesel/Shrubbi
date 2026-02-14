export type PlantPointFlags = {
  is_native?: boolean | null;
  is_endangered?: boolean | null;
  is_invasive?: boolean | null;
};

// Points are derived from plant attributes stored in the DB.
// Base: 15 points for adding a plant.
// Native bonus: +5 (static).
// Multipliers: x1.5 if endangered, x0.5 if invasive.
export function computePlantPoints(
  flags: PlantPointFlags,
  quantity = 1,
): number {
  const base = 15 + (flags.is_native ? 5 : 0);
  const endangeredMultiplier = flags.is_endangered ? 1.5 : 1;
  const invasiveMultiplier = flags.is_invasive ? 0.5 : 1;

  return base * endangeredMultiplier * invasiveMultiplier * quantity;
}

export function formatPlantPoints(points: number): string {
  const rounded = Math.round(points * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
