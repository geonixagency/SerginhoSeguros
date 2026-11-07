import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = Boolean(process.env.INTEGRATION_DB);
// Valores fictícios de teste (não são acessos reais).
const USUARIO = "usuario.teste.zz";
const SENHA_1 = "SenhaTeste#111";
const SENHA_2 = "SenhaTeste#222";

describe.skipIf(!enabled)("acessos dos portais (integração)", async () => {
  const { buildApp } = await import("../src/app");
  const { prisma } = await import("../src/lib/prisma");
  const { decryptSecret } = await import("../src/lib/secrets");
  const { markAccessRejected } = await import("../src/connectors/insurers/rpaBase");
  let app: Awaited<ReturnType<typeof buildApp>>;
  let auth: Record<string, string>;
  let operador: Record<string, string>;
  let insurerId = "";

  const limpar = () => prisma.insurer.deleteMany({ where: { slug: "zz-teste-acesso" } });
  const segredo = async () => {
    const c = await prisma.insurerCredential.findUniqueOrThrow({ where: { insurerId } });
    return JSON.parse(decryptSecret(c.segredoCriptografado)) as Record<string, string>;
  };

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    const admin = await prisma.user.findFirstOrThrow({ where: { perfil: "ADMIN", ativo: true } });
    auth = { authorization: `Bearer ${app.jwt.sign({ sub: admin.id, perfil: admin.perfil, nome: admin.nome })}` };
    operador = { authorization: `Bearer ${app.jwt.sign({ sub: admin.id, perfil: "OPERADOR", nome: admin.nome })}` };
    await limpar();
    insurerId = (await prisma.insurer.create({ data: { nome: "ZZ Teste Acesso", slug: "zz-teste-acesso", ramos: [] } })).id;
  });

  afterAll(async () => {
    await limpar();
    await app?.close();
  });

  it("cadastra, troca só a senha e nunca devolve o segredo", async () => {
    let r = await app.inject({ method: "PATCH", url: `/api/insurers/${insurerId}/credentials`, headers: auth, payload: { valores: { usuario: USUARIO, senha: SENHA_1 } } });
    expect(r.statusCode).toBe(200);
    expect(JSON.stringify(r.json())).not.toContain(SENHA_1);
    expect(await segredo()).toEqual({ usuario: USUARIO, senha: SENHA_1 });

    // Só a senha nova: o usuário continua o mesmo; campo vazio é ignorado.
    r = await app.inject({ method: "PATCH", url: `/api/insurers/${insurerId}/credentials`, headers: auth, payload: { valores: { senha: SENHA_2, usuario: "  " } } });
    expect(r.statusCode).toBe(200);
    expect(await segredo()).toEqual({ usuario: USUARIO, senha: SENHA_2 });

    r = await app.inject({ method: "GET", url: "/api/insurers/acessos", headers: auth });
    expect(r.statusCode).toBe(200);
    const body = r.body;
    expect(body).not.toContain(SENHA_1);
    expect(body).not.toContain(SENHA_2);
    expect(body).not.toContain(USUARIO);
    const item = (r.json().data as Array<{ insurerId: string; usaRobo: boolean; credencial: { campos: Record<string, string>; ultimoErro: string | null } | null }>).find((x) => x.insurerId === insurerId);
    expect(item?.usaRobo).toBe(false);
    expect(item?.credencial?.campos.senha).toBe("••••••••");
    expect(Object.keys(item?.credencial?.campos ?? {}).sort()).toEqual(["senha", "usuario"]);

    // Auditoria guarda só os nomes dos campos.
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entidadeId: insurerId, acao: "CREDENCIAL_ATUALIZADA" }, orderBy: { createdAt: "desc" } });
    expect(JSON.stringify(log)).not.toContain(SENHA_2);
  });

  it("remove campo, rejeita pedido vazio e exige ADMIN", async () => {
    let r = await app.inject({ method: "PATCH", url: `/api/insurers/${insurerId}/credentials`, headers: auth, payload: { valores: { susep: "12345" } } });
    expect(r.statusCode).toBe(200);
    r = await app.inject({ method: "PATCH", url: `/api/insurers/${insurerId}/credentials`, headers: auth, payload: { valores: {}, remover: ["susep"] } });
    expect(r.statusCode).toBe(200);
    expect(Object.keys(await segredo()).sort()).toEqual(["senha", "usuario"]);
    r = await app.inject({ method: "PATCH", url: `/api/insurers/${insurerId}/credentials`, headers: auth, payload: { valores: { senha: "" } } });
    expect(r.statusCode).toBe(400);
    r = await app.inject({ method: "PATCH", url: `/api/insurers/${insurerId}/credentials`, headers: operador, payload: { valores: { senha: SENHA_1 } } });
    expect(r.statusCode).toBe(403);
    r = await app.inject({ method: "GET", url: "/api/insurers/acessos", headers: operador });
    expect(r.statusCode).toBe(403);
  });

  it("robô marca o acesso como recusado e a nova senha limpa o erro", async () => {
    const tokio = await prisma.insurer.findUnique({ where: { slug: "tokio-marine" }, include: { credential: true } });
    if (!tokio) return; // seed sem Tokio: nada a verificar
    const tinha = Boolean(tokio.credential);
    if (!tinha) await prisma.insurerCredential.create({ data: { insurerId: tokio.id, tipo: "PORTAL", segredoCriptografado: "x", mascara: {} } });
    const antes = await prisma.insurer.findUniqueOrThrow({ where: { id: tokio.id }, include: { credential: true } });
    try {
      await markAccessRejected("tokio", "Senha recusada pelo portal");
      const c = await prisma.insurerCredential.findUniqueOrThrow({ where: { insurerId: tokio.id } });
      expect(c.ultimoErro).toBe("Senha recusada pelo portal");
      expect((await prisma.insurer.findUniqueOrThrow({ where: { id: tokio.id } })).statusIntegracao).toBe("ERRO");
    } finally {
      if (!tinha) await prisma.insurerCredential.delete({ where: { insurerId: tokio.id } });
      else await prisma.insurerCredential.update({ where: { insurerId: tokio.id }, data: { ultimoErro: antes.credential!.ultimoErro, ultimoTeste: antes.credential!.ultimoTeste } });
      await prisma.insurer.update({ where: { id: tokio.id }, data: { statusIntegracao: antes.statusIntegracao } });
    }
  });
});
