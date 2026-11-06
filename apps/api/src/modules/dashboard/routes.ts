// Dashboard: cards, vencimentos, parcelas, gráficos e aniversariantes.
import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import {
  BirthdaysQuerySchema,
  ExpiringQuerySchema,
  InstallmentsDueQuerySchema,
  type BirthdayDTO,
  type DashboardChartsDTO,
  type DashboardSummaryDTO,
  type ExpiringPolicyDTO,
  type InstallmentWithContextDTO,
} from "@ss/shared";
import { prisma } from "../../lib/prisma";
import { parse } from "../../lib/validate";
import { addDays, dateOnly, diffDays, startOfMonthIso, todayIso, toIsoDate } from "../../lib/dates";
import { installmentDTO, insurerSummary, money } from "../../lib/serialize";
import { vigenteWhere } from "../policies/rules";

async function countExpiring(today: string, days: number) {
  return prisma.policy.count({
    where: { ...vigenteWhere(today), fimVigencia: { gte: dateOnly(today), lte: dateOnly(addDays(today, days)) } },
  });
}

/**
 * "Novo no mês" = cliente cuja PRIMEIRA apólice começou neste mês (ou, sem apólice,
 * cadastrado neste mês). Não usamos createdAt puro porque a importação da carteira
 * criaria todos os clientes "novos" no mês da migração.
 */
async function countNewClientsThisMonth(): Promise<number> {
  const inicio = dateOnly(startOfMonthIso());
  const desde = new Date(`${startOfMonthIso()}T00:00:00-03:00`);
  const [r] = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*) AS n FROM clients c
    LEFT JOIN (
      SELECT client_id, MIN(COALESCE(inicio_vigencia, emissao)) AS primeiro FROM policies GROUP BY client_id
    ) p ON p.client_id = c.id
    WHERE (p.primeiro IS NOT NULL AND p.primeiro >= ${inicio}::date)
       OR (p.primeiro IS NULL AND c.created_at >= ${desde})`;
  return Number(r?.n ?? 0);
}

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get("/summary", async (): Promise<DashboardSummaryDTO> => {
    const today = todayIso();
    const [ativos, inativos, novos, vigentes, premio, atrasadas, d7, d15, d30, d60, semTelefone, venceHoje] = await Promise.all([
      prisma.client.count({ where: { status: "ATIVO" } }),
      prisma.client.count({ where: { status: "INATIVO" } }),
      countNewClientsThisMonth(),
      prisma.policy.count({ where: vigenteWhere(today) }),
      prisma.policy.aggregate({ where: vigenteWhere(today), _sum: { premioTotal: true } }),
      prisma.installment.count({ where: { status: { in: ["ATRASADO", "FALHOU"] } } }),
      countExpiring(today, 7),
      countExpiring(today, 15),
      countExpiring(today, 30),
      countExpiring(today, 60),
      prisma.client.count({ where: { status: "ATIVO", OR: [{ telefone: null }, { telefone: "" }] } }),
      prisma.installment.count({ where: { status: "PENDENTE", vencimento: dateOnly(today) } }),
    ]);

    const alertas: DashboardSummaryDTO["alertas"] = [];
    if (atrasadas > 0) alertas.push({ tipo: "PARCELAS_ATRASADAS", nivel: "critico", mensagem: `${atrasadas} parcela(s) em atraso ou com falha`, total: atrasadas });
    if (d7 > 0) alertas.push({ tipo: "VENCENDO_7_DIAS", nivel: "atencao", mensagem: `${d7} apólice(s) vencem nos próximos 7 dias`, total: d7 });
    if (venceHoje > 0) alertas.push({ tipo: "PARCELAS_HOJE", nivel: "info", mensagem: `${venceHoje} parcela(s) vencem hoje`, total: venceHoje });
    if (semTelefone > 0) alertas.push({ tipo: "SEM_TELEFONE", nivel: "info", mensagem: `${semTelefone} cliente(s) ativo(s) sem telefone para avisos`, total: semTelefone });

    return {
      clientesAtivos: ativos,
      clientesInativos: inativos,
      novosNoMes: novos,
      apolicesVigentes: vigentes,
      premioCarteira: money(premio._sum.premioTotal) ?? "0.00",
      parcelasAtrasadas: atrasadas,
      vencendo: { d7, d15, d30, d60 },
      alertas,
    };
  });

  app.get("/expiring", async (req): Promise<{ days: number; total: number; data: ExpiringPolicyDTO[] }> => {
    const { days } = parse(ExpiringQuerySchema, req.query);
    const today = todayIso();
    const rows = await prisma.policy.findMany({
      where: { ...vigenteWhere(today), fimVigencia: { gte: dateOnly(today), lte: dateOnly(addDays(today, days)) } },
      include: { insurer: true, client: { select: { id: true, nome: true, telefone: true } }, items: { select: { placa: true } } },
      orderBy: { fimVigencia: "asc" },
      take: 500,
    });
    const data = rows.map((p) => {
      const fim = toIsoDate(p.fimVigencia) ?? today;
      return {
        id: p.id,
        numero: p.numero,
        ramo: p.ramo,
        fimVigencia: fim,
        diasParaVencer: diffDays(today, fim),
        premioTotal: money(p.premioTotal),
        insurer: insurerSummary(p.insurer),
        client: p.client,
        placas: p.items.map((i) => i.placa).filter((x): x is string => !!x),
      };
    });
    return { days, total: data.length, data };
  });

  app.get("/installments-due", async (req): Promise<{ range: string; total: number; data: InstallmentWithContextDTO[] }> => {
    const { range } = parse(InstallmentsDueQuerySchema, req.query);
    const today = todayIso();
    const ate = range === "today" ? today : addDays(today, 7);
    const rows = await prisma.installment.findMany({
      where: { status: { in: ["PENDENTE", "ATRASADO"] }, vencimento: { gte: dateOnly(today), lte: dateOnly(ate) } },
      include: { policy: { include: { insurer: true, client: { select: { id: true, nome: true, telefone: true } } } } },
      orderBy: { vencimento: "asc" },
      take: 500,
    });
    const data = rows.map((i) => ({
      ...installmentDTO(i),
      policy: { id: i.policy.id, numero: i.policy.numero, ramo: i.policy.ramo, formaPagamento: i.policy.formaPagamento, insurer: insurerSummary(i.policy.insurer) },
      client: i.policy.client,
    }));
    return { range, total: data.length, data };
  });

  app.get("/charts", async (): Promise<DashboardChartsDTO> => {
    const today = dateOnly(todayIso());
    const porSeguradora = await prisma.$queryRaw<Array<{ insurer_id: string; nome: string; apolices: bigint; premio: Prisma.Decimal | null }>>`
      SELECT i.id AS insurer_id, i.nome, COUNT(p.id) AS apolices, SUM(p.premio_total) AS premio
      FROM policies p JOIN insurers i ON i.id = p.insurer_id
      WHERE p.status <> 'CANCELADA' AND p.fim_vigencia >= ${today}::date
      GROUP BY i.id, i.nome ORDER BY apolices DESC`;
    const porRamo = await prisma.$queryRaw<Array<{ ramo: string; apolices: bigint; premio: Prisma.Decimal | null }>>`
      SELECT p.ramo, COUNT(p.id) AS apolices, SUM(p.premio_total) AS premio
      FROM policies p WHERE p.status <> 'CANCELADA' AND p.fim_vigencia >= ${today}::date
      GROUP BY p.ramo ORDER BY apolices DESC`;
    // "Novos" = apólices pelo mês de início de vigência; clientes = primeiro início de vigência do cliente.
    const desde = dateOnly(`${addDays(todayIso(), -365).slice(0, 7)}-01`);
    const novos = await prisma.$queryRaw<Array<{ mes: string; apolices: bigint; clientes: bigint }>>`
      WITH meses AS (
        SELECT to_char(m, 'YYYY-MM') AS mes FROM generate_series(${desde}::date, ${today}::date, interval '1 month') m
      ), ap AS (
        SELECT to_char(COALESCE(inicio_vigencia, emissao), 'YYYY-MM') AS mes, COUNT(*) AS n
        FROM policies WHERE COALESCE(inicio_vigencia, emissao) >= ${desde}::date GROUP BY 1
      ), cl AS (
        SELECT to_char(primeiro, 'YYYY-MM') AS mes, COUNT(*) AS n FROM (
          SELECT client_id, MIN(COALESCE(inicio_vigencia, emissao)) AS primeiro FROM policies GROUP BY client_id
        ) x WHERE primeiro >= ${desde}::date GROUP BY 1
      )
      SELECT meses.mes, COALESCE(ap.n, 0) AS apolices, COALESCE(cl.n, 0) AS clientes
      FROM meses LEFT JOIN ap USING (mes) LEFT JOIN cl USING (mes) ORDER BY meses.mes`;
    return {
      porSeguradora: porSeguradora.map((r) => ({ insurerId: r.insurer_id, nome: r.nome, apolices: Number(r.apolices), premio: money(r.premio) ?? "0.00" })),
      porRamo: porRamo.map((r) => ({ ramo: r.ramo, apolices: Number(r.apolices), premio: money(r.premio) ?? "0.00" })),
      novosPorMes: novos.map((r) => ({ mes: r.mes, apolices: Number(r.apolices), clientes: Number(r.clientes) })),
    };
  });

  app.get("/birthdays", async (req): Promise<{ scope: string; data: BirthdayDTO[] }> => {
    const { scope } = parse(BirthdaysQuerySchema, req.query);
    const today = todayIso();
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    const rows =
      scope === "today"
        ? await prisma.$queryRaw<Array<{ id: string; nome: string; nascimento: Date; telefone: string | null; status: "ATIVO" | "INATIVO"; opt_out: boolean }>>`
            SELECT id, nome, nascimento, telefone, status, opt_out FROM clients
            WHERE nascimento IS NOT NULL AND EXTRACT(MONTH FROM nascimento) = ${m} AND EXTRACT(DAY FROM nascimento) = ${d}
            ORDER BY nome`
        : await prisma.$queryRaw<Array<{ id: string; nome: string; nascimento: Date; telefone: string | null; status: "ATIVO" | "INATIVO"; opt_out: boolean }>>`
            SELECT id, nome, nascimento, telefone, status, opt_out FROM clients
            WHERE nascimento IS NOT NULL AND EXTRACT(MONTH FROM nascimento) = ${m}
            ORDER BY EXTRACT(DAY FROM nascimento), nome`;
    return {
      scope,
      data: rows.map((r) => {
        const nasc = toIsoDate(r.nascimento) ?? "";
        const [ny, nm, nd] = nasc.split("-").map(Number) as [number, number, number];
        const idade = y - ny - (m < nm || (m === nm && d < nd) ? 1 : 0);
        return { id: r.id, nome: r.nome, nascimento: nasc, idade, telefone: r.telefone, status: r.status, optOut: r.opt_out };
      }),
    };
  });
}
