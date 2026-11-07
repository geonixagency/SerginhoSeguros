// Meu perfil (nome e foto) e redefinição de senha por link no e-mail.
// Unitários sempre rodam; a integração (INTEGRATION_DB) cria um usuário FICTÍCIO e o apaga no fim.
// O envio de e-mail é substituído por uma função que só guarda a mensagem.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { ForgotPasswordSchema, ProfileUpdateSchema, ResetPasswordSchema } from "@ss/shared";

const PNG_1PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("schemas de perfil e senha", () => {
  it("ProfileUpdateSchema aceita nome e foto em data URL, recusa outros formatos", () => {
    expect(ProfileUpdateSchema.safeParse({ nome: "Vivian" }).success).toBe(true);
    expect(ProfileUpdateSchema.safeParse({ avatar: PNG_1PX }).success).toBe(true);
    expect(ProfileUpdateSchema.safeParse({ avatar: null }).success).toBe(true);
    expect(ProfileUpdateSchema.safeParse({}).success).toBe(false);
    expect(ProfileUpdateSchema.safeParse({ avatar: "https://exemplo.com/foto.png" }).success).toBe(false);
    expect(ProfileUpdateSchema.safeParse({ avatar: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
  });

  it("ResetPasswordSchema exige senha forte e token", () => {
    expect(ResetPasswordSchema.safeParse({ token: "x".repeat(43), senha: "curta" }).success).toBe(false);
    expect(ResetPasswordSchema.safeParse({ token: "x".repeat(43), senha: "uma senha boa 123" }).success).toBe(true);
    expect(ForgotPasswordSchema.parse({ email: " Fulano@Teste.COM " }).email).toBe("fulano@teste.com");
  });
});

const enabled = Boolean(process.env.INTEGRATION_DB);
const EMAIL = "perfil.teste@exemplo.invalid";

describe.skipIf(!enabled)("perfil e redefinição de senha (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  const { setMailSenderForTests } = await import("../src/lib/mailer");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  let userId = "";
  const enviados: { to: string; text: string }[] = [];

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    const u = await prisma.user.create({ data: { nome: "Usuário Teste Perfil", email: EMAIL, senhaHash: await bcrypt.hash("senha antiga 123", 4), perfil: "OPERADOR" } });
    userId = u.id;
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: u.id, perfil: u.perfil, nome: u.nome })}` };
  });

  afterAll(async () => {
    setMailSenderForTests(null);
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await app?.close();
  });

  it("PATCH /auth/me atualiza nome e foto; /auth/me devolve o avatar", async () => {
    const r = await app.inject({ method: "PATCH", url: "/api/auth/me", headers: auth, payload: { nome: "Teste Renomeado", avatar: PNG_1PX } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ nome: "Teste Renomeado", avatar: PNG_1PX });
    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth });
    expect((me.json() as { avatar: string }).avatar).toBe(PNG_1PX);
    const rm = await app.inject({ method: "PATCH", url: "/api/auth/me", headers: auth, payload: { avatar: null } });
    expect((rm.json() as { avatar: string | null }).avatar).toBeNull();
  });

  it("PATCH /auth/me exige login", async () => {
    const r = await app.inject({ method: "PATCH", url: "/api/auth/me", payload: { nome: "X Y" } });
    expect(r.statusCode).toBe(401);
  });

  it("forgot-password sem SMTP responde 503 com mensagem clara", async () => {
    setMailSenderForTests(null);
    const { isMailConfigured } = await import("../src/lib/mailer");
    if (isMailConfigured()) return; // ambiente com SMTP real: não testa este caminho
    const r = await app.inject({ method: "POST", url: "/api/auth/forgot-password", payload: { email: EMAIL } });
    expect(r.statusCode).toBe(503);
    expect((r.json() as { error: { message: string } }).error.message).toMatch(/SMTP/);
  });

  it("fluxo completo: pede link, redefine, link não serve duas vezes", async () => {
    setMailSenderForTests(async (m) => {
      enviados.push({ to: m.to, text: m.text });
    });
    const desconhecido = await app.inject({ method: "POST", url: "/api/auth/forgot-password", payload: { email: "ninguem@exemplo.invalid" } });
    expect(desconhecido.statusCode).toBe(200);
    expect(enviados).toHaveLength(0);

    const r = await app.inject({ method: "POST", url: "/api/auth/forgot-password", payload: { email: EMAIL } });
    expect(r.statusCode).toBe(200);
    await new Promise((res) => setTimeout(res, 20));
    expect(enviados).toHaveLength(1);
    const token = /token=([A-Za-z0-9_-]+)/.exec(enviados[0]!.text)?.[1];
    expect(token).toBeTruthy();
    // No banco só o hash.
    expect(await prisma.passwordResetToken.count({ where: { userId, tokenHash: token! } })).toBe(0);

    const fraca = await app.inject({ method: "POST", url: "/api/auth/reset-password", payload: { token, senha: "123" } });
    expect(fraca.statusCode).toBe(400);
    const ok = await app.inject({ method: "POST", url: "/api/auth/reset-password", payload: { token, senha: "senha nova forte 456" } });
    expect(ok.statusCode).toBe(200);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(await bcrypt.compare("senha nova forte 456", u.senhaHash)).toBe(true);

    const reuso = await app.inject({ method: "POST", url: "/api/auth/reset-password", payload: { token, senha: "outra senha forte 789" } });
    expect(reuso.statusCode).toBe(400);
  });

  it("link expirado é recusado", async () => {
    const { sha256 } = await import("../src/lib/crypto");
    const token = "token-expirado-de-teste-0123456789abcdef";
    await prisma.passwordResetToken.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() - 1000) } });
    const r = await app.inject({ method: "POST", url: "/api/auth/reset-password", payload: { token, senha: "senha nova forte 456" } });
    expect(r.statusCode).toBe(400);
  });
});
