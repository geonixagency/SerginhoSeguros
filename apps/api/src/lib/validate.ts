import type { z } from "zod";
import { AppError } from "./errors";

/** Valida body/query/params com Zod e lança 400 com os campos inválidos. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Dados inválidos",
      r.error.issues.map((i) => ({ campo: i.path.join("."), mensagem: i.message })),
    );
  }
  return r.data;
}
