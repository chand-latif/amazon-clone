// A short list is enough for a demo; the server validates against these codes.
export const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "JP", name: "Japan" },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]["code"];

const NAMES: Record<string, string> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c.name]));

export function isCountryCode(value: string): value is CountryCode {
  return value in NAMES;
}

/** Display name for a stored code; falls back to the code itself. */
export function countryName(code: string): string {
  return NAMES[code] ?? code;
}
