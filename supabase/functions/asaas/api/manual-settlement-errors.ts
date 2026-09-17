/** PostgREST retorna objetos com message, não instâncias de Error. */
export const manualSettlementErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  // Não serializar detalhes, payloads ou objetos desconhecidos na auditoria.
  return "Falha ao processar a baixa. Consulte a revisão financeira antes de tentar novamente.";
};
