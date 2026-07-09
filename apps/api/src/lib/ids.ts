import { randomUUID, randomBytes, createHash } from "crypto";

export const newId = (): string => randomUUID();

/** API token: returned once in plain text, only the hash is stored. */
export function newApiToken(): { plain: string; hash: string; prefix: string } {
  const raw = randomBytes(32).toString("base64url");
  const plain = `ykms_${raw}`;
  return { plain, hash: sha256(plain), prefix: plain.slice(0, 12) };
}

export const sha256 = (v: string): string =>
  createHash("sha256").update(v).digest("hex");
