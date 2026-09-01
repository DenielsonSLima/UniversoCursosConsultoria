import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
} from "../_shared/http.ts";
import {
  buildBaneseStudentPaymentDto,
  deriveOpaqueGroupMarker,
  isActiveStudentStatus,
  selectSafeInstallmentRows,
  UUID_RE,
} from "./payment-dto.ts";
import type { BaneseStudentPaymentRow } from "./types.ts";
import { recoverMissingEadBanesePix } from "../gateways/ead-banese-pix-recovery.ts";

const PAYMENT_SELECT = `
  id,
  created_at,
  cliente_id,
  matricula_id,
  turma_id,
  descricao,
  categoria,
  tipo_lancamento,
  parcela_numero,
  valor,
  valor_pago,
  data_vencimento,
  data_pagamento,
  status,
  gateway_provider,
  gateway_environment,
  gateway_payment_method,
  gateway_status,
  gateway_synced_at,
  gateway_last_error,
  updated_at,
  gateway_pix_payload,
  gateway_pix_encoded_image,
  gateway_boleto_linha_digitavel,
  gateway_boleto_codigo_barras,
  gateway_boleto_nosso_numero,
  gateway_boleto_issued_at,
  gateway_boleto_convenio,
  gateway_boleto_agencia,
  gateway_issuer_polo_id,
  gateway_financial_terms,
  gateway_financial_terms_confirmed_at,
  regra_financeira_dependencia_snapshot,
  turmas!left(nome,cursos!left(nome,modalidade))
`;

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const bearerToken = (req: Request) =>
  String(req.headers.get("Authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();

const parseBody = async (req: Request) => {
  const text = await req.text();
  if (!text || text.length > 2_048) {
    throw new HttpError(400, "Requisição inválida.");
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Requisição inválida.");
  }
};

const secureJson = (body: unknown, status: number, req: Request) => {
  const response = json(body, status, req);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
};

const escapedIlikeLiteral = (value: string) =>
  value.replace(/[\\%_]/g, (character) => `\\${character}`);

const readStudentProfile = async (client: SupabaseClient, email: string) => {
  const { data, error } = await client
    .from("parceiros")
    .select("id,nome,email,cpf_cnpj,status,created_at")
    .eq("tipo", "Aluno")
    .ilike("email", escapedIlikeLiteral(email))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (
    !data ||
    String(data.email ?? "").trim().toLowerCase() !== email ||
    !isActiveStudentStatus(data.status)
  ) {
    throw new HttpError(403, "Acesso restrito ao aluno autenticado.");
  }
  return data as {
    id: string;
    nome: string | null;
    cpf_cnpj: string | null;
  };
};

const readSelectedPayment = async (
  client: SupabaseClient,
  receivableId: string,
  studentId: string,
) => {
  const { data, error } = await client
    .from("contas_receber")
    .select(PAYMENT_SELECT)
    .eq("id", receivableId)
    .eq("cliente_id", studentId)
    .eq("gateway_provider", "banese_card")
    .eq("gateway_payment_method", "BOLETO")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Cobrança não encontrada.");
  return data as BaneseStudentPaymentRow;
};

const readGroupCandidates = async (
  client: SupabaseClient,
  selected: BaneseStudentPaymentRow,
) => {
  if (!selected.matricula_id || !selected.cliente_id) return [selected];
  if (String(selected.tipo_lancamento ?? "").toUpperCase() !== "PARCELA") {
    return [selected];
  }

  const { data, error } = await client
    .from("contas_receber")
    .select(PAYMENT_SELECT)
    .eq("cliente_id", selected.cliente_id)
    .eq("matricula_id", selected.matricula_id)
    .eq("gateway_provider", "banese_card")
    .eq("gateway_environment", selected.gateway_environment)
    .eq("gateway_payment_method", "BOLETO")
    .eq("tipo_lancamento", "PARCELA")
    .order("parcela_numero", { ascending: true })
    .limit(30);
  if (error) throw error;
  return selectSafeInstallmentRows(
    selected,
    (data ?? []) as BaneseStudentPaymentRow[],
  );
};

const firstRelation = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const paymentCourseModality = (payment: BaneseStudentPaymentRow) => {
  const turma = firstRelation(payment.turmas);
  const curso = firstRelation(turma?.cursos);
  return String(curso?.modalidade ?? "").trim().toUpperCase();
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return secureJson({ error: "Método não permitido." }, 405, req);
  }
  if (
    isRateLimitExceeded(
      `banese-student-payment:${getClientIp(req)}`,
      60,
      60_000,
    )
  ) {
    return secureJson(
      { error: "Muitas requisições. Aguarde alguns instantes." },
      429,
      req,
    );
  }

  try {
    const token = bearerToken(req);
    if (!token) throw new HttpError(401, "Autenticação obrigatória.");

    const body = await parseBody(req);
    if (body.action !== "get") {
      throw new HttpError(400, "Ação inválida.");
    }
    const receivableId = String(body.receivableId ?? "").trim();
    if (!UUID_RE.test(receivableId)) {
      throw new HttpError(400, "Cobrança inválida.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !anonKey) {
      throw new Error("Configuração Supabase indisponível.");
    }
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser(
      token,
    );
    const email = String(authData.user?.email ?? "").trim().toLowerCase();
    if (authError || !email) {
      throw new HttpError(401, "Sessão inválida.");
    }

    const student = await readStudentProfile(client, email);
    let selected = await readSelectedPayment(
      client,
      receivableId,
      student.id,
    );
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (serviceRoleKey) {
      // O service role só nasce depois de provar sessão e titularidade com RLS.
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const recovery = await recoverMissingEadBanesePix(admin, {
        courseModality: paymentCourseModality(selected),
        receivable: selected,
      });
      selected = recovery.refreshRecommended
        ? await readSelectedPayment(client, receivableId, student.id)
        : recovery.receivable as BaneseStudentPaymentRow;
    }
    const installments = await readGroupCandidates(client, selected);
    const isCarnet = installments.length >= 3;
    const groupScope = isCarnet
      ? `carnet:v1:${selected.cliente_id}:${selected.matricula_id}:${selected.gateway_environment}`
      : `single:v1:${selected.id}`;
    const markerSecret = Deno.env.get("BANESE_STUDENT_GROUP_MARKER_SECRET") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const groupMarker = await deriveOpaqueGroupMarker(groupScope, markerSecret);
    const data = buildBaneseStudentPaymentDto(
      selected,
      installments,
      groupMarker,
      { name: student.nome, document: student.cpf_cnpj },
    );
    return secureJson({ success: true, data }, 200, req);
  } catch (error) {
    if (error instanceof HttpError) {
      return secureJson({ error: error.message }, error.status, req);
    }
    console.error("banese-student-payment failed", {
      message: error instanceof Error ? error.message : "unknown_error",
    });
    return secureJson(
      { error: "Não foi possível carregar esta cobrança." },
      500,
      req,
    );
  }
});
