import {
  type BaneseCnab240RemittanceTitleInput,
  buildBaneseCnab240Remittance,
} from "../gateways/api/banese-cnab240.remittance.ts";
import { resolveBaneseReceivableFinancialTerms } from "../gateways/api/banese-financial-terms.ts";
import { normalizeBaneseFinancialTerms } from "../banese/internal/financial-terms.ts";
import {
  assertReceivableEligibleForCnabRemittance,
  BANESE_CNAB_PROVIDER,
  type CnabEnvironment,
  normalizeUuidList,
} from "./policy.ts";
import type { PreparedRemittance } from "./remittance-types.ts";
import { digits, loadCnabContext, sha256Text } from "./shared.ts";

const fixedText = (value: unknown, width: number) =>
  String(value || "").trim().slice(0, width);

export const toBaneseCivilDate = (value: unknown) => {
  const raw = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Data de criação da cobrança é inválida para a remessa.");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Maceio",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
};

const parseAccount = (value: unknown) => {
  const raw = String(value || "").trim();
  const accountPart = raw.includes("/") ? raw.split("/").pop()! : raw;
  const match = accountPart.match(/^(\d+)(?:[-.]([0-9A-Za-z]))?$/);
  if (!match) {
    throw new Error("Conta beneficiária Banese inválida para o CNAB240.");
  }
  return { accountNumber: match[1], accountDigit: match[2] || null };
};

const loadCredentialMetadata = async (
  admin: any,
  environment: CnabEnvironment,
) => {
  const { data, error } = await admin
    .from("payment_gateway_credentials")
    .select("metadata")
    .eq("provider_code", BANESE_CNAB_PROVIDER)
    .eq("environment", environment)
    .maybeSingle();
  if (error) throw error;
  return data?.metadata && typeof data.metadata === "object"
    ? data.metadata as Record<string, unknown>
    : {};
};

const loadSelectedReceivables = async (
  admin: any,
  ids: string[],
  environment: CnabEnvironment,
) => {
  const { data, error } = await admin
    .from("contas_receber")
    .select(
      "id,cliente_id,matricula_id,turma_id,polo_id,descricao,valor,data_vencimento,created_at,updated_at,status,tipo_lancamento,parcela_numero,regra_financeira_plano_unico_snapshot,gateway_installments,gateway_provider,gateway_environment,gateway_payment_method,gateway_payment_id,gateway_payment_link_id,gateway_boleto_nosso_numero,gateway_boleto_convenio,gateway_boleto_agencia,gateway_boleto_linha_digitavel,gateway_boleto_codigo_barras,gateway_boleto_issued_at,gateway_invoice_url,gateway_bank_slip_url,gateway_creation_token,gateway_status,gateway_last_error,gateway_financial_terms,gateway_financial_terms_confirmed_at,gateway_submission_channel,gateway_submission_status,gateway_cnab_file_id",
    )
    .in("id", ids)
    .limit(ids.length);
  if (error) throw error;
  const byId = new Map<string, any>(
    (data || []).map((row: any): [string, any] => [row.id, row]),
  );
  if (byId.size !== ids.length) {
    throw new Error(
      "Uma ou mais cobranças selecionadas não foram encontradas.",
    );
  }
  const receivables: any[] = ids.map((id) => byId.get(id));
  receivables.forEach((receivable) =>
    assertReceivableEligibleForCnabRemittance(receivable, environment)
  );

  const { data: transactions, error: transactionError } = await admin
    .from("payment_gateway_transactions")
    .select("id,receivable_id")
    .eq("provider_code", BANESE_CNAB_PROVIDER)
    .eq("environment", environment)
    .in("receivable_id", ids)
    .limit(ids.length + 1);
  if (transactionError) throw transactionError;
  if ((transactions || []).length) {
    throw new Error(
      "Existe transação bancária para uma cobrança selecionada; a remessa foi bloqueada para evitar duplicidade.",
    );
  }
  return receivables;
};

const loadPayers = async (admin: any, receivables: any[]) => {
  if (receivables.some((row) => !row.cliente_id)) {
    throw new Error("Toda cobrança da remessa deve possuir um pagador.");
  }
  const ids = [...new Set(receivables.map((row) => row.cliente_id))];
  const { data, error } = await admin
    .from("parceiros")
    .select(
      "id,nome,cpf_cnpj,endereco,numero,complemento,cep,bairro,cidade,uf,estado",
    )
    .in("id", ids)
    .limit(ids.length);
  if (error) throw error;
  const byId = new Map<string, any>(
    (data || []).map((row: any): [string, any] => [row.id, row]),
  );
  if (byId.size !== ids.length) {
    throw new Error(
      "Cadastro do pagador não foi localizado para toda a remessa.",
    );
  }
  return byId;
};

const payerAddress = (payer: any) => {
  const street = String(payer.endereco || "").trim();
  const number = String(payer.numero || "").trim();
  const complement = String(payer.complemento || "").trim();
  return `${[street, number].filter(Boolean).join(", ")}${
    complement ? ` - ${complement}` : ""
  }`;
};

const termsForRemittance = async (admin: any, receivable: any) => {
  if (
    receivable.gateway_financial_terms &&
    receivable.gateway_financial_terms_confirmed_at
  ) {
    return normalizeBaneseFinancialTerms({
      ...receivable.gateway_financial_terms,
      nominalAmount: Number(receivable.valor || 0),
      dueDate: String(receivable.data_vencimento || "").slice(0, 10),
    });
  }
  return normalizeBaneseFinancialTerms(
    await resolveBaneseReceivableFinancialTerms(admin, receivable),
  );
};

export const prepareRemittance = async (
  admin: any,
  idsValue: unknown,
  requestedEnvironment?: unknown,
): Promise<PreparedRemittance> => {
  const ids = normalizeUuidList(idsValue, 200);
  const context = await loadCnabContext(admin, requestedEnvironment);
  if (!/^\d{5}$/.test(context.convenio)) {
    throw new Error("O convênio Banese deve possuir 5 dígitos para a remessa.");
  }
  const metadata = await loadCredentialMetadata(admin, context.environment);
  const receivables = await loadSelectedReceivables(
    admin,
    ids,
    context.environment,
  );
  const payers = await loadPayers(admin, receivables);
  const account = parseAccount(
    metadata.baneseConta || metadata.baneseContaDisplay,
  );
  const beneficiary = {
    name: fixedText(metadata.baneseBeneficiarioNome, 30),
    document: String(metadata.baneseBeneficiarioInscricao || "").trim(),
    agency: digits(metadata.baneseAgencia),
    agencyDigit: null,
    accountNumber: account.accountNumber,
    accountDigit: account.accountDigit,
  };
  const documentSpecies = String(metadata.baneseCodigoEspecie || "21");
  const writeOffDays = Number(metadata.quantidadeDiasBaixaDevolucao ?? 30);

  const titles = await Promise.all(receivables.map(async (receivable) => {
    const payer = payers.get(receivable.cliente_id);
    const ourNumber = digits(receivable.gateway_boleto_nosso_numero);
    if (!/^\d{9}$/.test(ourNumber)) {
      throw new Error(
        "Cobrança sem Nosso Número reservado pela tentativa segura da API.",
      );
    }
    if (digits(receivable.gateway_boleto_convenio) !== context.convenio) {
      throw new Error(
        "Convênio reservado na cobrança diverge da configuração ativa.",
      );
    }
    if (digits(receivable.gateway_boleto_agencia) !== beneficiary.agency) {
      throw new Error(
        "Agência reservada na cobrança diverge da configuração ativa.",
      );
    }
    const compactId = String(receivable.id || "").replaceAll("-", "");
    const terms = await termsForRemittance(admin, receivable);
    return {
      entryType: "CNAB240_NEW_TITLE" as const,
      registeredByApi: false as const,
      ourNumber,
      documentNumber: `CR${compactId.slice(0, 13)}`,
      companyControlNumber: `CR${compactId.slice(0, 23)}`,
      documentSpecies,
      issueDate: toBaneseCivilDate(receivable.created_at),
      writeOffDays,
      payer: {
        name: fixedText(payer.nome, 40),
        document: String(payer.cpf_cnpj || "").trim(),
        address: fixedText(payerAddress(payer), 40),
        district: fixedText(payer.bairro, 15),
        postalCode: String(payer.cep || "").trim(),
        city: fixedText(payer.cidade, 15),
        state: String(payer.uf || payer.estado || "").trim(),
      },
      financialTerms: terms,
    };
  }));

  buildBaneseCnab240Remittance({
    edi7: context.edi7Code,
    agreement: context.convenio,
    nsa: 1,
    generatedAt: "2026-01-01T00:00:00Z",
    beneficiary,
    titles,
  });
  const fingerprint = await sha256Text(JSON.stringify(stableValue({
    environment: context.environment,
    convenio: context.convenio,
    edi7Code: context.edi7Code,
    receivableIds: receivables.map((row) => row.id),
    titles,
  })));
  return {
    environment: context.environment,
    convenio: context.convenio,
    edi7Code: context.edi7Code,
    beneficiary,
    receivables,
    titles,
    fingerprint,
  };
};

export const publicRemittancePreview = (prepared: PreparedRemittance) => ({
  environment: prepared.environment,
  convenio: prepared.convenio,
  titleCount: prepared.titles.length,
  totalAmount: prepared.titles.reduce(
    (total, title) => total + Number(title.financialTerms.nominalAmount || 0),
    0,
  ),
  previewFingerprint: prepared.fingerprint,
  items: prepared.receivables.map((receivable, index) => ({
    receivableId: receivable.id,
    description: receivable.descricao,
    dueDate: receivable.data_vencimento,
    nominalAmount: Number(receivable.valor || 0),
    nossoNumero: prepared.titles[index].ourNumber,
    installmentNumber: Number(receivable.parcela_numero || 0) || null,
    installmentCount: Number(receivable.gateway_installments || 0) || null,
    financialTerms: {
      nominalAmount: Number(
        prepared.titles[index].financialTerms.nominalAmount || 0,
      ),
      dueDate: prepared.titles[index].financialTerms.dueDate,
      discount: prepared.titles[index].financialTerms.discount || null,
      penalty: prepared.titles[index].financialTerms.penalty || null,
      interest: prepared.titles[index].financialTerms.interest || null,
    },
    hasDiscount: Boolean(prepared.titles[index].financialTerms.discount),
    hasPenalty: Boolean(prepared.titles[index].financialTerms.penalty),
    hasInterest: Boolean(prepared.titles[index].financialTerms.interest),
  })),
});

export const remittanceLineNumbers = (
  titles: BaneseCnab240RemittanceTitleInput[],
) => {
  let line = 3;
  return titles.map((title) => {
    const current = line;
    line += title.financialTerms.penalty ? 3 : 2;
    return current;
  });
};
