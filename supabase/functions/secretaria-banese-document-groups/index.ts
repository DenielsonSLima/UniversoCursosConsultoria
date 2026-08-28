// v3 – aceita poloId="todos" para gestor global e filtra por polos autorizados.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  authorizationErrorHttpStatus,
  type GestorAutorizado,
  requireFinanceDocumentReadAccess,
  requireGestorAtivo,
  requireGestorForPolo,
} from "../_shared/authz.ts";
import {
  buildCorsHeaders,
  getClientIp,
  isRateLimitExceeded,
  UUID_RE,
} from "../_shared/http.ts";
import { BANESE_DOCUMENT_SECURITY_HEADERS } from "../banese-boleto-document/document-policy.ts";
import {
  BANESE_CARNET_ALLOWED_LAUNCH_TYPES,
  BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES,
  type BaneseCarnetReceivableRow,
  isRegisteredBaneseDocumentRow,
} from "../banese-carnet-document/document-policy.ts";
import {
  buildBaneseDocumentFilters,
  buildBaneseDocumentGroups,
  type ClassCatalogRow,
  type CourseCatalogRow,
  type EnrollmentCatalogRow,
  filterBaneseDocumentGroups,
  paginateBaneseDocumentGroups,
  type StudentCatalogRow,
} from "./document-groups.ts";

const RECEIVABLE_SELECT = `
  id, cliente_id, matricula_id, turma_id, polo_id,
  tipo_lancamento, parcela_numero, valor, data_vencimento, status,
  gateway_provider, gateway_environment, gateway_payment_method,
  gateway_status, gateway_boleto_issued_at, gateway_boleto_linha_digitavel,
  gateway_boleto_codigo_barras, gateway_boleto_nosso_numero,
  gateway_boleto_convenio, gateway_boleto_agencia,
  gateway_issuer_polo_id, gateway_financial_terms,
  gateway_financial_terms_confirmed_at
`;
const ALLOWED_INPUT_KEYS = new Set([
  "poloId",
  "search",
  "courseId",
  "classId",
  "page",
  "pageSize",
]);
const MAX_RECEIVABLE_ROWS = 10_000;
const QUERY_PAGE_SIZE = 1_000;

type CatalogRequest = {
  poloId: string;
  search?: string;
  courseId?: string;
  classId?: string;
  page: number;
  pageSize: number;
};

class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

const text = (value: unknown) => String(value ?? "").trim();
const secureHeaders = (req: Request) => ({
  ...buildCorsHeaders(req, { methods: "POST, OPTIONS" }),
  ...BANESE_DOCUMENT_SECURITY_HEADERS,
  "Cross-Origin-Resource-Policy": "same-site",
});
const jsonResponse = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...secureHeaders(req),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
const jsonError = (req: Request, status: number, message: string) =>
  jsonResponse(req, { error: message }, status);

const optionalUuid = (
  body: Record<string, unknown>,
  key: "courseId" | "classId",
) => {
  if (body[key] === undefined || body[key] === null) return undefined;
  const value = text(body[key]);
  if (!UUID_RE.test(value)) throw new HttpError(400, "Filtro inválido.");
  return value;
};

const positiveInteger = (
  value: unknown,
  fallback: number,
  maximum: number,
) => {
  if (value === undefined) return fallback;
  if (
    !Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum
  ) {
    throw new HttpError(400, "Paginação inválida.");
  }
  return Number(value);
};

const parseRequest = async (req: Request): Promise<CatalogRequest> => {
  const raw = await req.text();
  if (!raw || raw.length > 4_096) {
    throw new HttpError(400, "Consulta inválida.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Consulta inválida.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Consulta inválida.");
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_INPUT_KEYS.has(key))) {
    throw new HttpError(400, "A consulta possui campos não permitidos.");
  }
  const rawPoloId = text(record.poloId);
  const isTodosPolo = rawPoloId === "todos" || rawPoloId === "all" ||
    rawPoloId === "";
  if (!isTodosPolo && !UUID_RE.test(rawPoloId)) {
    throw new HttpError(400, "Polo inválido.");
  }
  const poloId = isTodosPolo ? "todos" : rawPoloId;
  if (record.search !== undefined && typeof record.search !== "string") {
    throw new HttpError(400, "Busca inválida.");
  }
  const search = text(record.search);
  if (search.length > 120) throw new HttpError(400, "Busca inválida.");
  return {
    poloId,
    search: search || undefined,
    courseId: optionalUuid(record, "courseId"),
    classId: optionalUuid(record, "classId"),
    page: positiveInteger(record.page, 1, 100_000),
    pageSize: positiveInteger(record.pageSize, 20, 50),
  };
};

const unique = (
  values: Array<string | null | undefined>,
) => [...new Set(values.map(text).filter(Boolean))];
const chunksOf = <T>(items: T[], size = 400) => {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
};

const readRowsByIds = async (
  admin: SupabaseClient,
  table: string,
  columns: string,
  ids: string[],
) => {
  const rows: Record<string, unknown>[] = [];
  for (const idChunk of chunksOf(ids)) {
    const { data, error } = await admin.from(table).select(columns).in(
      "id",
      idChunk,
    );
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return rows;
};

const readReceivables = async (
  admin: SupabaseClient,
  input: CatalogRequest,
  gestor: GestorAutorizado,
) => {
  const rows: BaneseCarnetReceivableRow[] = [];
  for (
    let offset = 0;
    offset < MAX_RECEIVABLE_ROWS;
    offset += QUERY_PAGE_SIZE
  ) {
    let query = admin.from("contas_receber")
      .select(RECEIVABLE_SELECT)
      .eq("gateway_provider", "banese_card")
      .eq("gateway_payment_method", "BOLETO")
      .in("tipo_lancamento", [...BANESE_CARNET_ALLOWED_LAUNCH_TYPES])
      .in("status", [...BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES])
      .not("gateway_boleto_issued_at", "is", null)
      .not("gateway_financial_terms_confirmed_at", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + QUERY_PAGE_SIZE - 1);

    if (input.poloId !== "todos") {
      query = query.eq("polo_id", input.poloId);
    } else if (!gestor.isGlobal && gestor.poloIds.length > 0) {
      query = query.in("polo_id", gestor.poloIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    const pageRows = (data ?? []) as BaneseCarnetReceivableRow[];
    rows.push(...pageRows);
    if (pageRows.length < QUERY_PAGE_SIZE) return rows;
  }
  return rows;
};

const loadCatalog = async (
  admin: SupabaseClient,
  input: CatalogRequest,
  gestor: GestorAutorizado,
) => {
  const emptyCatalog = {
    groups: [],
    total: 0,
    page: input.page,
    pageSize: input.pageSize,
    filters: { courses: [], classes: [] },
  };
  const queriedRows = await readReceivables(admin, input, gestor);
  const receivables = queriedRows.filter(isRegisteredBaneseDocumentRow);
  if (!receivables.length) return emptyCatalog;

  const enrollmentIds = unique(receivables.map((row) => row.matricula_id));
  const enrollments = await readRowsByIds(
    admin,
    "matriculas",
    "id,aluno_id,turma_id,data_matricula",
    enrollmentIds,
  ) as EnrollmentCatalogRow[];
  const studentIds = unique(enrollments.map((row) => row.aluno_id));
  const classIds = unique(enrollments.map((row) => row.turma_id));
  const [studentsRaw, classesRaw, configResult] = await Promise.all([
    readRowsByIds(admin, "parceiros", "id,nome,cpf_cnpj", studentIds),
    readRowsByIds(
      admin,
      "turmas",
      "id,nome,codigo,curso_id,polo_id",
      classIds,
    ),
    admin.from("documentos_templates").select("conteudo")
      .eq("id", "academicos_config").maybeSingle(),
  ]);
  if (configResult.error) throw configResult.error;
  const students = studentsRaw as StudentCatalogRow[];
  const classes = classesRaw as ClassCatalogRow[];
  const courseIds = unique(classes.map((row) => row.curso_id));
  const courses = await readRowsByIds(
    admin,
    "cursos",
    "id,nome",
    courseIds,
  ) as CourseCatalogRow[];
  const groups = buildBaneseDocumentGroups({
    receivables,
    students,
    enrollments,
    classes,
    courses,
    enrollmentConfig: configResult.data?.conteudo,
    search: input.search,
    poloId: input.poloId === "todos" ? undefined : input.poloId,
  });
  const filters = buildBaneseDocumentFilters(groups);
  const filteredGroups = filterBaneseDocumentGroups(
    groups,
    input.courseId,
    input.classId,
  );
  return {
    ...paginateBaneseDocumentGroups(
      filteredGroups,
      input.page,
      input.pageSize,
    ),
    filters,
  };
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
      `secretaria-banese-document-groups:${getClientIp(req)}`,
      30,
      60_000,
    )
  ) {
    return jsonError(
      req,
      429,
      "Muitas solicitações. Tente novamente em breve.",
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuração Supabase indisponível.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const gestor = await requireGestorAtivo(req, admin);
    requireFinanceDocumentReadAccess(gestor);
    const input = await parseRequest(req);
    if (input.poloId !== "todos") {
      requireGestorForPolo(gestor, input.poloId);
    } else if (!gestor.isGlobal && gestor.poloIds.length === 0) {
      throw new HttpError(
        403,
        "Sem permissão para consultar documentos deste polo.",
      );
    }
    return jsonResponse(req, await loadCatalog(admin, input, gestor));
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonError(req, error.status, error.message);
    }
    const message = error instanceof Error ? error.message : "";
    const authorizationStatus = authorizationErrorHttpStatus(message);
    if (authorizationStatus) {
      return jsonError(
        req,
        authorizationStatus,
        authorizationStatus === 401
          ? "Autenticação obrigatória."
          : "Sem permissão para consultar documentos financeiros deste polo.",
      );
    }
    return jsonError(req, 500, "Não foi possível consultar os documentos.");
  }
});
