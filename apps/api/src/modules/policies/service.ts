// Criação de apólice com parcelas e itens numa única transação (usado pela rota
// POST /policies, pelo cadastro por PDF e pela importação da carteira).
import type { Prisma, PrismaClient } from "@prisma/client";
import type { InstallmentInput, InsuredItemInput, PolicyCreateInput } from "@ss/shared";
import { dateOnly } from "../../lib/dates";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface PolicyWriteInput extends Omit<PolicyCreateInput, "parcelas" | "itens"> {
  documentId?: string | null;
}

export function policyData(input: Omit<PolicyWriteInput, "clientId" | "insurerId">) {
  return {
    ramo: input.ramo,
    numero: input.numero ?? null,
    proposta: input.proposta ?? null,
    emissao: input.emissao ? dateOnly(input.emissao) : null,
    inicioVigencia: input.inicioVigencia ? dateOnly(input.inicioVigencia) : null,
    fimVigencia: input.fimVigencia ? dateOnly(input.fimVigencia) : null,
    premioTotal: input.premioTotal ?? null,
    formaPagamento: input.formaPagamento,
    status: input.status,
    endossoDeId: input.endossoDeId ?? null,
  };
}

export async function createPolicyWithChildren(
  tx: Tx,
  input: PolicyWriteInput,
  parcelas: InstallmentInput[],
  itens: InsuredItemInput[],
) {
  // Parcelas com número repetido quebrariam o unique(policyId, numero): mantemos a primeira.
  const seen = new Set<number>();
  const parcelasUnicas = parcelas.filter((p) => (seen.has(p.numero) ? false : (seen.add(p.numero), true)));
  return tx.policy.create({
    data: {
      ...policyData(input),
      clientId: input.clientId,
      insurerId: input.insurerId,
      documentId: input.documentId ?? null,
      installments: {
        create: parcelasUnicas.map((p) => ({
          numero: p.numero,
          valor: p.valor ?? null,
          vencimento: dateOnly(p.vencimento),
          status: p.status,
        })),
      },
      items: {
        create: itens.map((i) => ({
          tipo: i.tipo,
          placa: i.placa ?? null,
          modelo: i.modelo ?? null,
          ano: i.ano ?? null,
          chassi: i.chassi ?? null,
          endereco: i.endereco ?? null,
          descricao: i.descricao ?? null,
        })),
      },
    },
    include: { insurer: true, installments: { orderBy: { numero: "asc" } }, items: true },
  });
}
