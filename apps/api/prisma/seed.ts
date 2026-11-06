// Seed idempotente: usuário admin, seguradoras, templates/réguas padrão e config de disparos.
// Rodar de novo NÃO sobrescreve o que foi editado na interface (só cria o que falta).
//   pnpm db:seed          -> dados base
//   pnpm db:seed:demo     -> + clientes FICTÍCIOS para demonstração (origem = DEMO)
import { PrismaClient, type Prisma, type RuleGatilho } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, randomInt } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { INSURER_CATALOG } from "../src/connectors/catalog";
import { DEFAULT_TEMPLATES } from "../src/modules/messaging/template";

for (const f of [".env.local", ".env"]) loadDotenv({ path: path.resolve(process.cwd(), f) });
const prisma = new PrismaClient();
const ENV_LOCAL = path.resolve(process.cwd(), ".env.local");

function ensureAdminPassword(): string {
  if (process.env.SEED_ADMIN_PASSWORD) return process.env.SEED_ADMIN_PASSWORD;
  // Gera senha forte e grava SÓ no .env.local (ignorado pelo git). Nunca imprime.
  const senha = randomBytes(18).toString("base64url");
  const prefix = existsSync(ENV_LOCAL) && !readFileSync(ENV_LOCAL, "utf8").endsWith("\n") ? "\n" : "";
  appendFileSync(ENV_LOCAL, `${prefix}SEED_ADMIN_PASSWORD=${senha}\n`);
  return senha;
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@serginhoseguros.com.br").toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return console.log(`• admin já existe (${email})`);
  const senha = ensureAdminPassword();
  await prisma.user.create({ data: { nome: "Administrador", email, perfil: "ADMIN", senhaHash: await bcrypt.hash(senha, 12) } });
  console.log(`• admin criado: ${email} (senha em apps/api/.env.local -> SEED_ADMIN_PASSWORD)`);
}

async function seedInsurers() {
  for (const e of INSURER_CATALOG) {
    await prisma.insurer.upsert({
      where: { slug: e.slug },
      update: {},
      create: {
        nome: e.nome,
        slug: e.slug,
        categoria: e.categoria ?? "SEGURADORA",
        ramos: e.ramos,
        portalUrl: e.portalUrl,
        temApi: e.temApi,
        statusIntegracao: e.temApi ? "NAO_CONFIGURADA" : "SEM_API",
        observacoes: e.apiNota,
      },
    });
  }
  console.log(`• ${INSURER_CATALOG.length} seguradoras/plataformas`);
}

const DEFAULT_RULES: Array<{ gatilho: RuleGatilho; nome: string; antecedenciaDias: number; horario: string; formasPagamento: Prisma.MessageRuleCreateInput["formasPagamento"] }> = [
  { gatilho: "PRIMEIRA_PARCELA", nome: "Lembrete da 1ª parcela", antecedenciaDias: 2, horario: "09:00", formasPagamento: ["BOLETO"] },
  { gatilho: "PROBLEMA_SEM_BOLETO", nome: "Problema no pagamento (sem boleto)", antecedenciaDias: -1, horario: "10:00", formasPagamento: [] },
  { gatilho: "PROBLEMA_COM_BOLETO", nome: "Problema no pagamento (com boleto)", antecedenciaDias: -1, horario: "10:00", formasPagamento: [] },
  { gatilho: "ANIVERSARIO", nome: "Feliz aniversário", antecedenciaDias: 0, horario: "08:00", formasPagamento: [] },
];

async function seedMessaging() {
  await prisma.messagingSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  for (const r of DEFAULT_RULES) {
    const t = DEFAULT_TEMPLATES[r.gatilho as keyof typeof DEFAULT_TEMPLATES];
    const template = await prisma.messageTemplate.upsert({
      where: { nome: t.nome },
      update: {},
      create: { nome: t.nome, conteudo: t.conteudo, gatilho: r.gatilho, anexarBoleto: t.anexarBoleto },
    });
    const exists = await prisma.messageRule.findFirst({ where: { gatilho: r.gatilho } });
    if (!exists) await prisma.messageRule.create({ data: { ...r, templateId: template.id } });
  }
  console.log("• templates e réguas padrão");
}

// ------------------------------------------------------------------ demo (dados fictícios)
function fakeCpf(): string {
  const n = Array.from({ length: 9 }, () => randomInt(10));
  for (const len of [9, 10]) {
    const s = n.slice(0, len).reduce((acc, d, i) => acc + d * (len + 1 - i), 0);
    n.push(((s * 10) % 11) % 10);
  }
  return n.join("");
}

async function seedDemo() {
  const nomes = ["Ana Demonstração", "Bruno Exemplo", "Carla Fictícia", "Diego Teste", "Elisa Amostra", "Fábio Modelo", "Gabi Simulada", "Hugo Protótipo"];
  const insurers = await prisma.insurer.findMany({ where: { categoria: "SEGURADORA" }, take: 6, orderBy: { nome: "asc" } });
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const add = (days: number) => new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + days));
  let criados = 0;
  for (const [idx, nome] of nomes.entries()) {
    const cpf = fakeCpf();
    if (await prisma.client.findFirst({ where: { nome, origem: "DEMO" } })) continue;
    const insurer = insurers[idx % insurers.length]!;
    const inicio = add(-300 + idx * 40);
    const fim = add(65 + idx * 7 - 60);
    const nascimento = idx === 0 ? new Date(Date.UTC(1985, hoje.getUTCMonth(), hoje.getUTCDate())) : new Date(Date.UTC(1970 + idx * 3, idx % 12, 10 + idx));
    await prisma.client.create({
      data: {
        nome,
        cpfCnpj: cpf,
        nascimento,
        telefone: `1199${String(1000000 + idx * 1111).slice(0, 7)}`,
        email: `demo${idx}@exemplo.invalid`,
        origem: "DEMO",
        status: fim >= add(0) ? "ATIVO" : "INATIVO",
        policies: {
          create: {
            insurerId: insurer.id,
            ramo: idx % 3 === 0 ? "residencial" : "auto",
            numero: `DEMO-${100000 + idx}`,
            emissao: inicio,
            inicioVigencia: inicio,
            fimVigencia: fim,
            premioTotal: 1500 + idx * 230.5,
            formaPagamento: idx % 2 === 0 ? "BOLETO" : "CARTAO",
            status: "VIGENTE",
            items: idx % 3 === 0 ? undefined : { create: { tipo: "VEICULO", placa: `DMO${idx}A${10 + idx}`, modelo: "Veículo Demo", ano: "2022" } },
            installments: {
              create: Array.from({ length: 4 }, (_, i) => ({
                numero: i + 1,
                valor: 380 + idx * 10,
                vencimento: add(idx === 1 && i === 0 ? 2 : -60 + i * 30 + idx),
                status: (i === 0 && idx !== 1 ? "PAGO" : "PENDENTE") as "PAGO" | "PENDENTE",
              })),
            },
          },
        },
      },
    });
    criados++;
  }
  await prisma.lead.createMany({
    data: [
      { nome: "Lead Demo Um", telefone: "11990000001", produto: "auto", origem: "site", etapa: "NOVO" },
      { nome: "Lead Demo Dois", telefone: "11990000002", produto: "residencial", origem: "indicação", etapa: "EM_CONTATO" },
    ],
    skipDuplicates: true,
  });
  console.log(`• demo: ${criados} clientes fictícios (hoje ${iso(hoje)})`);
}

async function main() {
  await seedAdmin();
  await seedInsurers();
  await seedMessaging();
  if (process.argv.includes("--demo")) await seedDemo();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
