/**
 * A random v4 UUID that also works where `crypto.randomUUID` doesn't exist:
 * it is only defined in secure contexts, so over plain HTTP (a LAN IP, some
 * preview setups) calling it throws and takes the whole page down. `getRandomValues`
 * is available everywhere.
 */
export function randomUuid(cryptoImpl: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = globalThis.crypto): string {
  if (typeof cryptoImpl.randomUUID === "function") return cryptoImpl.randomUUID();

  const b = cryptoImpl.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
