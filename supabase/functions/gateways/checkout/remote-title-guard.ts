const NON_PAYABLE_REMOTE_STATUSES = new Set([
  "CANCELED",
  "CANCELLED",
  "CANCELED_BY_BANK",
  "DELETED",
  "EXPIRED",
  "REJECTED",
  "REJECTED_TIMEOUT",
]);

export const remoteTitleStatus = (receivable: any) =>
  String(receivable?.gateway_status || receivable?.asaas_status || "")
    .trim()
    .toUpperCase();

export const isRemoteTitleNonPayable = (receivable: any) =>
  String(receivable?.gateway_provider || "").trim().toLowerCase() ===
      "mercado_pago" &&
    Boolean(
      receivable?.gateway_payment_id || receivable?.gateway_payment_link_id,
    )
    ? false
    : NON_PAYABLE_REMOTE_STATUSES.has(remoteTitleStatus(receivable));

export const hasRemoteTitleReference = (receivable: any) =>
  Boolean(
    receivable?.gateway_payment_id ||
      receivable?.gateway_payment_link_id ||
      receivable?.gateway_boleto_nosso_numero ||
      receivable?.asaas_payment_id ||
      receivable?.asaas_payment_link_id,
  );

export const hasAmbiguousGatewaySubmission = (receivable: any) =>
  String(
    receivable?.gateway_submission_status || "",
  ).trim().toUpperCase() === "API_AMBIGUOUS";

const ambiguousGatewaySubmissionError = (receivable: any) => {
  const provider = String(receivable?.gateway_provider || "")
    .trim().toLowerCase();
  if (provider === "asaas") {
    return new Error(
      "A criacao do titulo bancario ficou ambigua. Recupere a cobranca canonicamente pelo externalReference antes de cancelar ou realizar baixa manual.",
    );
  }
  const providerLabel = provider === "banese_card"
    ? "Banese"
    : provider === "mercado_pago"
    ? "Mercado Pago"
    : "provedor configurado";
  return new Error(
    `A criacao do titulo ${providerLabel} ficou ambigua. A tentativa foi preservada e nenhum novo POST sera feito automaticamente. Reconcilie manual e canonicamente no provedor antes de liberar uma nova emissao.`,
  );
};

export const assertNoAmbiguousGatewaySubmission = (receivable: any) => {
  if (hasAmbiguousGatewaySubmission(receivable)) {
    throw ambiguousGatewaySubmissionError(receivable);
  }
};

export const hasAmbiguousRemoteCreation = (receivable: any) => {
  const hasCreatingStatus = [
    receivable?.gateway_status,
    receivable?.asaas_status,
  ].some((value) => String(value || "").trim().toUpperCase() === "CREATING");
  return hasAmbiguousGatewaySubmission(receivable) ||
    (hasCreatingStatus && !hasRemoteTitleReference(receivable));
};

export const assertNoAmbiguousRemoteCreation = (receivable: any) => {
  if (hasAmbiguousRemoteCreation(receivable)) {
    if (hasAmbiguousGatewaySubmission(receivable)) {
      throw ambiguousGatewaySubmissionError(receivable);
    }
    throw new Error(
      "A criacao do titulo bancario ficou ambigua. Recupere a cobranca canonicamente pelo externalReference antes de cancelar ou realizar baixa manual.",
    );
  }
};

export const assertNoActiveCnabSubmission = (receivable: any) => {
  const channel = String(receivable?.gateway_submission_channel || "")
    .trim().toUpperCase();
  const status = String(receivable?.gateway_submission_status || "")
    .trim().toUpperCase();
  if (channel === "CNAB") {
    throw new Error(
      `A cobrança pertence ao canal CNAB Banese (${
        status || "SEM_STATUS"
      }) e não pode ser reenviada pela API. Faça a regularização no próprio fluxo CNAB.`,
    );
  }
};

export const hasActiveRemoteTitleReference = (receivable: any) =>
  hasRemoteTitleReference(receivable) && !isRemoteTitleNonPayable(receivable);

export const boletoIssuedAtAfterReset = (
  receivable: any,
  preserveSameBaneseTitle: boolean,
) =>
  preserveSameBaneseTitle ? receivable?.gateway_boleto_issued_at || null : null;

export const assertGatewayTitleCanBeReset = (
  receivable: any,
  options: { allowBaneseRecovery?: boolean } = {},
) => {
  assertNoActiveCnabSubmission(receivable);
  assertNoAmbiguousRemoteCreation(receivable);
  if (!hasActiveRemoteTitleReference(receivable)) return;
  if (options.allowBaneseRecovery === true) return;

  throw new Error(
    "Ja existe um titulo bancario ativo para esta cobranca. Cancele e confirme a baixa no provedor antes de trocar a forma de pagamento ou emitir outro titulo.",
  );
};

export const assertMercadoPagoManualSettlementAllowed = (receivable: any) => {
  const provider = normalizedGatewayProvider(receivable);
  const hasGatewayReference = hasGenericGatewayReference(receivable);

  if (provider === "mercado_pago") {
    throw new Error(
      "A cobranca possui vinculo com o Mercado Pago. A baixa manual permanece bloqueada ate existir um fluxo que expire a preferencia e confirme canonicamente que ela deixou de aceitar pagamentos.",
    );
  }
  assertNoAmbiguousRemoteCreation(receivable);

  if (!hasGatewayReference) return;
  if (!provider) {
    throw new Error(
      "A cobranca possui referencia bancaria sem provedor identificado. Reconcilie o provedor e o titulo remoto antes da baixa manual.",
    );
  }
  if (!["asaas", "banese_card"].includes(provider)) {
    throw new Error(
      "A cobranca pertence a um provedor sem fluxo canonico de cancelamento para baixa manual.",
    );
  }
  if (
    provider === "asaas" &&
    (
      (receivable?.gateway_payment_id && !receivable?.asaas_payment_id) ||
      (receivable?.gateway_payment_link_id &&
        !receivable?.asaas_payment_link_id) ||
      (receivable?.gateway_payment_id && receivable?.asaas_payment_id &&
        receivable.gateway_payment_id !== receivable.asaas_payment_id) ||
      (receivable?.gateway_payment_link_id &&
        receivable?.asaas_payment_link_id &&
        receivable.gateway_payment_link_id !==
          receivable.asaas_payment_link_id) ||
      receivable?.gateway_boleto_nosso_numero
    )
  ) {
    throw new Error(
      "A cobranca Asaas possui identidade remota inconsistente. Reconcilie os identificadores antes da baixa manual.",
    );
  }
};

const normalizedGatewayProvider = (receivable: any) =>
  String(receivable?.gateway_provider || "").trim().toLowerCase();

const hasGenericGatewayReference = (receivable: any) =>
  Boolean(
    receivable?.gateway_payment_id ||
      receivable?.gateway_payment_link_id ||
      receivable?.gateway_boleto_nosso_numero,
  );

export const assertAsaasReceivableCancellationAllowed = (receivable: any) => {
  const provider = normalizedGatewayProvider(receivable);

  if (provider === "banese_card") {
    throw new Error(
      "Cobranca Banese nao pode ser cancelada pelo fluxo Asaas. Use o cancelador e a conciliacao especificos do Banese.",
    );
  }

  if (provider === "mercado_pago") {
    throw new Error(
      "Cobranca com referencia Mercado Pago nao pode ser cancelada localmente. Primeiro expire a preferencia no Mercado Pago e confirme canonicamente que ela deixou de aceitar pagamentos.",
    );
  }
  assertNoAmbiguousRemoteCreation(receivable);

  if (provider && provider !== "asaas" && provider !== "mercado_pago") {
    throw new Error(
      "Cobranca de outro provedor nao pode ser cancelada pelo fluxo Asaas.",
    );
  }

  if (!provider && hasGenericGatewayReference(receivable)) {
    throw new Error(
      "Cobranca com referencia bancaria sem provedor identificado nao pode ser cancelada pelo fluxo Asaas. Reconcilie o provedor antes de continuar.",
    );
  }

  if (
    provider === "asaas" &&
    (
      (receivable?.gateway_payment_id && !receivable?.asaas_payment_id) ||
      (receivable?.gateway_payment_link_id &&
        !receivable?.asaas_payment_link_id) ||
      (receivable?.gateway_payment_id && receivable?.asaas_payment_id &&
        receivable.gateway_payment_id !== receivable.asaas_payment_id) ||
      (receivable?.gateway_payment_link_id &&
        receivable?.asaas_payment_link_id &&
        receivable.gateway_payment_link_id !==
          receivable.asaas_payment_link_id) ||
      receivable?.gateway_boleto_nosso_numero
    )
  ) {
    throw new Error(
      "Cobranca Asaas com identidade remota inconsistente nao pode ser cancelada. Reconcilie os identificadores antes de continuar.",
    );
  }
};

const REMOTE_IDENTITY_FIELDS = [
  "gateway_provider",
  "gateway_environment",
  "gateway_payment_method",
  "gateway_payment_id",
  "gateway_payment_link_id",
  "gateway_boleto_nosso_numero",
  "asaas_payment_id",
  "asaas_payment_link_id",
] as const;

export const applyReceivableSnapshotFields = (
  query: any,
  receivable: any,
  fields: readonly string[],
) => {
  let filtered = query;
  for (const field of fields) {
    const value = receivable?.[field];
    if (value === null || value === undefined) {
      filtered = filtered.is(field, null);
      continue;
    }
    // supabase-js converte objetos recebidos por `.eq()` em "[object Object]",
    // que não é um literal JSON válido para colunas json/jsonb. `.filter()`
    // permite enviar o snapshot serializado e manter a trava CAS também nesses
    // campos, sem enfraquecer a proteção contra alterações concorrentes.
    filtered = typeof value === "object"
      ? filtered.filter(field, "eq", JSON.stringify(value))
      : filtered.eq(field, value);
  }
  return filtered;
};

export const applyRemoteIdentitySnapshot = (query: any, receivable: any) => {
  return applyReceivableSnapshotFields(
    query,
    receivable,
    REMOTE_IDENTITY_FIELDS,
  );
};
