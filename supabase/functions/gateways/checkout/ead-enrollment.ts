const looksLikeRpcNotFound = (error: any) => {
  const errorMessage = String(error?.message || "").toLowerCase();
  const details = String(error?.details || "").toLowerCase();
  const hint = String(error?.hint || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const haystack = `${errorMessage} ${details} ${hint}`;
  return haystack.includes("does not exist") && haystack.includes(
        "payment_checkout_upsert_matricula",
      ) || code === "42883";
};

export const upsertEadMatricula = async (
  admin: any,
  alunoId: string,
  turmaId: string,
) => {
  const rpcArgs = {
    p_aluno_id: alunoId,
    p_turma_id: turmaId,
    p_gerar_cobranca_futura: false,
  };

  try {
    const { data, error } = await admin.rpc(
      "payment_checkout_upsert_matricula",
      rpcArgs,
    );
    if (!error) return data;
    if (!looksLikeRpcNotFound(error)) throw error;

    const fallback = await admin.rpc(
      "asaas_checkout_upsert_matricula",
      rpcArgs,
    );
    if (fallback.error) throw fallback.error;
    return fallback.data;
  } catch (error) {
    if (!looksLikeRpcNotFound(error)) throw error;
    const fallback = await admin.rpc(
      "asaas_checkout_upsert_matricula",
      rpcArgs,
    );
    if (fallback.error) throw fallback.error;
    return fallback.data;
  }
};
