import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
} from "../_shared/http.ts";
import { BANESE_DOCUMENT_SECURITY_HEADERS } from "../banese-boleto-document/document-policy.ts";
import { buildBaneseCarnetPdf } from "../banese/internal/carne/carne-pdf.ts";
import {
  otherCreditDocumentImage,
  readOtherCreditCarnetDocument,
} from "./document-reader.ts";
import {
  OTHER_CREDIT_CARNET_MAX_ITEMS,
  OtherCreditDocumentError,
  parseOtherCreditPlanDocumentRequest,
} from "./document-policy.ts";

const headers = (req: Request) => ({
  ...buildCorsHeaders(req, { methods: "POST, OPTIONS" }),
  ...BANESE_DOCUMENT_SECURITY_HEADERS,
  "Cross-Origin-Resource-Policy": "same-site",
});
const fail = (req: Request, status: number, message: string) =>
  new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: {
        ...headers(req),
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: headers(req) });
  }
  if (req.method !== "POST") return fail(req, 405, "Método não permitido.");
  if (
    isRateLimitExceeded(
      `other-credit-carnet-document:${getClientIp(req)}`,
      12,
      60_000,
    )
  ) {
    return fail(
      req,
      429,
      "Aguarde alguns instantes antes de baixar novamente.",
    );
  }
  try {
    const raw = await req.text();
    if (!raw || raw.length > 1_024) {
      throw new OtherCreditDocumentError(400, "Requisição inválida.");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new OtherCreditDocumentError(400, "Requisição inválida.");
    }
    const planId = parseOtherCreditPlanDocumentRequest(body);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      throw new OtherCreditDocumentError(
        503,
        "Documento temporariamente indisponível.",
      );
    }
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { inputs, issuer } = await readOtherCreditCarnetDocument(
      req,
      admin,
      planId,
    );
    const legacyLogo = !issuer.logo_url ||
      String(issuer.logo_url).includes("logo_1781993986277.jpg") ||
      issuer.id === "44444444-4444-4444-4444-444444444444";
    const projectHost = new URL(url).hostname;
    const [companyLogoBase64, bankLogoBase64] = await Promise.all([
      legacyLogo
        ? null
        : otherCreditDocumentImage(issuer.logo_url, projectHost),
      otherCreditDocumentImage(
        "https://universocc.com.br/logos/payment-gateways/banese.png",
        projectHost,
      ),
    ]);
    const pdf = await buildBaneseCarnetPdf(inputs, {
      minItems: 1,
      maxItems: OTHER_CREDIT_CARNET_MAX_ITEMS,
      branding: { companyLogoBase64, bankLogoBase64 },
    });
    return new Response(pdf as BodyInit, {
      status: 200,
      headers: {
        ...headers(req),
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition":
          `attachment; filename="carne-outros-creditos-${planId}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof OtherCreditDocumentError) {
      return fail(req, error.status, error.message);
    }
    // No raw bank response, payment identity or personal information in logs.
    return fail(req, 422, "Não foi possível montar este carnê com segurança.");
  }
});
