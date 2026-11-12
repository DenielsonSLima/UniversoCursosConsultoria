/** Checks canonical EAD enrollment and the caller's existing institutional scope.
 * The RPC is called with the user's JWT, never the service-role client's identity.
 */
export const hasScopedEadBoletoReadAccess = async (
  userClient: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  receivableId: string,
): Promise<boolean> => {
  try {
    const { data, error } = await userClient.rpc(
      "parceiro_aluno_ead_boleto_can_read",
      { p_receivable_id: receivableId },
    );
    return !error && data === true;
  } catch {
    return false;
  }
};

export const isIssuedPayableEadBoleto = (row: Record<string, unknown>): boolean =>
  row.gateway_environment === "production" &&
  ["PENDENTE", "VENCIDO"].includes(String(row.status)) &&
  Boolean(row.gateway_boleto_issued_at) &&
  Boolean(String(row.gateway_boleto_codigo_barras ?? "").trim()) &&
  Boolean(String(row.gateway_boleto_linha_digitavel ?? "").trim());
