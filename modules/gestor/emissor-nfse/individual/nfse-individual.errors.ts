const unknownOutcome = 'A etapa de produção não foi confirmada. Se o envio já começou, consulte esta mesma operação antes de tentar novamente. Não crie outra emissão para substituir uma resposta ausente.';
const messages: Record<string, string> = {
  RATE_LIMITED: 'O limite de tentativas do emissor foi atingido. Aguarde antes de consultar novamente a mesma operação; não crie outra emissão.',
  INVALID_INDIVIDUAL_COMMAND: 'A solicitação enviada pelo sistema está incompleta ou inválida. Reabra a mesma operação; se persistir, informe a administração. O serviço não identificou um campo cadastral específico.',
  INDIVIDUAL_SCOPE_DENIED: 'A sessão ou permissão não permite esta operação na unidade selecionada. Confira o acesso ao Emissor NFS-e e entre novamente se necessário.',
  METHOD_NOT_ALLOWED: 'O sistema usou um método de comunicação não aceito pelo emissor. A administração precisa verificar a integração.',
  INDIVIDUAL_OPERATION_UNCONFIRMED: unknownOutcome,
};
/** Accept only structured codes owned by this endpoint, never raw provider responses. */
export async function individualTransportError(error: unknown): Promise<Error> {
  const context = error && typeof error === 'object' && 'context' in error ? error.context : null;
  if (context instanceof Response) {
    try {
      const body: unknown = await context.clone().json();
      const code = body && typeof body === 'object' && 'error' in body ? body.error : null;
      if (typeof code === 'string' && Object.hasOwn(messages, code)) return new Error(messages[code]);
    } catch { /* Gateway HTML or malformed payload is not a fiscal rejection. */ }
    if (context.status === 503) return new Error('O serviço de emissão está indisponível (HTTP 503). Não foi possível consultar ou concluir esta etapa. Isso não confirma envio nem rejeição da nota; consulte esta mesma operação quando o serviço voltar.');
    if (context.status === 401) return new Error('A sessão não foi aceita pelo emissor. Entre novamente e consulte a mesma operação para conferir o resultado.');
    if (context.status === 403) return new Error(messages.INDIVIDUAL_SCOPE_DENIED);
    if (context.status === 429) return new Error(messages.RATE_LIMITED);
  }
  return new Error(unknownOutcome);
}
