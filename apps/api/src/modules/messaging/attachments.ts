// Anexos de mensagem (WhatsApp): tipo conferido pelo conteúdo, não pela extensão declarada.
export const ANEXO_MAX_MB = 10;
/** Pasta (relativa a STORAGE_DIR) dos anexos avulsos de mensagem. */
export const ANEXO_DIR = "_anexos";

const OOXML: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};
const OLE: Record<string, string> = { ".doc": "application/msword", ".xls": "application/vnd.ms-excel" };

export function sniffAttachment(buf: Buffer, nome: string): { mime: string; ext: string } | null {
  const ext = (/\.[a-z0-9]+$/i.exec(nome)?.[0] ?? "").toLowerCase();
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: ".pdf" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: ".png" };
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return { mime: "image/webp", ext: ".webp" };
  // Office moderno é um zip; o antigo é OLE. Aqui a extensão só escolhe entre os formatos do mesmo contêiner.
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) && OOXML[ext]) return { mime: OOXML[ext]!, ext };
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) && OLE[ext]) return { mime: OLE[ext]!, ext };
  return null;
}
