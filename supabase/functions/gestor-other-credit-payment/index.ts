import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
} from "../_shared/http.ts";
import {
  parseOtherCreditRequest,
  PaymentReadError,
  readOtherCreditPayment,
} from "./payment-reader.ts";

const respond = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(req, { methods: "POST, OPTIONS" }),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return respond(req, { ok: true });
  if (req.method !== "POST") {
    return respond(req, { error: "Método não permitido." }, 405);
  }
  if (
    isRateLimitExceeded(
      `gestor-other-credit-payment:${getClientIp(req)}`,
      60,
      60_000,
    )
  ) {
    return respond(req, {
      error: "Aguarde alguns instantes antes de consultar novamente.",
    }, 429);
  }
  try {
    const text = await req.text();
    if (!text || text.length > 1_024) {
      throw new PaymentReadError(400, "Requisição inválida.");
    }
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new PaymentReadError(400, "Requisição inválida.");
    }
    const id = parseOtherCreditRequest(body);
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      throw new PaymentReadError(503, "Consulta temporariamente indisponível.");
    }
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(12_000)]);
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([signal, init.signal])
              : signal,
          }),
      },
    });
    return respond(req, await readOtherCreditPayment(req, admin, id));
  } catch (error) {
    if (error instanceof PaymentReadError) {
      return respond(req, { error: error.message }, error.status);
    }
    // Never expose provider payloads, SQL details or personal data in logs/errors.
    return respond(req, {
      error: "Não foi possível consultar a cobrança. Tente novamente.",
    }, 503);
  }
});
