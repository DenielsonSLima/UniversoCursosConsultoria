import { listCnabFiles } from "./file-service.ts";
import {
  assertReceivableEligibleForCnabRemittance,
  BANESE_CNAB_PROVIDER,
} from "./policy.ts";
import { digits } from "./shared.ts";

export const getCnabOverview = async (
  admin: any,
  requestedEnvironment?: unknown,
) => {
  const listed = await listCnabFiles(admin, requestedEnvironment);
  const { data, error } = await admin
    .from("contas_receber")
    .select(
      "id,cliente_id,descricao,valor,data_vencimento,status,gateway_provider,gateway_environment,gateway_payment_method,gateway_payment_id,gateway_payment_link_id,gateway_boleto_nosso_numero,gateway_boleto_issued_at,gateway_boleto_linha_digitavel,gateway_boleto_codigo_barras,gateway_invoice_url,gateway_bank_slip_url,gateway_creation_token,gateway_status,gateway_last_error,gateway_submission_channel,gateway_submission_status,gateway_cnab_file_id",
    )
    .eq("gateway_provider", BANESE_CNAB_PROVIDER)
    .eq("gateway_environment", listed.context.environment)
    .eq("gateway_payment_method", "BOLETO")
    .eq("status", "PENDENTE")
    .is("gateway_submission_channel", null)
    .is("gateway_submission_status", null)
    .is("gateway_cnab_file_id", null)
    .is("gateway_creation_token", null)
    .not("gateway_boleto_nosso_numero", "is", null)
    .neq("gateway_boleto_nosso_numero", "")
    .not("gateway_last_error", "is", null)
    .neq("gateway_last_error", "")
    .neq("gateway_last_error", "-")
    .or("gateway_status.is.null,gateway_status.neq.CREATING")
    .order("data_vencimento", { ascending: true })
    .limit(200);
  if (error) throw error;
  const eligible = (data || []).filter((row: any) => {
    try {
      assertReceivableEligibleForCnabRemittance(
        row,
        listed.context.environment,
      );
      return /^\d{9}$/.test(digits(row.gateway_boleto_nosso_numero));
    } catch {
      return false;
    }
  });
  return {
    environment: listed.context.environment,
    convenio: listed.context.convenio,
    edi7Configured: true,
    pixPolicy: listed.context.environment === "sandbox"
      ? "O QR Pix/BolePix do Banese não é disponibilizado na homologação; o título continua sendo boleto."
      : "Quando o Banese devolver QR Pix no boleto de produção, a liquidação motivo 61 será registrada como BolePix.",
    eligibleReceivables: eligible.map((row: any) => ({
      id: row.id,
      description: row.descricao,
      nominalAmount: Number(row.valor || 0),
      dueDate: row.data_vencimento,
      nossoNumero: digits(row.gateway_boleto_nosso_numero),
    })),
    files: listed.files,
  };
};
