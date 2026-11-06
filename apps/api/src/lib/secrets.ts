import { env } from "../config/env";
import { decrypt, encrypt, parseKey } from "./crypto";

// Chave derivada uma vez no boot; erro de formato derruba a API (intencional).
const key = parseKey(env.APP_ENCRYPTION_KEY);

export const encryptSecret = (plain: string) => encrypt(plain, key);
export const decryptSecret = (payload: string) => decrypt(payload, key);
