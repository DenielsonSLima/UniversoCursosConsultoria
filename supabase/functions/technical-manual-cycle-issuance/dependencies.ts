import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { GestorAutorizado } from "../_shared/authz.ts";
import { requireGestorForPolo, requireGestorTab } from "../_shared/authz.ts";
import { assertStoredProviderAdapterReady } from "../gateways/api/config.ts";
import {
  getCredential,
  isCredentialConfiguredForRoute,
} from "../gateways/api/credentials.ts";
import { getGatewayRuntimeConfig } from "../gateways/runtime-config.ts";
import { resolveGatewayIssuer } from "../gateways/router-adapter-runtime.ts";
import {
  type ManualCycleIssuanceRequest,
  parseCycleContext,
  UUID_RE,
} from "./contract.ts";
import type { ManualCycleIssuanceDependencies } from "./orchestrator.ts";
import {
  createReceivableIssuer,
  type IssuanceScope,
} from "./receivable-issuance.ts";

type Client = SupabaseClient;
const PROVIDER = "banese_card" as const;
const ENVIRONMENT = "production" as const;
const PAYMENT_METHOD = "BOLETO" as const;

const requiredRecord = async (
  query: PromiseLike<{ data: unknown; error: unknown }>,
  message: string,
) => {
  const { data, error } = await query;
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(message);
  }
  return data as Record<string, unknown>;
};

const loadEnrollmentScope = async (
  admin: Client,
  matriculaId: string,
) => {
  const enrollment = await requiredRecord(
    admin.from("matriculas").select("id, turma_id, aluno_id, status")
      .eq("id", matriculaId).maybeSingle(),
    "Matrícula técnica não encontrada.",
  );
  const turmaId = String(enrollment.turma_id || "");
  const classRow = await requiredRecord(
    admin.from("turmas").select("id, polo_id, curso_id").eq("id", turmaId)
      .maybeSingle(),
    "Turma técnica não encontrada.",
  );
  const course = await requiredRecord(
    admin.from("cursos").select("id, modalidade").eq(
      "id",
      String(classRow.curso_id || ""),
    ).maybeSingle(),
    "Curso técnico não encontrado.",
  );
  const modalidade = String(course.modalidade || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const poloId = String(classRow.polo_id || "");
  const alunoId = String(enrollment.aluno_id || "");
  if (
    modalidade !== "TECNICO" || !UUID_RE.test(turmaId) ||
    !UUID_RE.test(poloId) || !UUID_RE.test(alunoId)
  ) throw new Error("A matrícula não possui o escopo técnico completo.");
  return { matriculaId, turmaId, alunoId, poloId };
};

const assertProductionRoute = async (admin: Client) => {
  const runtime = await getGatewayRuntimeConfig(admin);
  if (!runtime.enabled || runtime.activeEnvironment !== ENVIRONMENT) {
    throw new Error(
      "A emissão bancária precisa estar ativa no ambiente de produção.",
    );
  }
  const { data, error } = await admin.from("payment_gateway_routes")
    .select("provider_code, credential_id, enabled, environment")
    .eq("modalidade", "TECNICO").eq("payment_method", PAYMENT_METHOD)
    .eq("environment", ENVIRONMENT).eq("enabled", true);
  if (error) throw error;
  const routes = Array.isArray(data) ? data : [];
  if (routes.length !== 1 || routes[0]?.provider_code !== PROVIDER) {
    throw new Error(
      "A rota TECNICO + BOLETO deve possuir exatamente um Banese ativo em produção.",
    );
  }
  assertStoredProviderAdapterReady(PROVIDER, PAYMENT_METHOD, ENVIRONMENT);
  const credential = await getCredential(admin, PROVIDER, ENVIRONMENT);
  const credentialId = String(routes[0]?.credential_id || "");
  if (
    !credential?.id || credentialId !== String(credential.id) ||
    !await isCredentialConfiguredForRoute(
      admin,
      PROVIDER,
      ENVIRONMENT,
      PAYMENT_METHOD,
      credential,
    )
  ) throw new Error("A credencial BolePix Banese de produção não está pronta.");
  return credentialId;
};

export const createManualCycleIssuanceDependencies = (input: {
  admin: Client;
  userClient: Client;
  gestor: GestorAutorizado;
  supabaseUrl: string;
}): ManualCycleIssuanceDependencies => {
  let scope: IssuanceScope | null = null;
  const issueReceivable = createReceivableIssuer({
    admin: input.admin,
    userClient: input.userClient,
    supabaseUrl: input.supabaseUrl,
    getScope: () => scope,
  });

  const loadContext = async (request: ManualCycleIssuanceRequest) => {
    const { data, error } = await input.admin.rpc(
      "obter_emissao_ciclo_financeiro_tecnico_manual_service",
      {
        p_matricula_id: request.matriculaId,
        p_ciclo_numero: request.cicloNumero,
      },
    );
    if (error) throw error;
    if (!scope) throw new Error("Escopo da emissão não foi validado.");
    return {
      ...parseCycleContext(data),
      matriculaId: scope.matriculaId,
      turmaId: scope.turmaId,
      poloId: scope.poloId,
    };
  };

  return {
    async preflight(request) {
      requireGestorTab(input.gestor, "financeiro", "receber");
      const [baseScope, credentialId, issuer] = await Promise.all([
        loadEnrollmentScope(input.admin, request.matriculaId),
        assertProductionRoute(input.admin),
        resolveGatewayIssuer(input.admin),
      ]);
      requireGestorForPolo(input.gestor, baseScope.poloId);
      scope = { ...baseScope, credentialId, issuerPoloId: issuer.id };
    },

    async prepare(request) {
      if (!scope) throw new Error("Escopo da emissão não foi validado.");
      const { data, error } = await input.userClient.rpc(
        "preparar_emissao_ciclo_financeiro_tecnico_manual_secure",
        {
          p_matricula_id: request.matriculaId,
          p_ciclo_numero: request.cicloNumero,
          p_primeiro_vencimento: request.primeiroVencimento,
          p_request_id: request.requestId,
          p_expected_regra_fingerprint: request.expectedRegraFingerprint,
          p_expected_politica_fingerprint: request.expectedPoliticaFingerprint,
          p_expected_cronograma_fingerprint:
            request.expectedCronogramaFingerprint,
        },
      );
      if (error) throw error;
      return {
        ...parseCycleContext(data),
        matriculaId: scope.matriculaId,
        turmaId: scope.turmaId,
        poloId: scope.poloId,
      };
    },

    resume: loadContext,
    reload: loadContext,
    issueReceivable,
  };
};
