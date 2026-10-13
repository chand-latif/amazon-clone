/** Split integer cents into display parts, e.g. 129999 -> { whole: "1,299", fraction: "99" }. */
export function splitPrice(cents: number) {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return { whole: whole.toLocaleString("en-US"), fraction };
}

/** Plain-text price, e.g. 129999 -> "$1,299.99". */
export function formatPrice(cents: number) {
  const { whole, fraction } = splitPrice(cents);
  return `$${whole}.${fraction}`;
}
