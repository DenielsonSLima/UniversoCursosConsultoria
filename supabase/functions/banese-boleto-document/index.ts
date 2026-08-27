import { createClient } from "npm:@supabase/supabase-js@2";
import {
  bearerTokenFromRequest,
  requireBaneseBoletoDocumentReadAccess,
  requireGestorAtivo,
  requireGestorForPolo,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
} from "../_shared/http.ts";
import { buildBaneseBoletoPdf } from "../banese/internal/boletos/boleto-pdf.ts";
import type {
  BaneseBoletoDocumentInput,
  BaneseDocumentAddress,
} from "../banese/internal/types.ts";
import { loadBaneseAcademicBillingContext } from "../banese/internal/technical-billing-context.ts";
import {
  buildBaneseDependencyBillingInstructions,
  buildBaneseTechnicalBillingInstructions,
} from "../banese/internal/technical-billing-instructions.ts";
import {
  dependencyBillingSnapshotFrom,
  isDependencyReceivable,
} from "../banese/internal/dependency-billing.ts";
import {
  allowedBaneseLogoUrl,
  BANESE_DOCUMENT_SECURITY_HEADERS,
  baneseBoletoIssueDate,
  isUniqueEligibleBaneseStudentOwner,
} from "./document-policy.ts";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const secureHeaders = (req: Request) => ({
  ...buildCorsHeaders(req, { methods: "POST, OPTIONS" }),
  ...BANESE_DOCUMENT_SECURITY_HEADERS,
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
  const text = await req.text();
  if (!text || text.length > 1_024) {
    throw new HttpError(400, "Cobrança inválida.");
  }
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const id = String(body.receivableId ?? "").trim();
    if (!UUID_RE.test(id)) throw new HttpError(400, "Cobrança inválida.");
    return id;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Cobrança inválida.");
  }
};

const text = (value: unknown) => String(value ?? "").trim();
const digits = (value: unknown) => text(value).replace(/\D/g, "");
const escapedIlikeLiteral = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

const addressFrom = (party: Record<string, unknown>): BaneseDocumentAddress => {
  const street = [
    text(party.endereco),
    text(party.numero),
    text(party.complemento),
  ]
    .filter(Boolean)
    .join(", ");
  return {
    street,
    district: text(party.bairro),
    city: text(party.cidade),
    state: text(party.estado || party.uf).toUpperCase(),
    postalCode: digits(party.cep),
  };
};

const fetchImageAsDataUrl = async (url: unknown) => {
  const value = allowedBaneseLogoUrl(url);
  if (!value) return null;
  try {
    const response = await fetch(value, {
      signal: AbortSignal.timeout(4_000),
      redirect: "error",
    });
    const contentType = text(response.headers.get("content-type")).split(";")[0]
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

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: secureHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonError(req, 405, "Método não permitido.");
  }
  if (
    isRateLimitExceeded(
      `banese-boleto-document:${getClientIp(req)}`,
      40,
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
      throw new Error("Configuração indisponível.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(
      token,
    );
    const email = text(authData.user?.email).toLowerCase();
    if (authError || !email) throw new HttpError(401, "Sessão inválida.");

    const { data: row, error: receivableError } = await admin
      .from("contas_receber")
      .select(`
        id, cliente_id, matricula_id, turma_id, polo_id, descricao, valor, data_vencimento,
        tipo_lancamento, regra_financeira_dependencia_snapshot,
        gateway_boleto_issued_at,
        gateway_environment, gateway_payment_id, gateway_pix_payload,
        gateway_pix_encoded_image, gateway_boleto_linha_digitavel,
        gateway_boleto_codigo_barras, gateway_boleto_nosso_numero,
        gateway_boleto_convenio, gateway_boleto_agencia,
        gateway_issuer_polo_id, gateway_financial_terms,
        gateway_financial_terms_confirmed_at
      `)
      .eq("id", receivableId)
      .eq("gateway_provider", "banese_card")
      .eq("gateway_payment_method", "BOLETO")
      .maybeSingle();
    if (receivableError) throw receivableError;
    if (!row) throw new HttpError(404, "Boleto Banese não encontrado.");

    const [
      { data: payer, error: payerError },
      { data: issuer, error: issuerError },
      { data: studentOwners, error: studentOwnersError },
    ] = await Promise.all([
      admin.from("parceiros").select(
        "id,nome,tipo,cpf_cnpj,email,status,endereco,numero,complemento,bairro,cidade,uf,cep",
      ).eq("id", row.cliente_id).maybeSingle(),
      admin.from("polos").select(
        "id,nome,cnpj,endereco,numero,bairro,cidade,estado,cep,logo_url",
      ).eq("id", row.gateway_issuer_polo_id).maybeSingle(),
      admin.from("parceiros").select("id,tipo,email,status")
        .eq("tipo", "Aluno")
        .ilike("email", escapedIlikeLiteral(email))
        .limit(2),
    ]);
    if (payerError) throw payerError;
    if (issuerError) throw issuerError;
    if (studentOwnersError) throw studentOwnersError;
    if (!payer || !issuer) {
      throw new HttpError(
        422,
        "Beneficiário ou pagador incompleto para montar o boleto.",
      );
    }

    const isOwner = isUniqueEligibleBaneseStudentOwner(
      studentOwners ?? [],
      payer.id,
      email,
    );
    if (!isOwner) {
      try {
        const gestor = await requireGestorAtivo(req, admin);
        requireBaneseBoletoDocumentReadAccess(gestor, row.tipo_lancamento);
        requireGestorForPolo(gestor, row.polo_id);
      } catch {
        throw new HttpError(403, "Sem permissão para visualizar este boleto.");
      }
    }

    const environment = row.gateway_environment === "production"
      ? "production"
      : "sandbox";
    const { data: credential, error: credentialError } = await admin
      .from("payment_gateway_credentials")
      .select("metadata")
      .eq("provider_code", "banese_card")
      .eq("environment", environment)
      .maybeSingle();
    if (credentialError) throw credentialError;
    const metadata = asRecord(credential?.metadata);
    const dueDate = text(row.data_vencimento).slice(0, 10);
    const issueDate = baneseBoletoIssueDate(row.gateway_boleto_issued_at);
    const amount = Number(row.valor);
    const financialTermsConfirmedAt = text(
      row.gateway_financial_terms_confirmed_at,
    );
    if (
      !row.gateway_financial_terms || !financialTermsConfirmedAt ||
      Number.isNaN(Date.parse(financialTermsConfirmedAt))
    ) {
      throw new HttpError(
        409,
        "As condições financeiras do boleto ainda não foram confirmadas pelo Banese.",
      );
    }
    const pix = environment === "production" && row.gateway_pix_payload &&
        row.gateway_pix_encoded_image
      ? {
        copyAndPaste: text(row.gateway_pix_payload),
        qrCodeBase64: text(row.gateway_pix_encoded_image),
      }
      : null;
    const isDependency = isDependencyReceivable(row);
    const dependencySnapshot = isDependency
      ? dependencyBillingSnapshotFrom(
        row.regra_financeira_dependencia_snapshot,
      )
      : null;
    const dependencyDescription = text(dependencySnapshot?.descricaoCobranca);
    const usesIsolatedDependencyPresentation = Boolean(
      dependencySnapshot && dependencyDescription,
    );
    if (dependencySnapshot && !dependencyDescription) {
      throw new HttpError(
        409,
        "A cobrança de disciplina não possui descrição canônica.",
      );
    }
    // Títulos legados continuam renderizáveis com o compositor que já os
    // acompanhava. Somente títulos novos, com snapshot próprio, recebem a
    // apresentação neutra da disciplina e a regra bancária de 60 dias.
    const academicContext = usesIsolatedDependencyPresentation
      ? null
      : await loadBaneseAcademicBillingContext(
        admin,
        row.matricula_id,
        row.turma_id,
      );

    const input: BaneseBoletoDocumentInput = {
      receivableId: row.id,
      environment,
      digitableLine: text(row.gateway_boleto_linha_digitavel),
      barcode: text(row.gateway_boleto_codigo_barras),
      ourNumber: text(row.gateway_boleto_nosso_numero),
      documentNumber: `B${text(row.gateway_boleto_nosso_numero)}`.slice(0, 15),
      issueDate,
      processingDate: issueDate,
      dueDate,
      amount,
      beneficiary: {
        name: text(metadata.baneseBeneficiarioNome),
        document: text(metadata.baneseBeneficiarioInscricao),
        address: addressFrom(issuer),
        agency: text(metadata.baneseAgencia || row.gateway_boleto_agencia),
        account: text(metadata.baneseConta || metadata.baneseContaDisplay),
        agreement: text(
          row.gateway_boleto_convenio || metadata.baneseBoletoConvenio,
        ),
        beneficiaryCode: text(metadata.baneseCodigoBeneficiario),
        wallet: text(metadata.baneseCarteira) || null,
      },
      payer: {
        name: text(payer.nome),
        document: text(payer.cpf_cnpj),
        address: addressFrom(payer),
      },
      speciesCode: Number(metadata.baneseCodigoEspecie || 21),
      speciesLabel: "ME",
      acceptance: "A",
      instructions: usesIsolatedDependencyPresentation
        ? buildBaneseDependencyBillingInstructions({
          environment,
          documentKind: "boleto",
          description: dependencyDescription,
        })
        : buildBaneseTechnicalBillingInstructions({
          environment,
          documentKind: "boleto",
          description: row.descricao,
          academicContext,
        }),
      financialTerms: {
        ...asRecord(row.gateway_financial_terms),
        nominalAmount: amount,
        dueDate,
      },
      pix,
    };

    const [companyLogoBase64, bankLogoBase64] = await Promise.all([
      fetchImageAsDataUrl(issuer.logo_url),
      fetchImageAsDataUrl(
        "https://universocc.com.br/logos/payment-gateways/banese.png",
      ),
    ]);
    const pdf = await buildBaneseBoletoPdf(input, {
      branding: { companyLogoBase64, bankLogoBase64 },
    });

    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        ...secureHeaders(req),
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="boleto-banese-${row.id}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(req, error.status, error.message);
    }
    console.error("banese-boleto-document failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return jsonError(
      req,
      422,
      "Não foi possível montar o boleto Banese com segurança.",
    );
  }
});
