// Importação da carteira a partir da saída do extrator (../_dados/clients.json + policies.json).
//
//   pnpm import:carteira            (raiz do monorepo)
//   pnpm --filter @ss/import dry-run   -> só valida e conta, não grava
//   opções: --dados <pasta>  (padrão: ../_dados ao lado de app/)
//
// A lógica (idempotência, ATIVO/INATIVO, endossos, parcelas) vive em
// apps/api/src/modules/importacao/carteira.ts e é a mesma usada pela tela
// Configurações > Importar carteira. Aqui os PDFs são lidos direto do disco:
// o Document guarda o caminho RELATIVO a STORAGE_DIR (a pasta base/seguradora);
// arquivo fora de STORAGE_DIR é ignorado e contado. O relatório traz só contagens.
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../../apps/api/src/lib/prisma";
import { storageRoot } from "../../../apps/api/src/config/env";
import { CarteiraSchema, importCarteira, type FileResolver } from "../../../apps/api/src/modules/importacao/carteira";
import { sha256File } from "../../../apps/api/src/modules/importacao/arquivos";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function relToStorage(abs: string): string | null {
  const rel = path.relative(storageRoot, path.resolve(abs));
  return rel.startsWith("..") || path.isAbsolute(rel) ? null : rel.split(path.sep).join("/");
}

/** PDFs lidos do caminho original gravado pelo extrator (máquina local). */
const diskResolver: FileResolver = async (p) => {
  const rel = relToStorage(p.arquivo);
  if (!rel) return "fora";
  const st = await stat(p.arquivo).catch(() => null);
  if (!st?.isFile()) return null;
  return { rel, size: st.size, hash: () => sha256File(p.arquivo) };
};

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dadosDir = path.resolve(arg("--dados") ?? path.resolve(here, "../../../../_dados"));
  const data = CarteiraSchema.parse({
    clients: JSON.parse(await readFile(path.join(dadosDir, "clients.json"), "utf8")),
    policies: JSON.parse(await readFile(path.join(dadosDir, "policies.json"), "utf8")),
  });
  console.log(`Lidos: ${data.clients.length} clientes, ${data.policies.length} PDFs. STORAGE_DIR=${storageRoot}${dryRun ? " (dry-run)" : ""}`);
  const r = await importCarteira(data, { resolveFile: diskResolver, dryRun });
  if (r.status) console.log(`Status recalculado: ${JSON.stringify(r.status)}`);
  console.log("Resumo:", JSON.stringify(r.stats, null, 1));
  if (Object.keys(r.seguradorasNaoMapeadas).length) console.log("Seguradoras não mapeadas:", r.seguradorasNaoMapeadas);
}

main()
  .catch((err) => {
    console.error("Falha na importação:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
