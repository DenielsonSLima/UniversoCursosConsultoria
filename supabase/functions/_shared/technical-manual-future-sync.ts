const MANUAL_TECHNICAL_FUTURE_SYNC_RPC =
  "should_skip_technical_manual_future_sync";

export const shouldSkipTechnicalManualFutureSync = async (
  admin: any,
  matriculaId: string,
): Promise<boolean> => {
  const normalizedId = String(matriculaId || "").trim();
  if (!normalizedId) return false;

  const { data, error } = await admin.rpc(
    MANUAL_TECHNICAL_FUTURE_SYNC_RPC,
    { p_matricula_id: normalizedId },
  );
  if (error) throw error;
  if (typeof data !== "boolean") {
    throw new Error(
      "Resposta inválida da guarda de ciclo técnico manual.",
    );
  }
  return data;
};
