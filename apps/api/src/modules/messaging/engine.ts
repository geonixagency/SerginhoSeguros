// Motor das réguas de disparo (prompt pai §8). Roda a cada hora pelo agendador.
//
// Idempotência: cada mensagem de régua tem dedupeKey único no banco
// (régua+parcela ou régua+cliente+ano). Rodar o tick 10x no mesmo dia gera as
// mesmas mensagens 1x. Uma régua é avaliada em todo tick a partir do seu horário
// (não só no tick exato), assim um tick perdido não perde o disparo do dia.
import type { FastifyBaseLogger } from "fastify";
import type { Installment, Insurer, MessageRule, MessageTemplate, Policy, Client, InsuredItem } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { addDays, dateOnly, formatBr, formatMoneyBr, localTime, todayIso, toIsoDate } from "../../lib/dates";
import { saveUpload } from "../../lib/storage";
import { connectorSupports, getConnector, loadCredential } from "../../connectors/registry";
import { robotCodeForSlug } from "../../connectors/portalRobot";
import { RobotSessionError } from "../../connectors/insurers/rpaBase";
import { createAndEnqueue } from "./service";
import { primeiroNome, renderTemplate, type TemplateVars } from "./template";

type RuleWithTemplate = MessageRule & { template: MessageTemplate };
type InstallmentCtx = Installment & { policy: Policy & { client: Client; insurer: Insurer; items: InsuredItem[] } };

export interface TickReport {
  regra: string;
  gatilho: string;
  criadas: number;
  avaliadas: number;
  erros: number;
}

export function varsFor(inst: InstallmentCtx): TemplateVars {
  return {
    nome: primeiroNome(inst.policy.client.nome),
    seguradora: inst.policy.insurer.nome,
    apolice: inst.policy.numero ?? inst.policy.proposta ?? "",
    valor: formatMoneyBr(inst.valor?.toFixed(2)),
    vencimento: formatBr(toIsoDate(inst.vencimento)),
    placa: inst.policy.items.find((i) => i.placa)?.placa ?? "",
  };
}

const horaDaRegra = (r: MessageRule) => Number(r.horario.split(":")[0] ?? 0);

/** Parcelas que vencem em `alvo`, filtradas pelos critérios da régua. */
/** Restringe a avaliação a alguns clientes (usado em testes e execuções pontuais). */
export interface TickScope {
  clientIds?: string[];
}

async function installmentsFor(rule: MessageRule, alvo: string, extra: { numero?: number; status: Installment["status"][] }, scope: TickScope) {
  return prisma.installment.findMany({
    where: {
      vencimento: dateOnly(alvo),
      status: { in: extra.status },
      ...(extra.numero ? { numero: extra.numero } : {}),
      policy: {
        status: { not: "CANCELADA" },
        ...(rule.formasPagamento.length ? { formaPagamento: { in: rule.formasPagamento } } : {}),
        ...(rule.seguradoras.length ? { insurer: { slug: { in: rule.seguradoras } } } : {}),
        client: { optOut: false, telefone: { not: null } },
        ...(scope.clientIds ? { clientId: { in: scope.clientIds } } : {}),
      },
    },
    include: { policy: { include: { client: true, insurer: true, items: true } } },
  });
}

async function runPrimeiraParcela(rule: RuleWithTemplate, today: string, scope: TickScope): Promise<TickReport> {
  const alvo = addDays(today, rule.antecedenciaDias); // padrão: 2 dias antes
  const list = await installmentsFor(rule, alvo, { numero: 1, status: ["PENDENTE"] }, scope);
  let criadas = 0;
  for (const inst of list) {
    const id = await createAndEnqueue({
      clientId: inst.policy.clientId,
      telefone: inst.policy.client.telefone!,
      conteudo: renderTemplate(rule.template.conteudo, varsFor(inst)),
      ruleId: rule.id,
      installmentId: inst.id,
      templateId: rule.templateId,
      dedupeKey: `rule-${rule.id}-inst-${inst.id}`,
    });
    if (id) criadas++;
  }
  return { regra: rule.nome, gatilho: rule.gatilho, criadas, avaliadas: list.length, erros: 0 };
}

/**
 * Régua "problema no pagamento" (D+1): pergunta ao conector se a parcela segue em aberto.
 * Se a seguradora devolve boleto -> régua COM boleto (PDF anexo); senão -> SEM boleto.
 * Só vale para seguradoras cujo conector implementa listInstallments.
 */
async function runProblemaPagamento(
  semBoleto: RuleWithTemplate | undefined,
  comBoleto: RuleWithTemplate | undefined,
  today: string,
  log: FastifyBaseLogger,
  scope: TickScope,
): Promise<TickReport[]> {
  const base = semBoleto ?? comBoleto;
  if (!base) return [];
  const alvo = addDays(today, base.antecedenciaDias); // padrão: -1 => ontem
  const list = (await installmentsFor(base, alvo, { status: ["PENDENTE", "ATRASADO"] }, scope)).filter((i) =>
    connectorSupports(i.policy.insurer.slug, "listInstallments"),
  );
  const rep = (r: RuleWithTemplate | undefined) => ({ regra: r?.nome ?? "-", gatilho: r?.gatilho ?? "-", criadas: 0, avaliadas: 0, erros: 0 });
  const rSem = rep(semBoleto);
  const rCom = rep(comBoleto);
  // Canal rpa: sessões de portal que caíram e não voltaram no login automático neste ciclo.
  // Não insistimos (captcha/2FA/limite diário): o SaaS pede login assistido e o próximo tick tenta de novo.
  const sessaoIndisponivel = new Set<string>();

  for (const inst of list) {
    const robo = robotCodeForSlug(inst.policy.insurer.slug);
    if (robo && sessaoIndisponivel.has(robo)) continue;
    // Robô roda poucas vezes por dia: cada parcela é conferida no portal no máximo 1x/dia
    // (o tick das réguas é de hora em hora).
    if (robo && inst.verificadoEm && todayIso(inst.verificadoEm) === today) continue;
    // Já avisado por qualquer uma das duas réguas? Evita chamar a seguradora à toa.
    const dedupe = `problema-inst-${inst.id}`;
    if (await prisma.message.findUnique({ where: { dedupeKey: dedupe }, select: { id: true } })) continue;
    if (!inst.policy.numero) continue;
    try {
      const cred = await loadCredential(inst.policy.insurer);
      if (!cred) continue;
      const connector = getConnector(inst.policy.insurer.slug);
      const ctx = { cpfCnpj: inst.policy.client.cpfCnpj };
      const remotas = await connector.listInstallments!(cred, inst.policy.numero, ctx);
      const remota = remotas.find((r) => r.numero === inst.numero);
      if (!remota) {
        if (robo) await prisma.installment.update({ where: { id: inst.id }, data: { verificadoEm: new Date() } });
        continue;
      }
      if (remota.status === "PAGO") {
        await prisma.installment.update({ where: { id: inst.id }, data: { status: "PAGO", pagoEm: new Date(), verificadoEm: new Date() } });
        continue;
      }
      await prisma.installment.update({ where: { id: inst.id }, data: { status: "ATRASADO", verificadoEm: new Date() } });

      let anexoDocumentId: string | null = null;
      if (comBoleto && remota.boletoDisponivel !== false && connector.capabilities.includes("getBoletoPdf")) {
        try {
          const pdf = await connector.getBoletoPdf!(cred, inst.policy.numero, inst.numero, ctx);
          const file = await saveUpload(pdf);
          const doc = await prisma.document.create({
            data: {
              clientId: inst.policy.clientId,
              policyId: inst.policyId,
              tipo: "BOLETO",
              nomeArquivo: `boleto-${inst.policy.numero}-parcela-${inst.numero}.pdf`,
              caminho: file.caminho,
              hash: file.hash,
              tamanho: file.tamanho,
            },
          });
          await prisma.installment.update({ where: { id: inst.id }, data: { boletoDocumentId: doc.id } });
          anexoDocumentId = doc.id;
        } catch (err) {
          log.warn({ err, installmentId: inst.id }, "seguradora não devolveu boleto; usando régua sem boleto");
        }
      }
      const rule = anexoDocumentId ? comBoleto! : semBoleto;
      if (!rule) continue; // régua correspondente desativada
      const r = anexoDocumentId ? rCom : rSem;
      r.avaliadas++;
      const id = await createAndEnqueue({
        clientId: inst.policy.clientId,
        telefone: inst.policy.client.telefone!,
        conteudo: renderTemplate(rule.template.conteudo, varsFor(inst)),
        ruleId: rule.id,
        installmentId: inst.id,
        templateId: rule.templateId,
        anexoDocumentId,
        dedupeKey: dedupe,
      });
      if (id) r.criadas++;
    } catch (err) {
      (rCom.regra !== "-" ? rCom : rSem).erros++;
      if (err instanceof RobotSessionError && robo) {
        sessaoIndisponivel.add(robo);
        await marcarSessaoIndisponivel(robo, err.message);
        log.warn({ insurer: inst.policy.insurer.slug, sessao: err.sessionStatus }, "sessão do portal indisponível; pulando a seguradora neste ciclo");
        continue;
      }
      log.error({ err, installmentId: inst.id, insurer: inst.policy.insurer.slug }, "falha ao consultar parcela no conector");
    }
  }
  return [semBoleto ? rSem : null, comBoleto ? rCom : null].filter((x): x is TickReport => !!x);
}

/** Reflete na tela Seguradoras que a sessão do robô precisa de atenção (login assistido). */
async function marcarSessaoIndisponivel(robo: string, motivo: string) {
  const slugs = robo === "tokio" ? ["tokio-marine"] : ["porto", "azul", "itau"];
  const insurers = await prisma.insurer.findMany({ where: { slug: { in: slugs } }, select: { id: true } });
  const ids = insurers.map((i) => i.id);
  await prisma.insurer.updateMany({ where: { id: { in: ids } }, data: { statusIntegracao: "ERRO" } });
  await prisma.insurerCredential.updateMany({ where: { insurerId: { in: ids } }, data: { ultimoTeste: new Date(), ultimoErro: motivo.slice(0, 300) } });
}

async function runAniversario(rule: RuleWithTemplate, today: string, scope: TickScope): Promise<TickReport> {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const all = await prisma.$queryRaw<Array<{ id: string; nome: string; telefone: string }>>`
    SELECT id, nome, telefone FROM clients
    WHERE status = 'ATIVO' AND opt_out = false AND telefone IS NOT NULL AND telefone <> ''
      AND nascimento IS NOT NULL AND EXTRACT(MONTH FROM nascimento) = ${m} AND EXTRACT(DAY FROM nascimento) = ${d}`;
  const clients = scope.clientIds ? all.filter((c) => scope.clientIds!.includes(c.id)) : all;
  let criadas = 0;
  for (const c of clients) {
    const id = await createAndEnqueue({
      clientId: c.id,
      telefone: c.telefone,
      conteudo: renderTemplate(rule.template.conteudo, { nome: primeiroNome(c.nome) }),
      ruleId: rule.id,
      templateId: rule.templateId,
      dedupeKey: `rule-${rule.id}-aniv-${c.id}-${y}`,
    });
    if (id) criadas++;
  }
  return { regra: rule.nome, gatilho: rule.gatilho, criadas, avaliadas: clients.length, erros: 0 };
}

/** Um "tick" do agendador. `now` injetável para testes e para execução manual. */
export async function runRulesTick(log: FastifyBaseLogger, now = new Date(), scope: TickScope = {}): Promise<TickReport[]> {
  const today = todayIso(now);
  const { hour } = localTime(now);
  const rules = (await prisma.messageRule.findMany({ where: { ativo: true }, include: { template: true } })).filter(
    (r) => r.template.ativo && hour >= horaDaRegra(r),
  );
  const reports: TickReport[] = [];
  for (const r of rules.filter((x) => x.gatilho === "PRIMEIRA_PARCELA")) reports.push(await runPrimeiraParcela(r, today, scope));
  for (const r of rules.filter((x) => x.gatilho === "ANIVERSARIO")) reports.push(await runAniversario(r, today, scope));
  reports.push(
    ...(await runProblemaPagamento(
      rules.find((x) => x.gatilho === "PROBLEMA_SEM_BOLETO"),
      rules.find((x) => x.gatilho === "PROBLEMA_COM_BOLETO"),
      today,
      log,
      scope,
    )),
  );
  if (rules.length && !scope.clientIds) await prisma.messageRule.updateMany({ where: { id: { in: rules.map((r) => r.id) } }, data: { ultimaExecucao: now } });
  log.info({ reports }, "réguas avaliadas");
  return reports;
}
