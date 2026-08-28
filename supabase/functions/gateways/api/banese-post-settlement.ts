export const BANESE_POST_SETTLEMENT_PENDING_PREFIX =
  "BANESE_POST_SETTLEMENT_PENDING:";

export const BANESE_POST_SETTLEMENT_PENDING_MESSAGE =
  `${BANESE_POST_SETTLEMENT_PENDING_PREFIX} baixa confirmada; conclusão interna aguardando nova tentativa.`;

export const clearBanesePostSettlementPending = async (
  admin: any,
  receivable: Record<string, any>,
  replacementMessage: string | null = null,
) => {
  const clearedAt = new Date().toISOString();
  let query = admin
    .from("contas_receber")
    .update({
      gateway_last_error: replacementMessage,
      gateway_synced_at: clearedAt,
      updated_at: clearedAt,
    })
    .eq("id", receivable.id)
    .eq("gateway_provider", "banese_card")
    .eq("status", "PAGO")
    .eq(
      "gateway_last_error",
      BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
    );
  if (receivable.updated_at) {
    query = query.eq("updated_at", receivable.updated_at);
  }
  const { data, error } = await query.select().maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "Cobranca mudou durante a conclusao pos-baixa Banese.",
    );
  }
  return data;
};

export const throwBanesePostSettlementPending = async (
  admin: any,
  receivable: Record<string, any>,
  cause: unknown,
): Promise<never> => {
  let query = admin
    .from("contas_receber")
    .update({
      gateway_last_error: BANESE_POST_SETTLEMENT_PENDING_MESSAGE,
      gateway_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", receivable.id)
    .eq("gateway_provider", "banese_card")
    .eq("status", "PAGO");
  if (receivable.updated_at) {
    query = query.eq("updated_at", receivable.updated_at);
  }
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw error;
  if (!data) {
    throw new Error(
      "Cobranca mudou durante o registro da pendencia pos-baixa Banese.",
      { cause },
    );
  }
  throw new Error(BANESE_POST_SETTLEMENT_PENDING_MESSAGE, { cause });
};
