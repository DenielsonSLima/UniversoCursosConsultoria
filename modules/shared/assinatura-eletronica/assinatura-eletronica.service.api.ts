import { administrationServiceMethods } from "./assinatura-eletronica.service.api-administration";
import { archiveServiceMethods } from "./assinatura-eletronica.service.api-archive";
import { diaryServiceMethods } from "./assinatura-eletronica.service.api-diary";
import { signingServiceMethods } from "./assinatura-eletronica.service.api-signing";

/**
 * Camada de fronteira do cliente. Nenhuma regra de estado, elegibilidade,
 * sequência de signatários ou autorização é calculada aqui: cada RPC devolve
 * a decisão canônica do banco já no formato de apresentação.
 */
export const electronicSignatureService = {
  ...administrationServiceMethods,
  ...archiveServiceMethods,
  ...diaryServiceMethods,
  ...signingServiceMethods,
};
