import {
  authorizationErrorHttpStatus,
  requireGestorAtivo,
  requireGestorForPolo,
  requireGestorTab,
} from "../_shared/authz.ts";
import { isAllowedBaneseLogoUrl } from "../banese-carnet-document/document-policy.ts";
import {
  buildOtherCreditCarnetDocumentInputs,
  OTHER_CREDIT_CARNET_MAX_ITEMS,
  type OtherCreditCarnetRow,
  OtherCreditDocumentError,
  type OtherCreditPlanDocument,
  selectOtherCreditCarnetDocumentRows,
} from "./document-policy.ts";

export const OTHER_CREDIT_CARNET_SELECT = `
  id, cliente_id, matricula_id, turma_id, origem_cronograma_id, polo_id, categoria,
  descricao, tipo_lancamento, parcela_numero, valor, data_vencimento, status,
  origem_pagamento, outros_creditos_plano_id, outros_creditos_papel,
  regra_financeira_outros_creditos_snapshot, gateway_provider, gateway_environment,
  gateway_payment_method, gateway_status, gateway_submission_status,
  gateway_payment_id, gateway_last_error, asaas_last_error,
  gateway_pix_payload, gateway_pix_encoded_image, gateway_boleto_issued_at,
  gateway_boleto_linha_digitavel, gateway_boleto_codigo_barras,
  gateway_boleto_nosso_numero, gateway_boleto_convenio, gateway_boleto_agencia,
  gateway_issuer_polo_id, gateway_financial_terms, gateway_financial_terms_confirmed_at
`;

/** An authenticated read of one immutable plan; downloading never issues a title. */
export const readOtherCreditCarnetDocument = async (
  req: Request,
  admin: any,
  planId: string,
) => {
  let gestor;
  try {
    gestor = await requireGestorAtivo(req, admin);
  } catch (error) {
    const status = authorizationErrorHttpStatus(
      error instanceof Error ? error.message : "",
    ) ?? 503;
    throw new OtherCreditDocumentError(
      status,
      status === 401
        ? "Autenticação obrigatória para baixar o carnê."
        : "Não foi possível autorizar o acesso ao carnê.",
    );
  }
  try {
    requireGestorTab(gestor, "financeiro", "outros-creditos");
  } catch {
    throw new OtherCreditDocumentError(
      403,
      "Acesso a Outros Créditos não autorizado.",
    );
  }

  const { data: plan, error: planError } = await admin.from(
    "outros_creditos_planos",
  )
    .select("id,polo_id,cliente_id,preview").eq("id", planId).maybeSingle();
  if (planError) {
    throw new OtherCreditDocumentError(
      503,
      "Não foi possível consultar o plano.",
    );
  }
  if (!plan || plan.id !== planId) {
    throw new OtherCreditDocumentError(
      404,
      "Plano de Outros Créditos não encontrado.",
    );
  }
  try {
    requireGestorForPolo(gestor, plan.polo_id);
  } catch {
    throw new OtherCreditDocumentError(
      403,
      "Acesso ao carnê deste polo não autorizado.",
    );
  }

  const { data: candidates, error: candidatesError } = await admin.from(
    "contas_receber",
  )
    .select(OTHER_CREDIT_CARNET_SELECT)
    .eq("outros_creditos_plano_id", planId)
    .order("id", { ascending: true }).limit(OTHER_CREDIT_CARNET_MAX_ITEMS + 1);
  if (candidatesError) {
    throw new OtherCreditDocumentError(
      503,
      "Não foi possível consultar os títulos do carnê.",
    );
  }
  const rows = selectOtherCreditCarnetDocumentRows(
    plan as OtherCreditPlanDocument,
    (candidates ?? []) as OtherCreditCarnetRow[],
  );
  const selected = rows[0];
  const [payerResult, issuerResult, credentialResult] = await Promise.all([
    admin.from("parceiros").select(
      "id,nome,cpf_cnpj,endereco,numero,complemento,bairro,cidade,uf,cep",
    )
      .eq("id", plan.cliente_id).maybeSingle(),
    admin.from("polos").select(
      "id,nome,cnpj,endereco,numero,complemento,bairro,cidade,estado,cep,logo_url",
    )
      .eq("id", selected.gateway_issuer_polo_id).maybeSingle(),
    admin.from("payment_gateway_credentials").select("metadata")
      .eq("provider_code", "banese_card").eq(
        "environment",
        selected.gateway_environment,
      ).maybeSingle(),
  ]);
  if (payerResult.error || issuerResult.error || credentialResult.error) {
    throw new OtherCreditDocumentError(
      503,
      "Não foi possível consultar os dados do documento.",
    );
  }
  if (!payerResult.data || !issuerResult.data || !credentialResult.data) {
    throw new OtherCreditDocumentError(
      409,
      "Pagador ou beneficiário incompleto para montar o carnê.",
    );
  }
  return {
    inputs: buildOtherCreditCarnetDocumentInputs(
      rows,
      payerResult.data,
      issuerResult.data,
      credentialResult.data.metadata,
    ),
    issuer: issuerResult.data,
  };
};

export const otherCreditDocumentImage = async (
  rawUrl: unknown,
  projectHost: string,
) => {
  if (!isAllowedBaneseLogoUrl(rawUrl, projectHost)) return null;
  try {
    const response = await fetch(String(rawUrl), {
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    const contentType = (response.headers.get("content-type") ?? "").split(
      ";",
    )[0].toLowerCase();
    if (!response.ok || !["image/png", "image/jpeg"].includes(contentType)) {
      return null;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1_500_000) return null;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${contentType};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
};
