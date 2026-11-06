// Criptografia de segredos (credenciais de seguradoras) com AES-256-GCM.
// Formato: "v1:<iv b64>:<tag b64>:<cifrado b64>". O prefixo de versão permite
// rotacionar o algoritmo/chave no futuro sem ambiguidade.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function parseKey(raw: string): Buffer {
  const k = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY deve ter 32 bytes (base64 ou hex)");
  return k;
}

export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decrypt(payload: string, key: Buffer): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Segredo em formato desconhecido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Máscara para exibir um segredo sem revelá-lo: mostra só pontas de valores longos. */
export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  if (value.length <= 16) return `${"•".repeat(8)} (${value.length})`;
  return `${value.slice(0, 3)}•••••${value.slice(-3)}`;
}

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
