// Descrição declarativa de um portal: para onde navegar e como reconhecer a tela de login.
// Os fluxos de consulta ficam em cada arquivo de seguradora (tokio.ts, porto.ts).
import type { PageSignals, PortalPage } from "../page";
import type { LoginCredential, RobotInsurer, SessionStatus } from "../types";

export interface PortalDefinition {
  insurer: RobotInsurer;
  /** Página que exige sessão (usada para checar status e como destino pós-login). */
  homeUrl: string;
  /** Página de login do portal. */
  loginUrl: string;
  /**
   * Classifica a tela a partir dos sinais coletados (campo de senha, captcha, 2FA, url).
   * Retorna o status da sessão daquele ponto de vista — sem efeitos colaterais.
   */
  classify(signals: PageSignals): SessionStatus;
  /**
   * Preenche e envia o formulário de login. Não decide o resultado: quem chama recheca
   * o status depois. Deve devolver "needs_human" se detectar captcha/2FA no caminho.
   * Nunca registra nem devolve a senha.
   */
  submitLogin(page: PortalPage, cred: LoginCredential): Promise<"submitted" | "needs_human">;
}
