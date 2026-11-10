import { createNfseHomologationService } from './nfse-homologation.service-core';

const safeMessages: Record<string, string> = {
  PILOT_NOT_AUTHORIZED: 'Seu acesso não permite executar o teste de homologação da matriz.',
  PILOT_PREVIEW_EXPIRED: 'A revisão do teste expirou. Confira a conexão e prepare uma nova revisão.',
  PILOT_EXECUTOR_NOT_CONFIGURED: 'O serviço de emissão do teste ainda precisa ser disponibilizado.',
  PREFLIGHT_NOT_AUTHORIZED: 'Seu acesso não permite verificar a integração de homologação desta unidade.',
};

export async function nfseHomologationError(error: unknown): Promise<Error> {
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null;
  if (context instanceof Response) {
    try {
      const body: unknown = await context.clone().json();
      const code = body && typeof body === 'object' && 'error' in body ? body.error : null;
      if (typeof code === 'string' && Object.hasOwn(safeMessages, code)) return new Error(safeMessages[code]);
    } catch { /* Gateway bodies are not user messages. */ }
    if ([401, 403].includes(context.status)) return new Error('Sua sessão não permite esta etapa. Entre novamente e confira o acesso à matriz.');
    if ([404, 503].includes(context.status)) return new Error('O serviço de homologação está indisponível. A etapa ainda precisa ser disponibilizada.');
  }
  return new Error('A operação não foi confirmada. Se o envio já começou, consulte o resultado antes de qualquer nova tentativa.');
}

export const nfseHomologationService = createNfseHomologationService(async (endpoint, body) => {
  const { supabase } = await import('../../../../lib/supabase');
  const { data, error } = await supabase.functions.invoke(endpoint, { body });
  if (error) throw await nfseHomologationError(error);
  return data;
});
