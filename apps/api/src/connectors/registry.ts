// Registro de conectores por slug + acesso às credenciais decifradas.
import type { Insurer } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { decryptSecret } from "../lib/secrets";
import { AggilizadorConnector } from "./aggilizador";
import { INSURER_CATALOG, canalDe } from "./catalog";
import { MockConnector } from "./mock";
import { PortoConnector } from "./insurers/porto";
import { TokioConnector } from "./insurers/tokio";
import { SkeletonConnector } from "./skeleton";
import type { Credential, InsurerConnector, IntegrationChannel } from "./types";

const connectors = new Map<string, InsurerConnector>();

// Conectores reais entram aqui conforme forem implementados.
connectors.set("aggilizador", new AggilizadorConnector());
// Canal rpa (portal-robot): Tokio e Porto. Azul e Itaú ficam na plataforma da Porto.
connectors.set("tokio-marine", new TokioConnector());
connectors.set("porto", new PortoConnector("porto"));
connectors.set("azul", new PortoConnector("azul"));
connectors.set("itau", new PortoConnector("itau"));
for (const e of INSURER_CATALOG) {
  if (!connectors.has(e.slug)) connectors.set(e.slug, new SkeletonConnector(e.slug, e.apiNota, canalDe(e)));
}

const demo = new Map<string, MockConnector>();

export function getConnector(slug: string): InsurerConnector {
  if (env.CONNECTORS_DEMO) {
    if (!demo.has(slug)) demo.set(slug, new MockConnector(slug));
    return demo.get(slug)!;
  }
  return connectors.get(slug) ?? new SkeletonConnector(slug, "Seguradora fora do catálogo.");
}

export function connectorSupports(slug: string, cap: InsurerConnector["capabilities"][number]): boolean {
  return getConnector(slug).capabilities.includes(cap);
}

export function connectorChannel(slug: string): IntegrationChannel {
  if (slug === "aggilizador") return "api";
  const e = INSURER_CATALOG.find((x) => x.slug === slug);
  return e ? canalDe(e) : "manual";
}

/** Credencial decifrada da seguradora (ou credencial vazia no modo demo). */
export async function loadCredential(insurer: Pick<Insurer, "id">): Promise<Credential | null> {
  const c = await prisma.insurerCredential.findUnique({ where: { insurerId: insurer.id } });
  if (!c) return env.CONNECTORS_DEMO ? { tipo: "DEMO", ambiente: "HOMOLOGACAO", valores: {} } : null;
  return { tipo: c.tipo, ambiente: c.ambiente, valores: JSON.parse(decryptSecret(c.segredoCriptografado)) as Record<string, string> };
}

/** Para testes: injeta um conector específico. */
export function registerConnector(c: InsurerConnector) {
  connectors.set(c.slug, c);
}
