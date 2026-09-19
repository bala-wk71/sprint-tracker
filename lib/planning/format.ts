// How measure values read on screen. Money is stored in rupees and shown the
// way it's spoken: ₹9,000 · ₹1.4 L · ₹15 Cr.

const trim = (n: number, digits = 1) => {
  const fixed = n.toFixed(digits);
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
};

export function formatInr(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7, 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5, 2)} L`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

/** A value with its unit: "89.4 kg", "18%", "L3", "₹1.4 L". */
export function formatMeasure(value: number | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (unit === "inr") return formatInr(value);
  if (unit === "level") return `L${trim(value, 0)}`;
  if (unit === "%") return `${trim(value)}%`;
  const digits = Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 100 ? 1 : 2;
  const text = Math.abs(value) >= 1000 ? Math.round(value).toLocaleString("en-IN") : trim(value, digits);
  return unit ? `${text} ${unit}` : text;
}

/** "89–90 kg", "under 94 cm", "₹50,000+". */
export function formatBand(min: number | null, max: number | null, unit: string | null | undefined): string {
  if (min !== null && max !== null) {
    if (Math.abs(max - min) < 1e-9) return formatMeasure(min, unit);
    if (unit === "inr") return `${formatInr(min)}–${formatInr(max)}`;
    return `${formatMeasure(min, null)}–${formatMeasure(max, unit)}`;
  }
  if (max !== null) return `under ${formatMeasure(max, unit)}`;
  if (min !== null) return `${formatMeasure(min, unit)}+`;
  return "—";
}
