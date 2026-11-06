// Gera os traçados vetoriais da marca a partir da Cormorant Garamond (fonte serifada próxima à da logo).
// Saída: src/components/brand/logo-paths.ts  — rode com `pnpm logo:gen`.
import fs from "node:fs";
import path from "node:path";
import opentype from "opentype.js";

const dir = "node_modules/@fontsource/cormorant-garamond/files";
const load = (w) => {
  const buf = fs.readFileSync(path.join(dir, `cormorant-garamond-latin-${w}-normal.woff`));
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
};
const bold = load(700);
const semi = load(600);

const r = (n) => Math.round(n * 10) / 10;
function toD(p) {
  return p.commands
    .map((c) => {
      switch (c.type) {
        case "M": return `M${r(c.x)} ${r(c.y)}`;
        case "L": return `L${r(c.x)} ${r(c.y)}`;
        case "C": return `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`;
        case "Q": return `Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`;
        case "Z": return "Z";
      }
    })
    .join("");
}
// Fit text path into box [x0,y0,x1,y1] (height-driven), optional letterSpacing
function fit(font, text, box, opts = {}) {
  const { tracking = 0 } = opts;
  const size = 100;
  let p = font.getPath(text, 0, 0, size, { letterSpacing: tracking });
  const bb = p.getBoundingBox();
  const s = (box[3] - box[1]) / (bb.y2 - bb.y1);
  const fs2 = size * s;
  p = font.getPath(text, 0, 0, fs2, { letterSpacing: tracking });
  const b2 = p.getBoundingBox();
  const w = b2.x2 - b2.x1;
  const dx = opts.alignCenter ? (box[0] + box[2]) / 2 - (b2.x1 + w / 2) : box[0] - b2.x1;
  p = font.getPath(text, dx, box[1] - b2.y1, fs2, { letterSpacing: tracking });
  return { d: toD(p), bbox: p.getBoundingBox(), width: w };
}

const sLeft = fit(bold, "S", [118, 152, 0, 578]);
const sRight = fit(bold, "S", [574, 359, 0, 797]);
// Vertical wordmark: laid out horizontally in a box of length 809 (48→857) and cap height 60,
// later rotated 90° in SVG. We fit by height then measure width.
const word = fit(semi, "SERGINHO SEGUROS", [0, 0, 0, 50], { tracking: 0.06 });
const l1 = fit(semi, "CONSÓRCIOS", [580, 832, 0, 858], { tracking: 0.04 });
const l2 = fit(semi, "E PLANOS", [580, 870, 0, 894], { tracking: 0.04 });

const out = `// Arquivo gerado por scripts/gen-logo-paths.mjs — não edite à mão.
export const LOGO_VIEWBOX = "0 0 1000 1000";
export const S_LEFT = ${JSON.stringify(sLeft.d)};
export const S_RIGHT = ${JSON.stringify(sRight.d)};
export const WORDMARK = ${JSON.stringify(word.d)};
export const WORDMARK_WIDTH = ${r(word.width)};
export const TAG_1 = ${JSON.stringify(l1.d)};
export const TAG_2 = ${JSON.stringify(l2.d)};
`;
fs.writeFileSync("src/components/brand/logo-paths.ts", out);
console.log("ok", sLeft.bbox, sRight.bbox, word.width, l1.bbox, l2.bbox);
