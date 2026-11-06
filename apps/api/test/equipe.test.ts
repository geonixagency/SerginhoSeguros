// Equipe: convite por e-mail (link de 72 h), troca de perfil e remoção (desativação).
// Integração (INTEGRATION_DB) com usuários FICTÍCIOS, apagados no fim. E-mail substituído por função de teste.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UserInviteSchema } from "@ss/shared";

describe("UserInviteSchema", () => {
  it("normaliza e-mail e usa OPERADOR por padrão", () => {
    const r = UserInviteSchema.parse({ nome: "Fulano Teste", email: " Fulano@Exemplo.INVALID " });
    expect(r).toEqual({ nome: "Fulano Teste", email: "fulano@exemplo.invalid", perfil: "OPERADOR" });
    expect(UserInviteSchema.safeParse({ nome: "X", email: "nao-e-email" }).success).toBe(false);
  });
});

const enabled = Boolean(process.env.INTEGRATION_DB);
const DOM = "@equipe-teste.invalid";

describe.skipIf(!enabled)("equipe (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  const { setMailSenderForTests } = await import("../src/lib/mailer");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let admin: Record<string, string>;
  let adminId = "";
  const enviados: { to: string; text: string }[] = [];
  const limpar = () => prisma.user.deleteMany({ where: { email: { endsWith: DOM } } });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await limpar();
    const a = await prisma.user.create({ data: { nome: "Admin Teste", email: `admin${DOM}`, senhaHash: "x", perfil: "ADMIN" } });
    adminId = a.id;
    admin = { authorization: `Bearer ${app.jwt.sign({ sub: a.id, perfil: "ADMIN", nome: a.nome })}` };
    setMailSenderForTests(async (m) => {
      enviados.push({ to: m.to, text: m.text });
    });
  });

  afterAll(async () => {
    setMailSenderForTests(null);
    await limpar();
    await app?.close();
  });

  it("convida, o link define a senha e o convite não serve de novo", async () => {
    const r = await app.inject({ method: "POST", url: "/api/users/invite", headers: admin, payload: { nome: "Convidado Teste", email: `convidado${DOM}`, perfil: "OPERADOR" } });
    expect(r.statusCode).toBe(201);
    const body = r.json() as { user: { id: string; ultimoLogin: string | null }; emailEnviado: boolean; link?: string };
    expect(body.emailEnviado).toBe(true);
    expect(body.link).toBeUndefined();
    expect(body.user.ultimoLogin).toBeNull();
    const token = /token=([A-Za-z0-9_-]+)/.exec(enviados.at(-1)!.text)?.[1];
    const rec = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: body.user.id, usedAt: null } });
    expect(rec.expiresAt.getTime() - Date.now()).toBeGreaterThan(71 * 3600_000);

    // Senha aleatória: não entra antes de usar o link.
    const antes = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `convidado${DOM}`, senha: "senha do convidado 1" } });
    expect(antes.statusCode).toBe(401);
    const ok = await app.inject({ method: "POST", url: "/api/auth/reset-password", payload: { token, senha: "senha do convidado 1" } });
    expect(ok.statusCode).toBe(200);
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: `convidado${DOM}`, senha: "senha do convidado 1" } });
    expect(login.statusCode).toBe(200);

    // Quem já entrou não pode ser convidado de novo.
    const dup = await app.inject({ method: "POST", url: "/api/users/invite", headers: admin, payload: { nome: "Convidado Teste", email: `convidado${DOM}` } });
    expect(dup.statusCode).toBe(409);
  });

  it("muda perfil, remove (desativa) e protege o próprio usuário e o último admin", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: `convidado${DOM}` } });
    const p = await app.inject({ method: "PATCH", url: `/api/users/${u.id}`, headers: admin, payload: { perfil: "ADMIN" } });
    expect(p.json()).toMatchObject({ perfil: "ADMIN" });

    const self = await app.inject({ method: "DELETE", url: `/api/users/${adminId}`, headers: admin });
    expect(self.statusCode).toBe(400);

    const del = await app.inject({ method: "DELETE", url: `/api/users/${u.id}`, headers: admin });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toMatchObject({ ativo: false });
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(1); // soft delete

    const op = { authorization: `Bearer ${app.jwt.sign({ sub: u.id, perfil: "OPERADOR", nome: u.nome })}` };
    const negado = await app.inject({ method: "POST", url: "/api/users/invite", headers: op, payload: { nome: "X Y", email: `x${DOM}` } });
    expect(negado.statusCode).toBe(403);
  });

  it("não deixa rebaixar o próprio usuário", async () => {
    const r = await app.inject({ method: "PATCH", url: `/api/users/${adminId}`, headers: admin, payload: { perfil: "OPERADOR" } });
    expect(r.statusCode).toBe(400);
  });
});
