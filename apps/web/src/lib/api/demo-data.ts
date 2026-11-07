/**
 * MODO DEMO — base fictícia gerada de forma determinística.
 * Todos os nomes, CPFs, telefones e placas são INVENTADOS. Nenhum dado real de cliente.
 */
import type {
  Claim,
  Client,
  DocumentFile,
  FormaPagamento,
  Installment,
  Insurer,
  InsurerCredential,
  Lead,
  LeadOrigem,
  LeadStage,
  Message,
  MessageRule,
  MessageTemplate,
  Policy,
  Quote,
  Ramo,
  TimelineEvent,
  WhatsappInstance,
} from "../types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Ana", "Bruno", "Carla", "Diego", "Eduarda", "Fábio", "Gabriela", "Henrique", "Isabela", "João",
  "Larissa", "Marcelo", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Thiago", "Vanessa", "Wagner",
  "Beatriz", "Caio", "Débora", "Elias", "Fernanda", "Gustavo", "Helena", "Igor", "Juliana", "Lucas",
  "Mariana", "Nelson", "Olívia", "Pedro", "Renata", "Samuel", "Tatiane", "Vinícius", "Yasmin", "Zeca",
  "Adriana", "Rodrigo", "Patrícia", "Leandro", "Cristina", "Márcio", "Simone", "André", "Luciana", "Murilo",
];
const LAST = [
  "Albuquerque", "Barreto", "Cardoso", "Domingues", "Esteves", "Falcão", "Guimarães", "Hidalgo", "Junqueira",
  "Lacerda", "Macedo", "Nogueira", "Ortega", "Pacheco", "Quintela", "Rezende", "Sampaio", "Teixeira", "Uchôa",
  "Valadares", "Werneck", "Xavier", "Zanetti", "Brandão", "Coutinho", "Figueira", "Leme", "Moura", "Pimentel",
  "Siqueira", "Toledo", "Vasconcelos", "Arruda", "Bittencourt", "Campello", "Dantas",
];
const EMPRESAS = [
  "Padaria Trigo Dourado Ltda", "Oficina Pistão Forte ME", "Clínica Sorriso Pleno", "Mercadinho Bom Preço",
  "Studio Linha Fina Arquitetura", "Auto Peças Rota 40", "Escritório Contábil Balanço Certo", "Pet Shop Patas & Cia",
];
const BAIRROS = ["Centro", "Jardim América", "Vila Nova", "Santa Mônica", "Parque das Flores", "Boa Vista", "Alto da Colina", "Jardim Europa"];
const CIDADES: [string, string][] = [
  ["Ribeirão Preto", "SP"], ["Campinas", "SP"], ["Uberlândia", "MG"], ["Sertãozinho", "SP"], ["Franca", "SP"], ["São Carlos", "SP"],
];
const RUAS = ["Rua das Acácias", "Av. Brasil", "Rua Sete de Setembro", "Rua Tiradentes", "Av. Independência", "Rua Duque de Caxias", "Rua São José", "Al. dos Ipês"];
const VEICULOS: [string, number][] = [
  ["VW T-Cross 1.0 TSI", 2023], ["Fiat Strada Volcano", 2022], ["Chevrolet Onix LT", 2021], ["Toyota Corolla XEi", 2020],
  ["Hyundai HB20 Comfort", 2022], ["Jeep Compass Longitude", 2021], ["Honda HR-V EXL", 2023], ["Renault Kwid Zen", 2019],
  ["Fiat Toro Freedom", 2022], ["VW Nivus Highline", 2024], ["Nissan Kicks SV", 2021], ["Toyota Hilux SRV", 2020],
];

export const INSURERS_BASE: Omit<Insurer, "clientes" | "apolices">[] = [
  { id: "ins-porto", nome: "Porto Seguro", slug: "porto", ramos: ["AUTO", "RESIDENCIAL", "VIDA", "EMPRESARIAL", "CONSORCIO"], portalUrl: "https://corretor.portoseguro.com.br", temApi: true, canal: "rpa", statusIntegracao: "CONECTADA", capacidades: ["testConnection", "findPolicy", "listInstallments", "getBoletoPdf", "getPolicyStatus", "getClaims"], ultimoTeste: null, cor: "#1d4f91" },
  { id: "ins-allianz", nome: "Allianz", slug: "allianz", ramos: ["AUTO", "RESIDENCIAL", "EMPRESARIAL"], portalUrl: "https://www.allianznet.com.br", temApi: true, canal: "api", statusIntegracao: "CONECTADA", capacidades: ["testConnection", "findPolicy", "listInstallments", "getBoletoPdf", "getPolicyStatus"], ultimoTeste: null, cor: "#003781" },
  { id: "ins-tokio", nome: "Tokio Marine", slug: "tokio", ramos: ["AUTO", "RESIDENCIAL", "VIDA", "EMPRESARIAL"], portalUrl: "https://portalparceiros.tokiomarine.com.br", temApi: true, canal: "rpa", statusIntegracao: "ERRO", capacidades: ["testConnection", "findPolicy", "listInstallments", "getPolicyStatus"], ultimoTeste: null, cor: "#0a7a5a" },
  { id: "ins-hdi", nome: "HDI Seguros", slug: "hdi", ramos: ["AUTO", "RESIDENCIAL", "EMPRESARIAL"], portalUrl: "https://www.hdi.com.br/corretor", temApi: true, canal: "api", statusIntegracao: "CONECTADA", capacidades: ["testConnection", "findPolicy", "listInstallments", "getBoletoPdf"], ultimoTeste: null, cor: "#0f6e3a" },
  { id: "ins-bradesco", nome: "Bradesco Seguros", slug: "bradesco", ramos: ["AUTO", "VIDA", "RESIDENCIAL"], portalUrl: "https://www.bradescoseguros.com.br/corretor", temApi: false, canal: "import", statusIntegracao: "MANUAL", capacidades: [], ultimoTeste: null, cor: "#cc092f" },
  { id: "ins-mapfre", nome: "Mapfre", slug: "mapfre", ramos: ["AUTO", "VIDA", "RESIDENCIAL", "IMOBILIARIO"], portalUrl: "https://negocios.mapfre.com.br", temApi: true, canal: "api", statusIntegracao: "NAO_CONFIGURADA", capacidades: ["testConnection", "findPolicy", "getPolicyStatus"], ultimoTeste: null, cor: "#d81e05" },
  { id: "ins-azul", nome: "Azul Seguros", slug: "azul", ramos: ["AUTO"], portalUrl: "https://www.azulseguros.com.br/corretor", temApi: true, canal: "rpa", statusIntegracao: "CONECTADA", capacidades: ["testConnection", "findPolicy", "listInstallments", "getBoletoPdf", "getPolicyStatus"], ultimoTeste: null, cor: "#0072bc" },
  { id: "ins-sulamerica", nome: "SulAmérica", slug: "sulamerica", ramos: ["VIDA", "EMPRESARIAL"], portalUrl: "https://portal.sulamerica.com.br", temApi: false, canal: "import", statusIntegracao: "MANUAL", capacidades: [], ultimoTeste: null, cor: "#f47920" },
  { id: "ins-yelum", nome: "Yelum Seguros", slug: "yelum", ramos: ["AUTO", "RESIDENCIAL", "IMOBILIARIO"], portalUrl: "https://www.yelumseguros.com.br", temApi: true, canal: "api", statusIntegracao: "CONECTADA", capacidades: ["testConnection", "findPolicy", "listInstallments", "getPolicyStatus"], ultimoTeste: null, cor: "#4b2c83" },
  { id: "ins-porto-cons", nome: "Porto Consórcio", slug: "porto-consorcio", ramos: ["CONSORCIO"], portalUrl: "https://consorcio.portoseguro.com.br", temApi: false, canal: "import", statusIntegracao: "MANUAL", capacidades: [], ultimoTeste: null, cor: "#2a6fc9" },
];

const DAY = 86400000;
function iso(d: number) {
  return new Date(d).toISOString();
}
function startOfToday() {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d.getTime();
}

function cpf(rand: () => number) {
  let s = "";
  for (let i = 0; i < 11; i++) s += Math.floor(rand() * 10);
  return s;
}
function plate(rand: () => number) {
  const L = "ABCDEFGHJKLMNPRSTUVWXYZ";
  const c = () => L[Math.floor(rand() * L.length)];
  return `${c()}${c()}${c()}${Math.floor(rand() * 10)}${c()}${Math.floor(rand() * 10)}${Math.floor(rand() * 10)}`;
}

export interface DemoDB {
  clients: Client[];
  policies: Policy[];
  installments: Installment[];
  insurers: Insurer[];
  credentials: InsurerCredential[];
  documents: DocumentFile[];
  timeline: Record<string, TimelineEvent[]>;
  leads: Lead[];
  quotes: Quote[];
  templates: MessageTemplate[];
  rules: MessageRule[];
  messages: Message[];
  instance: WhatsappInstance;
  /** Ritmo dos disparos (criado na primeira leitura; demos antigos no navegador não têm). */
  pacing?: { intervaloMinSeg: number; intervaloMaxSeg: number; loteTamanho: number; lotePausaMin: number };
  /** Anexos de mensagem subidos no demo (id -> nome). */
  anexos?: Record<string, string>;
  /** Sinistros registrados no demo. */
  claims?: Claim[];
}

export const DEFAULT_RULE_TEXTS = {
  PRIMEIRA_PARCELA:
    "Oi {{nome}}, tudo bem? Passando para lembrar que a primeira parcela de seu seguro vence em 2 dias, é importante se atentar para que não haja problemas na vigência e cobertura de seu seguro, caso ainda não tenha recebido o boleto para pagamento favor nos contatar!",
  PROBLEMA_SEM_BOLETO:
    "Olá {{nome}}, tudo bem? Informação importante sobre seu seguro! Houve um problema com o pagamento e sua cobertura pode ser afetada, favor entre em contato para normalizar sua cobertura. Caso já tenha regularizado favor desconsiderar mensagem.",
  PROBLEMA_COM_BOLETO:
    "Olá {{nome}}, tudo bem? Informação importante sobre seu seguro! Houve um problema com o pagamento e sua cobertura pode ser afetada, se ainda não regularizou você pode realizar o pagamento pelo boleto abaixo:",
  ANIVERSARIO:
    "Bom dia {{nome}}, tudo bem! Hoje é seu dia e a Serginho Seguros está passando para lhe desejar Feliz Aniversário, muitas felicidades!",
  RENOVACAO:
    "Olá {{nome}}! Seu seguro {{seguradora}} (apólice {{apolice}}) vence em {{vencimento}}. Já estamos preparando a renovação com as melhores condições. Podemos conversar?",
};

export function buildDemoDB(): DemoDB {
  const rand = mulberry32(20261106);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
  const today = startOfToday();

  const clients: Client[] = [];
  const policies: Policy[] = [];
  const installments: Installment[] = [];
  const documents: DocumentFile[] = [];
  const timeline: Record<string, TimelineEvent[]> = {};
  const insurers = INSURERS_BASE.map((i) => ({ ...i, clientes: 0, apolices: 0, ultimoTeste: iso(today - between(1, 40) * 3600000) }));

  const N = 132;
  const used = new Set<string>();
  for (let i = 0; i < N; i++) {
    const isPJ = i % 17 === 5;
    let nome = isPJ ? EMPRESAS[(i / 17) | 0 % EMPRESAS.length] ?? pick(EMPRESAS) : `${pick(FIRST)} ${pick(LAST)}${rand() > 0.6 ? " " + pick(LAST) : ""}`;
    while (used.has(nome)) nome = `${pick(FIRST)} ${pick(LAST)} ${pick(LAST)}`;
    used.add(nome);
    const id = `cli-${String(i + 1).padStart(4, "0")}`;
    const [cidade, uf] = pick(CIDADES);
    // aniversariantes: garante alguns hoje e nesta semana
    let nasc = new Date(today - between(22, 72) * 365.25 * DAY - between(0, 364) * DAY);
    if (i === 3 || i === 41) {
      const t = new Date(today);
      nasc = new Date(t.getFullYear() - between(30, 60), t.getMonth(), t.getDate(), 12);
    } else if (i === 12 || i === 77 || i === 90) {
      const t = new Date(today + between(1, 6) * DAY);
      nasc = new Date(t.getFullYear() - between(25, 65), t.getMonth(), t.getDate(), 12);
    }
    const criado = i < 9 ? today - between(0, 20) * DAY : today - between(40, 5 * 365) * DAY;
    const first = nome.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    clients.push({
      id,
      nome,
      cpfCnpj: isPJ ? cpf(rand) + "000" : cpf(rand),
      nascimento: isPJ ? null : iso(nasc.getTime()),
      cnh: isPJ ? null : String(between(10000000000, 99999999999)),
      telefone: `5516${9}${between(10000000, 99999999)}`,
      email: rand() > 0.15 ? `${first}.${between(10, 99)}@exemplo.com.br` : null,
      endereco: {
        logradouro: pick(RUAS),
        numero: String(between(12, 2400)),
        bairro: pick(BAIRROS),
        cidade,
        uf,
        cep: `14${between(100, 999)}-${between(100, 999)}`,
      },
      status: "ATIVO",
      origem: pick(["indicacao", "site", "whatsapp", "carteira", "instagram"]),
      optOut: i % 31 === 7,
      criadoEm: iso(criado),
    });

    // apólices
    const nPol = rand() > 0.75 ? 2 : 1;
    for (let p = 0; p < nPol; p++) {
      const ramo: Ramo = isPJ ? "EMPRESARIAL" : p === 0 ? (rand() > 0.38 ? "AUTO" : pick(["VIDA", "RESIDENCIAL", "IMOBILIARIO", "CONSORCIO"] as const)) : pick(["VIDA", "RESIDENCIAL", "AUTO"] as const);
      const candidates = insurers.filter((x) => x.ramos.includes(ramo));
      const ins = candidates[Math.floor(rand() * candidates.length)];
      // fim de vigência espalhado: -120..+330 dias, concentrando alguns nos próximos 60 dias
      let fimOffset = between(-120, 330);
      if (i % 6 === 0) fimOffset = between(0, 60);
      if (i % 11 === 0) fimOffset = between(0, 7);
      const fim = today + fimOffset * DAY;
      const inicio = fim - 365 * DAY;
      const premio =
        ramo === "AUTO" ? between(1900, 7800) : ramo === "VIDA" ? between(480, 2600) : ramo === "RESIDENCIAL" ? between(320, 1400) : ramo === "EMPRESARIAL" ? between(2800, 14000) : ramo === "IMOBILIARIO" ? between(900, 3200) : between(6000, 18000);
      const forma: FormaPagamento = pick(["BOLETO", "BOLETO", "CARTAO", "DEBITO", "CARNE", "PIX"] as const);
      const placa = ramo === "AUTO" ? plate(rand) : undefined;
      const v = pick(VEICULOS);
      const pid = `pol-${id.slice(4)}-${p + 1}`;
      const status = fim < today ? (rand() > 0.5 ? "RENOVADA" : "VENCIDA") : "VIGENTE";
      const docId = `doc-${pid}`;
      const policy: Policy = {
        id: pid,
        clientId: id,
        clientNome: nome,
        insurerId: ins.id,
        seguradora: ins.nome,
        ramo,
        numero: `${ins.slug.slice(0, 3).toUpperCase()}${between(1000000, 9999999)}`,
        proposta: String(between(100000000, 999999999)),
        emissao: iso(inicio - between(1, 10) * DAY),
        inicioVigencia: iso(inicio),
        fimVigencia: iso(fim),
        premioTotal: premio,
        formaPagamento: forma,
        status,
        item:
          ramo === "AUTO"
            ? { tipo: "VEICULO", descricao: `${v[0]} ${v[1]}`, placa, modelo: v[0], ano: v[1], chassi: `9BW${between(100000, 999999)}XYZ${between(1000, 9999)}` }
            : ramo === "RESIDENCIAL" || ramo === "IMOBILIARIO"
              ? { tipo: "IMOVEL", descricao: `Imóvel em ${cidade}/${uf}`, endereco: `${pick(RUAS)}, ${between(10, 900)} — ${cidade}/${uf}` }
              : ramo === "EMPRESARIAL"
                ? { tipo: "EMPRESA", descricao: "Estabelecimento comercial" }
                : ramo === "CONSORCIO"
                  ? { tipo: "COTA", descricao: `Grupo ${between(1000, 9999)} · cota ${between(10, 600)}` }
                  : { tipo: "PESSOA", descricao: "Segurado titular" },
        documentId: docId,
      };
      policies.push(policy);
      documents.push({ id: docId, clientId: id, policyId: pid, tipo: "APOLICE", nome: `Apolice_${policy.numero}.pdf`, tamanho: between(180, 900) * 1024, criadoEm: policy.emissao });
      ins.apolices++;

      // parcelas
      const nParc = forma === "CARTAO" ? 10 : forma === "DEBITO" ? 10 : forma === "PIX" ? 1 : between(4, 10);
      for (let k = 1; k <= nParc; k++) {
        const venc = inicio + (k - 1) * 30 * DAY + 10 * DAY;
        let st: Installment["status"] = venc < today - 2 * DAY ? "PAGO" : "PENDENTE";
        if (st === "PAGO" && rand() < 0.03 && venc > today - 40 * DAY) st = "ATRASADO";
        installments.push({
          id: `par-${pid}-${k}`,
          policyId: pid,
          apoliceNumero: policy.numero,
          clientId: id,
          clientNome: nome,
          telefone: "",
          seguradora: ins.nome,
          numero: k,
          total: nParc,
          valor: Math.round((premio / nParc) * 100) / 100,
          vencimento: iso(venc),
          status: st,
          formaPagamento: forma,
        });
      }
    }
    if (rand() > 0.6) {
      documents.push({ id: `doc-cnh-${id}`, clientId: id, policyId: null, tipo: "CNH", nome: "CNH_digital.pdf", tamanho: between(90, 300) * 1024, criadoEm: iso(criado) });
    }
  }

  // garante parcelas vencendo hoje e na semana
  const pend = installments.filter((x) => x.status === "PENDENTE");
  for (let k = 0; k < 4; k++) pend[k * 7].vencimento = iso(today + 2 * 3600000);
  for (let k = 0; k < 9; k++) pend[40 + k * 5].vencimento = iso(today + between(1, 6) * DAY);
  for (let k = 0; k < 3; k++) {
    const x = pend[90 + k * 3];
    x.vencimento = iso(today - between(1, 5) * DAY);
    x.status = "ATRASADO";
  }
  for (const it of installments) {
    const c = clients.find((cc) => cc.id === it.clientId);
    if (c) it.telefone = c.telefone;
  }

  // status do cliente + contagem por seguradora
  for (const c of clients) {
    const ps = policies.filter((p) => p.clientId === c.id);
    c.status = ps.some((p) => new Date(p.fimVigencia).getTime() >= today && p.status === "VIGENTE") ? "ATIVO" : "INATIVO";
    const insIds = new Set(ps.map((p) => p.insurerId));
    insIds.forEach((iid) => {
      const ins = insurers.find((x) => x.id === iid);
      if (ins) ins.clientes++;
    });
  }

  // timeline
  for (const c of clients) {
    const ps = policies.filter((p) => p.clientId === c.id);
    const ev: TimelineEvent[] = [
      { id: `tl-${c.id}-0`, tipo: "CADASTRO", titulo: "Cliente cadastrado", descricao: `Origem: ${c.origem}`, data: c.criadoEm, autor: "Viviani" },
    ];
    ps.forEach((p, idx) => {
      ev.push({ id: `tl-${c.id}-p${idx}`, tipo: "APOLICE", titulo: `Apólice ${p.numero} emitida`, descricao: `${p.seguradora} · ${p.ramo.toLowerCase()}`, data: p.emissao, autor: "Sergio" });
      ev.push({ id: `tl-${c.id}-d${idx}`, tipo: "DOCUMENTO", titulo: "PDF da apólice anexado", descricao: `Apolice_${p.numero}.pdf — leitura automática`, data: p.emissao });
    });
    const paid = installments.filter((x) => x.clientId === c.id && x.status === "PAGO").slice(-2);
    paid.forEach((x) => ev.push({ id: `tl-${x.id}`, tipo: "PAGAMENTO", titulo: `Parcela ${x.numero}/${x.total} paga`, descricao: `R$ ${x.valor.toFixed(2).replace(".", ",")} · ${x.seguradora}`, data: x.vencimento }));
    ev.push({ id: `tl-${c.id}-m`, tipo: "MENSAGEM", titulo: "Lembrete de parcela enviado", descricao: "Régua “1ª parcela” · WhatsApp entregue", data: iso(today - between(3, 40) * DAY) });
    timeline[c.id] = ev.sort((a, b) => b.data.localeCompare(a.data));
  }

  // credenciais (mascaradas)
  const credentials: InsurerCredential[] = insurers
    .filter((i) => i.temApi && i.statusIntegracao !== "NAO_CONFIGURADA")
    .flatMap((i) => [
      { id: `cred-${i.slug}-1`, insurerId: i.id, tipo: "CLIENT_ID", rotulo: "Client ID", valorMascarado: `${i.slug.slice(0, 3)}_••••••••${between(10, 99)}`, ultimoTeste: i.ultimoTeste, ultimoErro: i.statusIntegracao === "ERRO" ? "401 — token expirado em 03/11" : null },
      { id: `cred-${i.slug}-2`, insurerId: i.id, tipo: "CLIENT_SECRET", rotulo: "Client Secret", valorMascarado: "••••••••••••••••", ultimoTeste: i.ultimoTeste, ultimoErro: null },
      { id: `cred-${i.slug}-3`, insurerId: i.id, tipo: "CODIGO_CORRETOR", rotulo: "Código SUSEP / corretor", valorMascarado: `••••${between(100, 999)}`, ultimoTeste: i.ultimoTeste, ultimoErro: null },
    ]);

  // leads
  const stages: LeadStage[] = ["NOVO", "NOVO", "NOVO", "EM_CONTATO", "EM_CONTATO", "EM_CONTATO", "COTACAO_ENVIADA", "COTACAO_ENVIADA", "NEGOCIACAO", "NEGOCIACAO", "FECHADO", "FECHADO", "PERDIDO"];
  const origens: LeadOrigem[] = ["site", "whatsapp", "indicacao", "instagram", "telefone"];
  const notas = [
    "Quer cotar o carro novo antes de retirar na concessionária.",
    "Indicação da cliente Helena. Prefere contato à noite.",
    "Seguro atual vence no fim do mês, quer comparar preço.",
    "Tem 2 filhos, interesse em seguro de vida com invalidez.",
    "Abrindo loja nova no centro — precisa de empresarial.",
    "Pediu simulação de consórcio de imóvel até R$ 300 mil.",
    "Comparando com o banco. Sensível a preço.",
  ];
  const leads: Lead[] = Array.from({ length: 22 }, (_, k) => {
    const nome = `${pick(FIRST)} ${pick(LAST)}`;
    return {
      id: `lead-${k + 1}`,
      nome,
      telefone: `5516${9}${between(10000000, 99999999)}`,
      email: rand() > 0.3 ? `${nome.split(" ")[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}@exemplo.com.br` : null,
      produto: pick(["AUTO", "AUTO", "VIDA", "RESIDENCIAL", "EMPRESARIAL", "CONSORCIO", "IMOBILIARIO"] as const),
      origem: pick(origens),
      etapa: stages[k % stages.length],
      responsavel: pick(["Sergio", "Viviani"]),
      proximoContato: rand() > 0.3 ? iso(today + between(-2, 9) * DAY) : null,
      notas: pick(notas),
      valorEstimado: between(8, 90) * 100,
      criadoEm: iso(today - between(0, 45) * DAY),
    };
  });

  const quotes: Quote[] = leads
    .filter((l) => ["COTACAO_ENVIADA", "NEGOCIACAO", "FECHADO"].includes(l.etapa))
    .map((l, k) => {
      const base = l.produto === "AUTO" ? between(2400, 5200) : between(600, 3000);
      const res = ["Porto Seguro", "Allianz", "Tokio Marine", "HDI Seguros", "Azul Seguros", "Yelum Seguros"]
        .slice(0, between(3, 6))
        .map((s) => ({
          seguradora: s,
          premio: Math.round(base * (0.85 + rand() * 0.45)),
          parcelas: `até ${pick([6, 10, 12])}x sem juros`,
          franquia: l.produto === "AUTO" ? between(25, 60) * 100 : null,
          coberturas: l.produto === "AUTO" ? ["Colisão", "Roubo e furto", "Terceiros R$ 200 mil", "Assistência 24h", pick(["Carro reserva 15 dias", "Carro reserva 30 dias"])] : ["Cobertura básica", "Assistência 24h", "Danos elétricos"],
          destaque: null,
        }))
        .sort((a, b) => a.premio - b.premio) as Quote["resultados"];
      if (res[0]) res[0].destaque = "melhor_preco";
      if (res[1]) res[1].destaque = "melhor_custo_beneficio";
      return {
        id: `cot-${k + 1}`,
        leadId: l.id,
        clientId: null,
        nome: l.nome,
        ramo: l.produto,
        status: l.etapa === "COTACAO_ENVIADA" ? "ENVIADA" : "CONCLUIDA",
        aggilizadorId: `AGG-${between(100000, 999999)}`,
        criadoEm: iso(new Date(l.criadoEm).getTime() + DAY),
        descricao: l.produto === "AUTO" ? pick(VEICULOS)[0] : l.notas,
        resultados: res,
      };
    });
  quotes.unshift({
    id: "cot-0",
    leadId: leads[0].id,
    clientId: null,
    nome: leads[0].nome,
    ramo: "AUTO",
    status: "PROCESSANDO",
    aggilizadorId: "AGG-772104",
    criadoEm: iso(Date.now() - 4 * 60000),
    descricao: "Jeep Compass Longitude 2021",
    resultados: [],
  });

  const rules: MessageRule[] = [
    { id: "rule-1", nome: "Lembrete da 1ª parcela", gatilho: "PRIMEIRA_PARCELA", descricaoGatilho: "dias antes do vencimento da parcela 1", antecedenciaDias: 2, horario: "09:00", formasPagamento: ["BOLETO"], seguradoras: [], ativo: true, texto: DEFAULT_RULE_TEXTS.PRIMEIRA_PARCELA, anexarBoleto: false, enviadas30d: 38 },
    { id: "rule-2", nome: "Problema no pagamento (sem boleto)", gatilho: "PROBLEMA_SEM_BOLETO", descricaoGatilho: "dia após o vencimento, parcela em aberto e sem boleto", antecedenciaDias: -1, horario: "10:00", formasPagamento: ["BOLETO", "DEBITO", "CARTAO"], seguradoras: [], ativo: true, texto: DEFAULT_RULE_TEXTS.PROBLEMA_SEM_BOLETO, anexarBoleto: false, enviadas30d: 9 },
    { id: "rule-3", nome: "Problema no pagamento (com boleto)", gatilho: "PROBLEMA_COM_BOLETO", descricaoGatilho: "dia após o vencimento, conector devolveu boleto", antecedenciaDias: -1, horario: "10:00", formasPagamento: ["BOLETO", "CARNE"], seguradoras: ["Porto Seguro", "Allianz", "HDI Seguros", "Azul Seguros"], ativo: true, texto: DEFAULT_RULE_TEXTS.PROBLEMA_COM_BOLETO, anexarBoleto: true, enviadas30d: 14 },
    { id: "rule-4", nome: "Feliz aniversário", gatilho: "ANIVERSARIO", descricaoGatilho: "no dia do aniversário (clientes ativos)", antecedenciaDias: 0, horario: "08:00", formasPagamento: [], seguradoras: [], ativo: true, texto: DEFAULT_RULE_TEXTS.ANIVERSARIO, anexarBoleto: false, enviadas30d: 11 },
    { id: "rule-5", nome: "Aviso de renovação", gatilho: "RENOVACAO", descricaoGatilho: "dias antes do fim da vigência", antecedenciaDias: 30, horario: "09:30", formasPagamento: [], seguradoras: [], ativo: false, texto: DEFAULT_RULE_TEXTS.RENOVACAO, anexarBoleto: false, enviadas30d: 0 },
  ];
  const templates: MessageTemplate[] = [
    {
      id: "tpl-revisao",
      nome: "Revisão do seguro",
      texto: "Olá {{nome}}! Aqui é da Serginho Seguros. Passando para lembrar que estamos à disposição para revisar seu seguro {{seguradora}}. É só responder esta mensagem.",
      anexarBoleto: false,
    },
    ...rules.map((r) => ({ id: `tpl-${r.id}`, nome: r.nome, texto: r.texto, anexarBoleto: r.anexarBoleto })),
  ];

  const msgStatuses: Message["status"][] = ["LIDA", "LIDA", "ENTREGUE", "ENTREGUE", "ENVIADA", "FALHOU", "LIDA"];
  const messages: Message[] = [];
  for (let k = 0; k < 40; k++) {
    const c = clients[between(0, clients.length - 1)];
    const r = rules[between(0, 3)];
    const st = k < 6 ? (k < 1 ? "ENVIANDO" : "NA_FILA") : pick(msgStatuses);
    messages.push({
      id: `msg-${k + 1}`,
      clientId: c.id,
      clientNome: c.nome,
      telefone: c.telefone,
      regra: r.nome,
      texto: r.texto.replace("{{nome}}", c.nome.split(" ")[0]),
      anexo: r.anexarBoleto ? "boleto.pdf" : null,
      status: st,
      criadoEm: iso(Date.now() - k * 2.7 * 3600000),
      agendadoPara: st === "NA_FILA" || st === "ENVIANDO" ? iso(Date.now() + (k + 1) * 45000) : null,
      enviadoEm: st === "NA_FILA" || st === "ENVIANDO" ? null : iso(Date.now() - k * 2.7 * 3600000 + 60000),
      erro: st === "FALHOU" ? "Número sem WhatsApp" : null,
    });
  }

  const instance: WhatsappInstance = {
    status: "CONECTADO",
    numero: "5516990000000",
    nome: "Serginho Seguros",
    qrCode: null,
    atualizadoEm: iso(Date.now() - 3 * 3600000),
    enviadasHoje: 23,
    limiteDiario: 250,
    pausado: false,
  };

  return { clients, policies, installments, insurers, credentials, documents, timeline, leads, quotes, templates, rules, messages, instance };
}
