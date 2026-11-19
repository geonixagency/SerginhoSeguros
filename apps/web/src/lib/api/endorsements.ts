// Endossos: mesma chamada no modo real e no de demonstração (no demo a rota não existe e a tela mostra o erro).
import type { ClientEndorsementsDTO, EndorsementCreateInput, EndorsementDTO, EndorsementPreviewDTO } from "@ss/shared";
import { http } from "./client";

export const endorsementsApi = {
  /** Lê o PDF do endosso e propõe as mudanças (não grava). */
  parse: (file: File, clientId?: string | null) => {
    const fd = new FormData();
    if (clientId) fd.append("clientId", clientId);
    fd.append("file", file, file.name);
    return http.post<EndorsementPreviewDTO>("/endorsements/parse", fd);
  },
  /** Registra o endosso revisado: aplica as mudanças e guarda o PDF. */
  create: (file: File, data: EndorsementCreateInput) => {
    const fd = new FormData();
    fd.append("data", JSON.stringify(data));
    fd.append("file", file, file.name);
    return http.post<EndorsementDTO>("/endorsements", fd);
  },
  list: (clientId: string) => http.get<ClientEndorsementsDTO>(`/clients/${clientId}/endorsements`),
};
