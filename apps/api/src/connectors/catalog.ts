// Catálogo de seguradoras/plataformas (seed + aliases usados pelo parser e pela importação).
// Situação de API resumida de _pesquisa/apis_seguradoras.md (05/11/2026):
// praticamente nenhuma seguradora oferece API self-service ao corretor para
// pós-venda (boleto, parcelas). As com API conhecida são B2B, sob contrato.

import type { IntegrationChannel } from "./types";

export interface InsurerCatalogEntry {
  nome: string;
  slug: string;
  categoria?: "SEGURADORA" | "PLATAFORMA";
  ramos: string[];
  portalUrl: string | null;
  /** API conhecida (confirmada/provável), mesmo que só sob contrato. */
  temApi: boolean;
  apiNota: string;
  /** Canal declarado; padrão: "api" se temApi, senão "import" (carteira por PDF + ações manuais). */
  canal?: IntegrationChannel;
  /** Formas como o nome aparece em PDFs/planilhas (comparação sem acento, minúsculas). */
  aliases: string[];
}

const AUTO = ["auto", "residencial", "empresarial", "vida"];

export const INSURER_CATALOG: InsurerCatalogEntry[] = [
  { nome: "Porto", slug: "porto", ramos: [...AUTO, "condominio", "consorcio"], portalUrl: "https://corretor.portoseguro.com.br", temApi: false, canal: "rpa", apiNota: "Sem API pública; Corretor Online. API só por parceria comercial.", aliases: ["porto seguro", "porto"] },
  { nome: "Tokio Marine", slug: "tokio-marine", ramos: [...AUTO, "garantia"], portalUrl: "https://www.tokiomarine.com.br", temApi: true, canal: "rpa", apiNota: "API provável só para Seguro Garantia (Portal Parceiros). Auto sem API documentada.", aliases: ["tokio marine", "tokio"] },
  { nome: "Bradesco", slug: "bradesco", ramos: [...AUTO], portalUrl: "https://www.bradescoseguros.com.br", temApi: true, apiNota: "Portal de APIs confirmado (vendas MAS: vida/viagem/empresarial). Sem boleto/sinistro. Onboarding de parceiro.", aliases: ["bradesco", "bradesco seguros", "bradesco auto"] },
  { nome: "Allianz", slug: "allianz", ramos: AUTO, portalUrl: "https://www.allianznet.com.br", temApi: false, apiNota: "Sem API pública no Brasil (AllianzNet).", aliases: ["allianz"] },
  { nome: "Yelum", slug: "yelum", ramos: AUTO, portalUrl: "https://www.yelum.com.br", temApi: false, apiNota: "Sem evidência de API.", aliases: ["yelum", "liberty", "liberty/yelum", "liberty seguros"] },
  { nome: "Zurich", slug: "zurich", ramos: [...AUTO, "garantia"], portalUrl: "https://www.zurich.com.br", temApi: true, apiNota: "API B2B provável (bancos/Garantia), sob contrato.", aliases: ["zurich"] },
  { nome: "Suhai", slug: "suhai", ramos: ["auto", "moto"], portalUrl: "https://www.suhaiseguradora.com", temApi: false, apiNota: "Sem evidência de API.", aliases: ["suhai"] },
  { nome: "Mapfre", slug: "mapfre", ramos: AUTO, portalUrl: "https://www.mapfre.com.br", temApi: false, apiNota: "Sem API pública (Mapfre Negócios).", aliases: ["mapfre"] },
  { nome: "HDI", slug: "hdi", ramos: AUTO, portalUrl: "https://www.hdi.com.br", temApi: false, apiNota: "Sem API pública (HDI+Corretor).", aliases: ["hdi", "hdi seguros"] },
  { nome: "AXA", slug: "axa", ramos: ["empresarial", "rc", "vida"], portalUrl: "https://www.axa.com.br", temApi: false, apiNota: "Sem evidência de API no Brasil.", aliases: ["axa", "axa seguros"] },
  { nome: "Akad", slug: "akad", ramos: ["empresarial", "rc", "residencial"], portalUrl: "https://www.akadseguros.com.br", temApi: true, apiNota: "API B2B provável (InsureMO), sob contrato.", aliases: ["akad"] },
  { nome: "Junto", slug: "junto", ramos: ["garantia", "rc"], portalUrl: "https://www.juntoseguros.com", temApi: true, apiNota: "API privada forte para Garantia (ms-gateway). Pedir credencial à Junto.", aliases: ["junto", "junto seguros"] },
  { nome: "MBM", slug: "mbm", ramos: ["auto", "vida"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["mbm", "mbm seguradora"] },
  { nome: "Darwin", slug: "darwin", ramos: ["auto"], portalUrl: "https://www.darwinseguros.com", temApi: false, apiNota: "Sem API pública (Darwin One).", aliases: ["darwin", "darwin seguros"] },
  { nome: "Justos", slug: "justos", ramos: ["auto"], portalUrl: "https://www.justos.com.br", temApi: false, apiNota: "Sem API própria; cotação via multicálculo.", aliases: ["justos"] },
  { nome: "Icatu", slug: "icatu", ramos: ["vida", "previdencia"], portalUrl: "https://www.icatuseguros.com.br", temApi: true, apiNota: "Portal de APIs de parceiros provável (vida/previdência).", aliases: ["icatu"] },
  { nome: "Novo", slug: "novo", ramos: ["auto"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["novo seguros", "novo"] },
  { nome: "Ezze", slug: "ezze", ramos: ["auto", "viagem", "vida"], portalUrl: "https://www.ezzeseguros.com.br", temApi: false, apiNota: "Integrações B2B pontuais; sem API pública.", aliases: ["ezze", "ezze seguros"] },
  { nome: "BP", slug: "bp", ramos: AUTO, portalUrl: null, temApi: false, apiNota: "Nome ambíguo (BB Seguros/Brasilseg/Brasilprev?) — confirmar com o Serginho.", aliases: ["bp", "brasilseg", "bb seguros"] },
  { nome: "Pier", slug: "pier", ramos: ["auto", "moto", "celular"], portalUrl: "https://www.pier.digital", temApi: false, apiNota: "Sem API pública.", aliases: ["pier"] },
  { nome: "Youse", slug: "youse", ramos: ["auto", "residencial", "vida"], portalUrl: "https://www.youse.com.br", temApi: true, apiNota: "Youse Negócios: APIs para parceiros (doc não localizada).", aliases: ["youse"] },
  { nome: "Usebens", slug: "usebens", ramos: ["auto", "residencial"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["usebens"] },
  { nome: "MetLife", slug: "metlife", ramos: ["vida", "odonto"], portalUrl: "https://www.metlife.com.br", temApi: true, apiNota: "MetLife Xcelerator (B2B, contrato).", aliases: ["metlife"] },
  { nome: "Excelsior", slug: "excelsior", ramos: ["auto", "residencial"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["excelsior"] },
  { nome: "Azul", slug: "azul", ramos: ["auto"], portalUrl: "https://www.azulseguros.com.br", temApi: false, canal: "rpa", apiNota: "Unificada na plataforma Porto; sem API pública.", aliases: ["azul", "azul seguros"] },
  { nome: "Itaú", slug: "itau", ramos: ["auto", "residencial", "vida"], portalUrl: "https://www.itau.com.br/seguros", temApi: false, canal: "rpa", apiNota: "Auto unificado na plataforma Porto; sem API pública.", aliases: ["itau", "itau seguros"] },
  { nome: "Mitsui Sumitomo", slug: "mitsui-sumitomo", ramos: AUTO, portalUrl: "https://www.msig.com.br", temApi: false, apiNota: "Sem evidência de API.", aliases: ["mitsui", "mitsui sumitomo", "msig"] },
  { nome: "Sompo", slug: "sompo", ramos: [...AUTO, "agro"], portalUrl: "https://www.sompo.com.br", temApi: true, apiNota: "Portal Developers confirmado (corporativo/agro). Auto pessoa física sem API.", aliases: ["sompo"] },
  // Extras que o extrator de PDF já reconhece (aparecem na carteira histórica).
  { nome: "Essor", slug: "essor", ramos: ["auto", "rc"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["essor"] },
  { nome: "Sura", slug: "sura", ramos: ["auto"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["sura", "seguros sura"] },
  { nome: "MAG", slug: "mag", ramos: ["vida"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["mag", "mag seguros", "mongeral"] },
  { nome: "Cardif", slug: "cardif", ramos: ["vida", "prestamista"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["cardif"] },
  { nome: "Sancor", slug: "sancor", ramos: ["auto", "agro"], portalUrl: null, temApi: false, apiNota: "Sem evidência de API.", aliases: ["sancor"] },
  // Plataforma de multicálculo (cotações).
  { nome: "Aggilizador", slug: "aggilizador", categoria: "PLATAFORMA", ramos: ["auto", "residencial", "vida", "empresarial"], portalUrl: "https://aggilizador.com.br", temApi: true, canal: "api", apiNota: "API pública de cotação (Swagger em api.aggilizador.com.br). Faltam os IDs da corretora (InsuranceBrokerId/BrokerId/CompanyId/Partner).", aliases: ["aggilizador", "agger"] },
];

export const canalDe = (e: InsurerCatalogEntry): IntegrationChannel => e.canal ?? (e.temApi ? "api" : "import");

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Resolve um nome livre ("Liberty/Yelum", "PORTO SEGURO CIA") para o slug do catálogo. */
export function resolveInsurerSlug(nome: string | null | undefined): string | null {
  if (!nome) return null;
  const n = norm(nome);
  let best: { slug: string; len: number } | null = null;
  for (const e of INSURER_CATALOG) {
    for (const a of [e.slug.replace(/-/g, " "), e.nome, ...e.aliases]) {
      const an = norm(a);
      const hit = n === an || new RegExp(`(^|[ /])${an.replace(/[/]/g, "\\/")}($|[ /])`).test(n);
      if (hit && (!best || an.length > best.len)) best = { slug: e.slug, len: an.length };
    }
  }
  return best?.slug ?? null;
}
