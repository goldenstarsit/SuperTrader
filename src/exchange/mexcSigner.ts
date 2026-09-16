import { createHmac } from "node:crypto";

export function serializeMexcParams(
  params: Record<string, string | number | boolean | undefined>,
): string {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export function createMexcSignature(
  queryString: string,
  secretKey: string,
): string {
  return createHmac("sha256", secretKey)
    .update(queryString)
    .digest("hex");
}
