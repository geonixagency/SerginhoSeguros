// Regras de negócio compartilhadas sobre apólices e status de cliente.
import type { Prisma } from "@prisma/client";
import { dateOnly, todayIso } from "../../lib/dates";
import { prisma } from "../../lib/prisma";

/** Apólice "vigente" = não cancelada e fimVigencia >= hoje (prompt pai §5). */
export function vigenteWhere(today = todayIso()): Prisma.PolicyWhereInput {
  return { status: { not: "CANCELADA" }, fimVigencia: { gte: dateOnly(today) } };
}

/** Recalcula ATIVO/INATIVO de um cliente (chamado após criar/editar apólice). */
export async function refreshClientStatus(clientId: string): Promise<void> {
  const vigentes = await prisma.policy.count({ where: { clientId, ...vigenteWhere() } });
  await prisma.client.update({ where: { id: clientId }, data: { status: vigentes > 0 ? "ATIVO" : "INATIVO" } });
}

/**
 * Job diário: recalcula status de todos os clientes, marca apólices vencidas e
 * parcelas pendentes em atraso. Feito em SQL para ser O(1) consultas.
 */
export async function recalcAllStatuses(): Promise<{ ativos: number; inativos: number; parcelasAtrasadas: number; apolicesVencidas: number }> {
  const today = todayIso();
  const apolicesVencidas = await prisma.policy.updateMany({
    where: { status: "VIGENTE", fimVigencia: { lt: dateOnly(today) } },
    data: { status: "VENCIDA" },
  });
  const parcelas = await prisma.installment.updateMany({
    where: { status: "PENDENTE", vencimento: { lt: dateOnly(today) } },
    data: { status: "ATRASADO" },
  });
  const ativos = await prisma.$executeRaw`
    UPDATE clients c SET status = 'ATIVO', updated_at = now()
    WHERE c.status <> 'ATIVO' AND EXISTS (
      SELECT 1 FROM policies p WHERE p.client_id = c.id AND p.status <> 'CANCELADA' AND p.fim_vigencia >= ${dateOnly(today)}::date)`;
  const inativos = await prisma.$executeRaw`
    UPDATE clients c SET status = 'INATIVO', updated_at = now()
    WHERE c.status <> 'INATIVO' AND NOT EXISTS (
      SELECT 1 FROM policies p WHERE p.client_id = c.id AND p.status <> 'CANCELADA' AND p.fim_vigencia >= ${dateOnly(today)}::date)`;
  return { ativos, inativos, parcelasAtrasadas: parcelas.count, apolicesVencidas: apolicesVencidas.count };
}
