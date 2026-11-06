// Erros de negócio com status HTTP e código estável (o frontend usa `code` para i18n/ações).
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what = "Registro") => new AppError(404, "NOT_FOUND", `${what} não encontrado`);
export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const conflict = (message: string) => new AppError(409, "CONFLICT", message);
export const forbidden = (message = "Sem permissão para esta ação") => new AppError(403, "FORBIDDEN", message);
export const unauthorized = (message = "Não autenticado") => new AppError(401, "UNAUTHORIZED", message);
export const unavailable = (message: string) => new AppError(503, "SERVICE_UNAVAILABLE", message);
