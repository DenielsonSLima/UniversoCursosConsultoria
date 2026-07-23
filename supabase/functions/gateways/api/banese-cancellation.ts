import {
  cancelBaneseBoleto,
  type Environment,
} from "../../banese/core/adapter.ts";
import {
  applyReceivableSnapshotFields,
  applyRemoteIdentitySnapshot,
} from "../checkout/remote-title-guard.ts";
import { requireGatewayEnvironment } from "./environment.ts";

const onlyDigits = (value: unknown) => String(value || "").replace(/\D/g, "");

type CancelBaneseBoleto = typeof cancelBaneseBoleto;

type BaneseCancellationDependencies = {
  cancelBoleto?: CancelBaneseBoleto;
};

const assertOurNumber = (value: unknown) => {
  const nossoNumero = onlyDigits(value);
  if (!/^\d{9}$/.test(nossoNumero)) {
    throw new Error("Nosso Numero Banese invalido para baixa manual.");
  }
  return nossoNumero;
};

const transactionTitleFilter = (nossoNumero: string) =>
  `bank_slip_our_number.eq.${nossoNumero},remote_payment_id.eq.${nossoNumero}`;

export const cancelBaneseReceivableBeforeManualSettlement = async (
  admin: any,
  receivable: any,
  dependencies: BaneseCancellationDependencies = {},
) => {
  if (receivable?.gateway_provider !== "banese_card") {
    throw new Error("A cobranca informada nao pertence ao Banese.");
  }
  if (
    String(receivable.gateway_payment_method || "").toUpperCase() !== "BOLETO"
  ) {
    throw new Error("A baixa manual Banese exige um boleto registrado.");
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(String(receivable.id || ""))
  ) {
    throw new Error("Cobranca Banese invalida para baixa manual.");
  }

  const environment: Environment = requireGatewayEnvironment(
    receivable.gateway_environment,
    "titulo Banese",
  );
  const { data: credential, error: credentialError } = await admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", "banese_card")
    .eq("environment", environment)
    .maybeSingle();
  if (credentialError) throw credentialError;

  const metadata =
    credential?.metadata && typeof credential.metadata === "object"
      ? credential.metadata
      : {};
  const convenio = onlyDigits(
    receivable.gateway_boleto_convenio ||
      metadata.baneseBoletoConvenio ||
      metadata.baneseConvenio,
  );
  if (!convenio) {
    throw new Error("Convenio Banese nao encontrado para baixa manual.");
  }
  const nossoNumero = assertOurNumber(
    receivable.gateway_boleto_nosso_numero || receivable.gateway_payment_id,
  );
  const gatewayPaymentId = onlyDigits(receivable.gateway_payment_id);
  const boletoNossoNumero = onlyDigits(
    receivable.gateway_boleto_nosso_numero,
  );
  if (
    gatewayPaymentId && boletoNossoNumero &&
    gatewayPaymentId !== boletoNossoNumero
  ) {
    throw new Error(
      "Identidade Banese inconsistente entre pagamento e Nosso Número. Reconcilie antes da baixa manual.",
    );
  }

  const canceled = await (dependencies.cancelBoleto ?? cancelBaneseBoleto)(
    admin,
    environment,
    { convenio, nossoNumero },
  );
  const syncedAt = new Date().toISOString();
  let updateQuery = admin
    .from("contas_receber")
    .update({
      gateway_status: canceled.remoteStatus,
      gateway_synced_at: syncedAt,
      gateway_last_error: null,
      updated_at: syncedAt,
    })
    .eq("id", receivable.id)
    .eq("gateway_provider", "banese_card")
    .eq("gateway_environment", environment)
    .eq("gateway_payment_method", "BOLETO")
    .in("status", ["PENDENTE", "VENCIDO"]);
  updateQuery = applyRemoteIdentitySnapshot(updateQuery, receivable);
  updateQuery = applyReceivableSnapshotFields(updateQuery, receivable, [
    "gateway_status",
    "updated_at",
  ]);
  const { data: updated, error: updateError } = await updateQuery.select()
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) {
    throw new Error(
      "Cobranca mudou durante a baixa Banese. O titulo bancario foi cancelado; atualize a tela antes de tentar novamente.",
    );
  }

  const { error: transactionError } = await admin
    .from("payment_gateway_transactions")
    .update({
      remote_status: canceled.remoteStatus,
      last_error: null,
      synced_at: syncedAt,
      updated_at: syncedAt,
    })
    .eq("receivable_id", receivable.id)
    .eq("provider_code", "banese_card")
    .eq("environment", environment)
    .eq("payment_method", "BOLETO")
    .or(transactionTitleFilter(nossoNumero));
  if (transactionError) throw transactionError;

  return {
    receivable: updated,
    remotePaymentId: nossoNumero,
    remoteStatus: canceled.remoteStatus,
    alreadyCanceled: canceled.alreadyCanceled,
  };
};
