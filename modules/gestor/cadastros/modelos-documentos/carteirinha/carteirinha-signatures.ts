import { assinaturasService, type AssinaturasData } from '../../../configuracoes/assinaturas/assinaturas.service';

let inFlight: Promise<AssinaturasData> | null = null;

/** Os versos de um lote compartilham a consulta, sem substituir a origem salva. */
export const loadCarteirinhaSignatures = (): Promise<AssinaturasData> => {
  if (!inFlight) {
    let timeout = 0;
    const request = assinaturasService.getSignatures();
    inFlight = Promise.race([
      request,
      new Promise<AssinaturasData>((_resolve, reject) => {
        timeout = window.setTimeout(() => reject(new Error(
          'Tempo esgotado ao carregar a assinatura institucional.',
        )), 15_000);
      }),
    ]).finally(() => {
      window.clearTimeout(timeout);
      inFlight = null;
    });
  }
  return inFlight;
};
