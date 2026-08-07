import { createClient } from "npm:@supabase/supabase-js@2";
import {
  authorizationErrorHttpStatus,
  requireGestorAtivo,
  requireGestorModule,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  json,
  UUID_RE,
} from "../_shared/http.ts";
import { gestorCanManageAluno } from "./authorization.ts";
import { deleteDocumentFile } from "./deletion.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: buildCorsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(
      { success: false, error: "Método não permitido." },
      405,
      request,
    );
  }
  if (
    isRateLimitExceeded(
      `documentos-aluno-admin:${getClientIp(request)}`,
      30,
      60_000,
    )
  ) {
    return json(
      { success: false, error: "Muitas tentativas. Aguarde alguns instantes." },
      429,
      request,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json(
      { success: false, error: "Configuração do Supabase ausente." },
      500,
      request,
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const gestor = await requireGestorAtivo(request, admin);
    requireGestorModule(gestor, "parceiros");

    const payload = await request.json().catch(() => ({}));
    const exclusaoId = String(payload?.exclusaoId || "").trim();
    if (!UUID_RE.test(exclusaoId)) {
      return json(
        { success: false, error: "Solicitação de exclusão inválida." },
        400,
        request,
      );
    }

    const { data: exclusao, error: exclusionError } = await admin
      .from("documentos_aluno_exclusoes")
      .select("aluno_id")
      .eq("id", exclusaoId)
      .maybeSingle();
    if (exclusionError) throw exclusionError;
    if (!exclusao) {
      return json(
        { success: false, error: "Solicitação não encontrada." },
        404,
        request,
      );
    }

    const { data: aluno, error: studentError } = await admin
      .from("parceiros")
      .select("id, polo_id, polo_ids")
      .eq("id", exclusao.aluno_id)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!aluno || !gestorCanManageAluno(gestor, aluno)) {
      return json(
        { success: false, error: "Documento fora do escopo do gestor." },
        403,
        request,
      );
    }

    const result = await deleteDocumentFile({ admin, exclusaoId });
    return json(
      {
        success: true,
        alreadyCompleted: result.alreadyCompleted,
      },
      200,
      request,
    );
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "Não foi possível concluir a exclusão.";
    const status = authorizationErrorHttpStatus(message) || 500;
    return json({ success: false, error: message }, status, request);
  }
});
