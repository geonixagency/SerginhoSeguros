// SessionManager com páginas falsas: login automático, needs_human, credencial recusada,
// orçamento diário e ritmo humano. Nenhum navegador nem portal real; credenciais fictícias.
import { describe, expect, it } from "vitest";
import { FakePage } from "./fakePage";
import { SessionManager } from "../src/session";
import { DailyBudget, diaLocal } from "../src/pacing";
import { PORTO_HOME } from "../src/insurers/porto";
import { TOKIO_HOME } from "../src/insurers/tokio";
import type { PageSignals } from "../src/page";

const env = { ROBOT_HEADLESS: true, ROBOT_VNC_URL: undefined, ROBOT_MAX_LOGINS_PER_DAY: 2, ROBOT_MAX_QUERIES_PER_DAY: 3 };
const credFicticia = { usuario: "usuario-ficticio", senha: "senha-ficticia" };

/** Página cujos sinais mudam a cada chamada de signals() (simula a tela antes/depois do login). */
class ScriptedPage extends FakePage {
  private i = 0;
  constructor(private readonly roteiro: Array<Partial<PageSignals>>) {
    super({ routes: {} });
  }
  override async signals(): Promise<PageSignals> {
    const s = this.roteiro[Math.min(this.i++, this.roteiro.length - 1)]!;
    return { url: this.currentUrl(), campoSenha: false, captcha: false, segundoFator: false, texto: "", ...s };
  }
}

const manager = (page: FakePage, agora?: () => Date) => new SessionManager(env, async () => ({ page, close: async () => {} }), agora);

const LOGIN = { campoSenha: true, url: "https://ssoportais3.exemplo.invalid/openam/XUI/" };
const LOGADO = { campoSenha: false, url: TOKIO_HOME };

describe("SessionManager", () => {
  it("status valid quando a home abre sem tela de login", async () => {
    const r = await manager(new ScriptedPage([LOGADO])).status("tokio");
    expect(r).toMatchObject({ insurer: "tokio", status: "valid" });
    expect(r.pagina).not.toMatch(/\?/); // nunca devolve query string (pode ter token de SSO)
  });

  it("status expired quando cai no login", async () => {
    expect((await manager(new ScriptedPage([LOGIN])).status("tokio")).status).toBe("expired");
  });

  it("login automático: digita com ritmo humano e conclui", async () => {
    const page = new ScriptedPage([LOGIN, {}, {}, LOGADO]);
    const r = await manager(page).login("tokio", credFicticia);
    expect(r.status).toBe("valid");
    expect(page.typed.map((t) => t.length)).toEqual([credFicticia.usuario.length, credFicticia.senha.length]);
    expect(page.pauses).toBeGreaterThan(2);
    // A resposta nunca carrega a credencial.
    expect(JSON.stringify(r)).not.toContain(credFicticia.senha);
  });

  it("não refaz login se a sessão já está ativa (nem gasta orçamento)", async () => {
    const m = manager(new ScriptedPage([LOGADO]));
    expect((await m.login("porto", credFicticia)).detalhe).toMatch(/já estava ativa/);
    expect(m.budget.resumo("porto").logins).toBe(0);
  });

  it("captcha/2FA no login => needs_human", async () => {
    const page = new ScriptedPage([{ ...LOGIN, url: PORTO_HOME }, { segundoFator: true }]);
    const r = await manager(page).login("porto", credFicticia);
    expect(r.status).toBe("needs_human");
  });

  it("credencial recusada => invalid_credentials e suspende novos logins no dia", async () => {
    const page = new ScriptedPage([LOGIN, {}, {}, LOGIN, LOGIN]);
    const m = manager(page);
    expect((await m.login("tokio", credFicticia)).status).toBe("invalid_credentials");
    const segunda = await m.login("tokio", credFicticia);
    expect(segunda.status).toBe("needs_human");
    expect(segunda.detalhe).toMatch(/suspenso/);
  });

  it("limite diário de logins vira needs_human (sem insistir no portal)", async () => {
    const page = new ScriptedPage([LOGIN, {}, { captcha: true }]);
    const m = manager(page);
    await m.login("porto", credFicticia);
    await m.login("porto", credFicticia);
    const terceira = await m.login("porto", credFicticia);
    expect(terceira.detalhe).toMatch(/Limite diário de logins/);
    expect(m.budget.resumo("porto").logins).toBe(2);
  });

  it("consultas além do limite diário são recusadas com 429", async () => {
    const m = manager(new FakePage({ routes: {} }));
    for (let i = 0; i < 3; i++) await m.run("porto", async () => "ok");
    await expect(m.run("porto", async () => "ok")).rejects.toMatchObject({ code: "BUSY", httpStatus: 429 });
    // Tokio tem orçamento próprio.
    await expect(m.run("tokio", async () => "ok")).resolves.toBe("ok");
  });
});

describe("SessionManager.runLogged", () => {
  it("navega até o portal antes da consulta e executa com sessão válida", async () => {
    const page = new ScriptedPage([LOGADO]);
    const r = await manager(page).runLogged("tokio", async (p) => p.currentUrl());
    expect(r).toBe(TOKIO_HOME);
  });
  it("sessão caída => SESSION_EXPIRED (a API refaz o login)", async () => {
    await expect(manager(new ScriptedPage([LOGIN])).runLogged("tokio", async () => "x")).rejects.toMatchObject({ code: "SESSION_EXPIRED", httpStatus: 409 });
  });
  it("captcha na home => NEEDS_HUMAN", async () => {
    await expect(manager(new ScriptedPage([{ captcha: true }])).runLogged("porto", async () => "x")).rejects.toMatchObject({ code: "NEEDS_HUMAN" });
  });
});

describe("DailyBudget", () => {
  it("zera à meia-noite de São Paulo", () => {
    let agora = new Date("2026-11-06T23:00:00-03:00");
    const b = new DailyBudget({ loginsPorDia: 1, consultasPorDia: 1 }, () => agora);
    b.consumir("tokio", "login");
    b.bloquearLogin("tokio");
    expect(b.motivoRecusa("tokio", "login")).not.toBeNull();
    agora = new Date("2026-11-07T00:30:00-03:00");
    expect(b.motivoRecusa("tokio", "login")).toBeNull();
    expect(diaLocal(agora)).toBe("2026-11-07");
  });
});
