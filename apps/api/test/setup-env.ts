// Ambiente dos testes. Uploads gerados em teste vão para uma pasta temporária
// (nunca para o STORAGE_DIR real). Se houver .env.local, o DATABASE_URL dele é
// usado pelos testes de integração; sem banco, esses testes são pulados.
import { config } from "dotenv";
import os from "node:os";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.STORAGE_DIR = path.join(os.tmpdir(), "ss-api-test-storage");
process.env.EVOLUTION_MOCK = "true";
process.env.CONNECTORS_DEMO = "true";
config({ path: path.resolve(__dirname, "../.env.local") });
process.env.JWT_SECRET ??= "teste-".repeat(8);
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.INTEGRATION_DB = process.env.DATABASE_URL ? "1" : "";
process.env.DATABASE_URL ??= "postgresql://ninguem:ninguem@127.0.0.1:1/nada";
