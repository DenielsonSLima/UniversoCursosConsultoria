import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  bearerTokenFromRequest,
  requireFinanceDocumentReadAccess,
  requireGestorAtivo,
  requireGestorForPolo,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
} from "../_shared/http.ts";
import {
  BANESE_DOCUMENT_SECURITY_HEADERS,
  isUniqueEligibleBaneseStudentOwner,
} from "../banese-boleto-document/document-policy.ts";
import { buildBaneseCarnetPdf } from "../banese/internal/carne/carne-pdf.ts";
import {
  BANESE_CARNET_MAX_ITEMS,
  BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES,
  BaneseCarnetPolicyError,
  type BaneseCarnetReceivableRow,
  isAllowedBaneseLogoUrl,
  readBaneseCarnetScope,
  selectBaneseCarnetDocumentRows,
  takeRegisteredBaneseCarnetCandidateRows,
} from "./document-policy.ts";
import { buildBaneseCarnetDocumentInputs } from "./document-input.ts";
import { loadBaneseAcademicBillingContext } from "../banese/internal/technical-billing-context.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RECEIVABLE_SELECT = `
  id, cliente_id, matricula_id, polo_id, descricao, tipo_lancamento,
  parcela_numero, valor, data_vencimento, status, gateway_provider,
  gateway_environment, gateway_payment_method, gateway_status,
  gateway_pix_payload, gateway_pix_encoded_image, gateway_boleto_issued_at,
  gateway_boleto_linha_digitavel, gateway_boleto_codigo_barras,
  gateway_boleto_nosso_numero, gateway_boleto_convenio,
  gateway_boleto_agencia, gateway_issuer_polo_id, gateway_financial_terms,
  gateway_financial_terms_confirmed_at
`;
const CANDIDATE_QUERY_PAGE_SIZE = 100;
const MAX_CANDIDATE_ROWS_SCANNED = 10_000;

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const text = (value: unknown) => String(value ?? "").trim();
const escapedIlikeLiteral = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

const secureHeaders = (req: Request) => ({
  ...buildCorsHeaders(req, { methods: "POST, OPTIONS" }),
  ...BANESE_DOCUMENT_SECURITY_HEADERS,
  "Cross-Origin-Resource-Policy": "same-site",
});

const jsonError = (req: Request, status: number, message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...secureHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
    },
  });

const parseReceivableId = async (req: Request) => {
  const raw = await req.text();
  if (!raw || raw.length > 1_024) {
    throw new HttpError(400, "Cobrança inválida.");
  }
  try {
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new HttpError(400, "Cobrança inválida.");
    }
    const record = body as Record<string, unknown>;
    if (
      Object.keys(record).length !== 1 ||
      !Object.prototype.hasOwnProperty.call(record, "receivableId")
    ) {
      throw new HttpError(
        400,
        "Informe somente o identificador da cobrança.",
      );
    }
    const receivableId = text(record.receivableId);
    if (!UUID_RE.test(receivableId)) {
      throw new HttpError(400, "Cobrança inválida.");
    }
    return receivableId;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Cobrança inválida.");
  }
};

const imageAsDataUrl = async (
  rawUrl: unknown,
  projectHost: string,
) => {
  let url: URL;
  try {
    url = new URL(text(rawUrl));
  } catch {
    return null;
  }
  if (!isAllowedBaneseLogoUrl(url.href, projectHost)) {
    return null;
  }
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(4_000),
    });
    const contentType = text(response.headers.get("content-type"))
      .split(";")[0]
      .toLowerCase();
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

const authorize = async (
  req: Request,
  admin: SupabaseClient,
  payer: Record<string, unknown>,
  email: string,
  poloId: string | null,
) => {
  const { data: studentOwners, error: studentOwnersError } = await admin
    .from("parceiros")
    .select("id,tipo,email,status")
    .eq("tipo", "Aluno")
    .ilike("email", escapedIlikeLiteral(email))
    .limit(2);
  if (studentOwnersError) throw studentOwnersError;
  if (
    isUniqueEligibleBaneseStudentOwner(
      studentOwners ?? [],
      payer.id,
      email,
    )
  ) return;

  try {
    const gestor = await requireGestorAtivo(req, admin);
    requireFinanceDocumentReadAccess(gestor);
    requireGestorForPolo(gestor, poloId);
  } catch {
    throw new HttpError(403, "Sem permissão para visualizar este carnê.");
  }
};

const readRegisteredCarnetCandidates = async (
  admin: SupabaseClient,
  selected: BaneseCarnetReceivableRow,
) => {
  const scope = readBaneseCarnetScope(selected);
  let registeredRows: BaneseCarnetReceivableRow[] = [];
  for (
    let offset = 0;
    offset < MAX_CANDIDATE_ROWS_SCANNED;
    offset += CANDIDATE_QUERY_PAGE_SIZE
  ) {
    let query = admin.from("contas_receber")
      .select(RECEIVABLE_SELECT)
      .eq("cliente_id", scope.clientId)
      .eq("matricula_id", scope.enrollmentId)
      .eq("gateway_provider", "banese_card")
      .eq("gateway_environment", scope.environment)
      .eq("gateway_payment_method", "BOLETO")
      .eq("tipo_lancamento", "PARCELA")
      .eq("gateway_issuer_polo_id", scope.issuerId)
      .eq("gateway_boleto_convenio", scope.agreement)
      .in("gateway_boleto_agencia", [
        scope.agency,
        String(Number(scope.agency)),
      ])
      .in("status", [...BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES])
      .order("parcela_numero", { ascending: true })
      .order("data_vencimento", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + CANDIDATE_QUERY_PAGE_SIZE - 1);
    query = scope.poloId
      ? query.eq("polo_id", scope.poloId)
      : query.is("polo_id", null);
    const { data, error } = await query;
    if (error) throw error;
    const pageRows = (data ?? []) as BaneseCarnetReceivableRow[];
    registeredRows = takeRegisteredBaneseCarnetCandidateRows([
      ...registeredRows,
      ...pageRows,
    ]);
    if (
      registeredRows.length > BANESE_CARNET_MAX_ITEMS ||
      pageRows.length < CANDIDATE_QUERY_PAGE_SIZE
    ) return registeredRows;
  }
  throw new HttpError(
    422,
    "Há títulos demais nesta matrícula para montar um carnê seguro.",
  );
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: secureHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonError(req, 405, "Método não permitido.");
  }
  if (
    isRateLimitExceeded(
      `banese-carnet-document:${getClientIp(req)}`,
      12,
      60_000,
    )
  ) {
    return jsonError(
      req,
      429,
      "Muitas solicitações. Aguarde alguns instantes.",
    );
  }

  try {
    const token = bearerTokenFromRequest(req);
    if (!token) throw new HttpError(401, "Autenticação obrigatória.");
    const receivableId = await parseReceivableId(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuração Supabase indisponível.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(
      token,
    );
    const email = text(authData.user?.email).toLowerCase();
    if (authError || !email) throw new HttpError(401, "Sessão inválida.");

    const { data: selectedData, error: selectedError } = await admin
      .from("contas_receber")
      .select(RECEIVABLE_SELECT)
      .eq("id", receivableId)
      .eq("gateway_provider", "banese_card")
      .eq("gateway_payment_method", "BOLETO")
      .maybeSingle();
    if (selectedError) throw selectedError;
    if (!selectedData) {
      throw new HttpError(404, "Parcela Banese não encontrada.");
    }
    const selected = selectedData as BaneseCarnetReceivableRow;

    const { data: payerData, error: payerError } = await admin
      .from("parceiros")
      .select(
        "id,nome,tipo,cpf_cnpj,email,status,endereco,numero,complemento,bairro,cidade,uf,cep",
      )
      .eq("id", text(selected.cliente_id))
      .maybeSingle();
    if (payerError) throw payerError;
    if (!payerData) {
      throw new HttpError(404, "Parcela Banese não encontrada.");
    }
    const payer = payerData as Record<string, unknown>;
    await authorize(req, admin, payer, email, text(selected.polo_id) || null);
    const scope = readBaneseCarnetScope(selected);

    const [candidatesResult, issuerResult, credentialResult] = await Promise
      .all([
        readRegisteredCarnetCandidates(admin, selected),
        admin.from("polos").select(
          "id,nome,cnpj,endereco,numero,complemento,bairro,cidade,estado,cep,logo_url",
        ).eq("id", scope.issuerId).maybeSingle(),
        admin.from("payment_gateway_credentials").select("metadata")
          .eq("provider_code", "banese_card")
          .eq("environment", scope.environment)
          .maybeSingle(),
      ]);
    if (issuerResult.error) throw issuerResult.error;
    if (credentialResult.error) throw credentialResult.error;
    if (!issuerResult.data || !credentialResult.data) {
      throw new HttpError(
        422,
        "Beneficiário Banese indisponível para montar o carnê.",
      );
    }

    const rows = selectBaneseCarnetDocumentRows(
      selected,
      candidatesResult,
    );
    const academicContext = await loadBaneseAcademicBillingContext(
      admin,
      selected.matricula_id,
      selected.turma_id,
    );
    const inputs = buildBaneseCarnetDocumentInputs(
      rows,
      payer,
      issuerResult.data as Record<string, unknown>,
      credentialResult.data.metadata,
      academicContext,
    );

    const projectHost = new URL(supabaseUrl).hostname;
    const [issuerLogo, bankLogo] = await Promise.all([
      imageAsDataUrl(issuerResult.data.logo_url, projectHost),
      imageAsDataUrl(
        "https://universocc.com.br/logos/payment-gateways/banese.png",
        projectHost,
      ),
    ]);
    const pdf = await buildBaneseCarnetPdf(inputs, {
      maxItems: BANESE_CARNET_MAX_ITEMS,
      branding: {
        companyLogoBase64: issuerLogo,
        bankLogoBase64: bankLogo,
      },
    });

    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        ...secureHeaders(req),
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition":
          `attachment; filename="carne-banese-${selected.id}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(req, error.status, error.message);
    }
    if (error instanceof BaneseCarnetPolicyError) {
      return jsonError(req, 409, error.message);
    }
    console.error("banese-carnet-document failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonError(
      req,
      422,
      "Não foi possível montar o carnê Banese com segurança.",
    );
  }
});
