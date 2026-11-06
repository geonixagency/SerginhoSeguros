// Ritmo humano e limites diários (CLAUDE.md, regra 3: "poucas vezes por dia, com ritmo humano").
//
// - Pausas aleatórias entre passos e digitação tecla a tecla no login.
// - Orçamento diário por seguradora: poucos logins e um teto de consultas. Estourou -> recusa
//   até o dia seguinte (fuso America/Sao_Paulo) em vez de insistir no portal.
// - Credencial recusada bloqueia novos logins automáticos no dia (evita bloqueio da conta).
import type { RobotInsurer } from "./types";

export function randomBetween(min: number, max: number, rnd: () => number = Math.random): number {
  return Math.round(min + (max - min) * rnd());
}

/** Dia corrente em São Paulo (aaaa-mm-dd), para zerar os contadores à meia-noite local. */
export function diaLocal(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export interface BudgetLimits {
  loginsPorDia: number;
  consultasPorDia: number;
}

interface Contador {
  dia: string;
  logins: number;
  consultas: number;
  loginBloqueado: boolean;
}

export type BudgetKind = "login" | "consulta";

export class DailyBudget {
  private readonly porSeguradora = new Map<RobotInsurer, Contador>();

  constructor(
    private readonly limites: BudgetLimits,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  private atual(insurer: RobotInsurer): Contador {
    const dia = diaLocal(this.agora());
    let c = this.porSeguradora.get(insurer);
    if (!c || c.dia !== dia) {
      c = { dia, logins: 0, consultas: 0, loginBloqueado: false };
      this.porSeguradora.set(insurer, c);
    }
    return c;
  }

  /** Motivo da recusa, ou null se ainda há orçamento. Não consome. */
  motivoRecusa(insurer: RobotInsurer, tipo: BudgetKind): string | null {
    const c = this.atual(insurer);
    if (tipo === "login") {
      if (c.loginBloqueado) return "Login automático suspenso hoje: o portal recusou a credencial. Revise usuário/senha.";
      if (c.logins >= this.limites.loginsPorDia) return `Limite diário de logins automáticos atingido (${this.limites.loginsPorDia}). Tente amanhã ou faça o login assistido.`;
    } else if (c.consultas >= this.limites.consultasPorDia) {
      return `Limite diário de consultas ao portal atingido (${this.limites.consultasPorDia}).`;
    }
    return null;
  }

  consumir(insurer: RobotInsurer, tipo: BudgetKind) {
    const c = this.atual(insurer);
    if (tipo === "login") c.logins++;
    else c.consultas++;
  }

  bloquearLogin(insurer: RobotInsurer) {
    this.atual(insurer).loginBloqueado = true;
  }

  resumo(insurer: RobotInsurer) {
    const c = this.atual(insurer);
    return { dia: c.dia, logins: c.logins, consultas: c.consultas, loginBloqueado: c.loginBloqueado, ...this.limites };
  }
}
