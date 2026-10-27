type RecoveryClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

// The authenticated RPC derives the service operation from the existing run.
// It only schedules exact GET recovery; ordinary issuance keeps its own path.
export const resumeServiceFee = async (
  client: RecoveryClient,
  receivableId: string,
  cycleRequestId: string,
): Promise<void> => {
  const { data, error } = await client.rpc(
    "resume_rejected_fee_service_recovery_secure",
    { p_receivable_id: receivableId, p_cycle_request_id: cycleRequestId },
  );
  if (error) throw error;
  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown> : null;
  if (result?.handled === false) return;
  if (result?.handled !== true || result.recoveryOnly !== true ||
    typeof result.queued !== "boolean") {
    throw new Error("O servidor não confirmou a consulta segura da rematrícula.");
  }
  // Do not fall through to the ordinary authorization/POST path, or report 13/13
  // while the worker still lacks a fully validated bank result.
  throw new Error(result.queued
    ? "A tentativa da rematrícula foi preservada e a consulta do mesmo título foi solicitada ao Banese. " +
      "Aguarde e use Consultar novamente. O ciclo só será concluído após a confirmação dos dados e do Pix oficial."
    : "A consulta da rematrícula está em andamento ou aguardando o intervalo seguro de nova consulta. " +
      "Aguarde e use Consultar novamente. Nenhum novo boleto foi emitido.");
};
