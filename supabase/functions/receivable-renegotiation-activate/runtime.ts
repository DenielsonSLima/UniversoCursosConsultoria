import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getGatewayRuntimeConfig } from "../gateways/runtime-config.ts";
import { assertStoredProviderAdapterReady } from "../gateways/api/config.ts";
import { getCredential, isCredentialConfiguredForRoute } from "../gateways/api/credentials.ts";
import { resolveGatewayIssuer } from "../gateways/router-adapter-runtime.ts";
import { ActivationError, type ActivationContext, record, UUID_RE } from "./contract.ts";
import type { IssuanceRuntime } from "./issuance.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import { RENEGOTIATION_RECEIPT_INSTRUCTION } from "../banese/internal/renegotiation-billing.ts";
import { assertCancellationSnapshot } from "./cancellation.ts";
import { validateBaneseBoletoPayloadInput } from "../banese/core/adapter/boleto-payload.ts";
import { todayIsoDate } from "../banese/core/adapter/utils.ts";
import { baneseDueDateFactor } from "../banese/internal/bank-fields.ts";

export const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return "{" + Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",") + "}";
  return JSON.stringify(value);
};

export const assertActivationPlan = (context: ActivationContext, today = todayIsoDate()) => {
  if (!context.runtime || !Array.isArray(context.replacementPlan) || !context.replacementPlan.length ||
    context.replacementPlan.length > 120 ||
    new Set(context.replacementPlan.map((entry) => entry.sequence)).size !== context.replacementPlan.length) {
    throw new ActivationError("ACTIVATION_PLAN_MISSING", "Plano bancário completo não confirmado antes do cancelamento.");
  }
  for (const entry of context.replacementPlan) {
    const terms = normalizeBaneseFinancialTerms(entry.financialTerms);
    if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0 ||
      Math.round(terms.nominalAmount * 100) !== entry.amountCents || terms.dueDate !== entry.dueDate ||
      !Number.isInteger(entry.sequence) || entry.sequence < 0 ||
      !["DOWN_PAYMENT", "INSTALLMENT"].includes(entry.kind) ||
      entry.collectionPolicy?.daysAfterDue !== 60 ||
      entry.collectionPolicy.instruction !== RENEGOTIATION_RECEIPT_INSTRUCTION) {
      throw new ActivationError("ACTIVATION_PLAN_INVALID", "Termos das novas parcelas não conferem com o acordo.");
    }
    // Saved plans age. Do not cancel sources or silently shift dates on a later retry.
    if (entry.dueDate < today) throw new ActivationError("ACTIVATION_PLAN_EXPIRED",
      "O cronograma possui vencimento passado. Revise o acordo antes de executar operações bancárias.");
    baneseDueDateFactor(entry.dueDate);
  }
  // Validate every source before the first irreversible bank cancellation.
  for (const source of context.sources) {
    if (source.kind === "BANESE") assertCancellationSnapshot(source.bankSnapshot);
    else if (source.kind !== "LOCAL" || source.bankSnapshot !== null) {
      throw new ActivationError("SOURCE_ORIGIN_INVALID", "Uma parcela possui origem bancária incompatível.");
    }
  }
};

export const assertPlanPayloads = (context: ActivationContext, payer: Record<string, unknown>) => {
  for (const entry of context.replacementPlan) {
    validateBaneseBoletoPayloadInput({
      // Pure validation only. These identifiers are never submitted as new titles.
      admin: { rpc: async () => { throw new Error("Preflight must not access the bank"); } },
      supabaseUrl: "", environment: "production", paymentMethod: "BOLETO",
      receivable: { id: context.agreementId, valor: entry.amountCents / 100,
        data_vencimento: entry.dueDate, tipo_lancamento: "RENEGOCIACAO", metadata: context.runtime.metadata,
        regra_financeira_renegociacao_snapshot: { version: 1, origin: "RENEGOTIATION",
          agreementId: context.agreementId, receiptPolicy: entry.collectionPolicy, financialTerms: entry.financialTerms } },
      payer, description: "Parcela de renegociação", amount: entry.amountCents / 100,
      dueDate: entry.dueDate, financialTerms: entry.financialTerms,
    });
  }
};

export const canonicalAccount = (metadata: Record<string, unknown>) =>
  String(metadata.baneseConta || metadata.baneseContaDisplay || "").replace(/\D/g, "");
export const canonicalCourseType = (value: unknown) =>
  String(value || "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const assertActivationPayer = (context: ActivationContext, payer: Record<string, unknown>) => {
  const document = String(payer.cpfCnpj || "");
  if (![11, 14].includes(document.length) || String(payer.postalCode || "").length !== 8 ||
    !payer.name || !payer.address || !payer.district || !payer.city ||
    !/^[A-Z]{2}$/.test(String(payer.state || "").toUpperCase())) {
    throw new ActivationError("PAYER_REGISTRATION_INCOMPLETE",
      "Complete o cadastro do pagador e retome esta mesma operação. Nenhuma nova baixa ou emissão foi iniciada nesta tentativa.", true);
  }
  if (context.payerDocument !== document || context.sources.some((source) => source.kind === "BANESE" &&
    source.bankSnapshot?.payerDocument !== document)) {
    throw new ActivationError("PAYER_IDENTITY_CHANGED", "CPF/CNPJ atual diverge dos títulos selecionados. Revisão obrigatória.");
  }
};

export const loadActivationRuntime = async (admin: SupabaseClient,
  context: ActivationContext): Promise<IssuanceRuntime> => {
  assertActivationPlan(context);
  const config = await getGatewayRuntimeConfig(admin);
  if (!config.enabled || config.activeEnvironment !== "production") {
    throw new ActivationError("BANESE_ROUTE_DISABLED", "Emissão Banese de produção indisponível.");
  }
  const { data: routes, error } = await admin.from("payment_gateway_routes")
    .select("id,modalidade,provider_code,credential_id,environment,enabled")
    .eq("id", context.runtime.routeId).eq("payment_method", "BOLETO")
    .eq("environment", "production").eq("enabled", true);
  if (error) throw error;
  if (!Array.isArray(routes) || routes.length !== 1 || routes[0].id !== context.runtime.routeId ||
    canonicalCourseType(routes[0].modalidade) !== context.courseType || routes[0].provider_code !== "banese_card") {
    throw new ActivationError("BANESE_ROUTE_INVALID", "O curso não possui rota Banese única para boleto.");
  }
  assertStoredProviderAdapterReady("banese_card", "BOLETO", "production");
  const credential = await getCredential(admin, "banese_card", "production");
  if (!credential || routes[0].credential_id !== credential.id ||
    !await isCredentialConfiguredForRoute(admin, "banese_card", "production", "BOLETO", credential)) {
    throw new ActivationError("BANESE_CREDENTIAL_NOT_READY", "Configuração bancária indisponível para ativação.");
  }
  const issuer = await resolveGatewayIssuer(admin);
  const metadata = record(credential.metadata);
  const account = canonicalAccount(metadata);
  if (context.runtime.credentialId !== credential.id || context.runtime.issuerPoloId !== issuer.id ||
    context.runtime.environment !== "production" || context.runtime.account !== account ||
    canonicalJson(context.runtime.metadata) !== canonicalJson(metadata) ||
    context.runtime.convenio !== String(metadata.baneseBoletoConvenio || metadata.baneseConvenio || "").replace(/\D/g, "") ||
    context.runtime.agency !== String(metadata.baneseAgencia || "").replace(/\D/g, "").padStart(3, "0")) {
    throw new ActivationError("GATEWAY_RUNTIME_CHANGED", "A configuração bancária mudou desde a confirmação. Revisão obrigatória.");
  }
  const { data: person, error: payerError } = await admin.from("parceiros")
    .select("id,nome,email,cpf_cnpj,telefone,endereco,numero,complemento,cep,bairro,cidade,uf,estado,status")
    .eq("id", context.identity.alunoId).maybeSingle();
  if (payerError) throw payerError;
  if (!person || !UUID_RE.test(issuer.id) || !account || person.id !== context.identity.alunoId) {
    throw new ActivationError("BANESE_PARTIES_INVALID", "Emissor ou pagador não confirmado.");
  }
  const payer = {
    id: person.id, name: person.nome, email: person.email,
    cpfCnpj: String(person.cpf_cnpj || "").replace(/\D/g, ""),
    phone: person.telefone, address: person.endereco, number: person.numero,
    complement: person.complemento, postalCode: String(person.cep || "").replace(/\D/g, ""),
    district: person.bairro, city: person.cidade, state: person.uf || person.estado,
  };
  assertActivationPayer(context, payer);
  assertPlanPayloads(context, payer);
  return { credentialId: credential.id, issuerPoloId: issuer.id, account, payer };
};
