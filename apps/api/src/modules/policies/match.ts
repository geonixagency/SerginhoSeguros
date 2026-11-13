// Acha a apólice do cliente a que um endosso (ou 2ª via) se refere: usado no upload de PDF e
// na importação da carteira. Ordem de confiança: número da apólice > chassi > placa.
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const plate = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Mesmo número de apólice, tolerando formatação ("0531 65 12345678" = "053165-12345678")
 * e a forma curta sem sucursal/ramo ("12345678"). */
export function samePolicyNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const alnum = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (alnum(a) && alnum(a) === alnum(b)) return true;
  const x = digits(a);
  const y = digits(b);
  if (x.length < 4 || y.length < 4) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  // Azul: "65.24.0531.015051.000" (o final é o nº do endosso) = "65.24.0531.015051".
  if (short.length >= 10 && long.length - short.length <= 3 && long.startsWith(short)) return true;
  return short.length >= 6 && long.endsWith(short);
}

export interface PolicyHint {
  insurerId?: string | null;
  numero?: string | null;
  placa?: string | null;
  chassi?: string | null;
}

export type MatchedPolicy = { id: string; numero: string | null; status: string; insurerId: string; fimVigencia: Date | null; via: "numero" | "chassi" | "placa" };

export async function findPolicyForDocument(db: Db, clientId: string, hint: PolicyHint): Promise<MatchedPolicy | null> {
  const pols = await db.policy.findMany({
    where: { clientId, ...(hint.insurerId ? { insurerId: hint.insurerId } : {}) },
    select: { id: true, numero: true, status: true, insurerId: true, fimVigencia: true, items: { select: { placa: true, chassi: true } } },
    orderBy: [{ fimVigencia: { sort: "desc", nulls: "last" } }],
  });
  const pick = (via: MatchedPolicy["via"], p: (typeof pols)[number] | undefined): MatchedPolicy | null =>
    p ? { id: p.id, numero: p.numero, status: p.status, insurerId: p.insurerId, fimVigencia: p.fimVigencia, via } : null;

  if (hint.numero) {
    const hit = pols.find((p) => samePolicyNumber(p.numero, hint.numero));
    if (hit) return pick("numero", hit);
  }
  const ch = (hint.chassi ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (ch.length >= 8) {
    const hit = pols.find((p) => p.items.some((i) => (i.chassi ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === ch));
    if (hit) return pick("chassi", hit);
  }
  const pl = plate(hint.placa);
  if (pl.length === 7) {
    // Mesma placa: a apólice mais recente da mesma seguradora (lista já vem da vigência mais nova).
    const hit = pols.find((p) => p.items.some((i) => plate(i.placa) === pl));
    if (hit) return pick("placa", hit);
  }
  return null;
}
