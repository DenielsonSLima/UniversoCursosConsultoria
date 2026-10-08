import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

export const UID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const OTHER_UID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ALUNO_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_ALUNO_ID = '22222222-2222-4222-8222-222222222222';
export const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';
const POLO_ID = '44444444-4444-4444-8444-444444444444';
const ROOT = path.resolve('supabase/functions');

/** Executes the real handler and identity reader; external APIs/PDF engines are isolated. */
export async function identityHandlerFixture(endpoint, options = {}) {
  const trace = { queries: [], clients: [], gestor: 0, scope: 0, pdf: 0, recovery: 0 };
  const user = options.invalidSession ? null : {
    id: options.authUserId || UID,
    email: 'univa00000001@acesso.universocc.invalid',
  };
  const student = {
    id: ALUNO_ID, auth_user_id: options.unlinked ? null : UID, tipo: 'Aluno', status: options.status || 'ATIVO',
    nome: 'Aluno sintético', cpf_cnpj: null, email: 'contato@example.test',
  };
  const ownerId = options.otherOwner ? OTHER_ALUNO_ID : ALUNO_ID;
  const payment = {
    id: PAYMENT_ID, cliente_id: ownerId, matricula_id: 'matricula-fixture', turma_id: null,
    polo_id: POLO_ID, tipo_lancamento: 'PARCELA', status: 'PENDENTE', parcela_numero: 1,
    gateway_provider: 'banese_card', gateway_payment_method: 'BOLETO',
    gateway_environment: 'production', gateway_issuer_polo_id: POLO_ID,
    gateway_boleto_convenio: '123', gateway_boleto_agencia: '33',
    gateway_boleto_issued_at: '2026-10-01T12:00:00Z',
    gateway_financial_terms_confirmed_at: '2026-10-01T12:00:00Z',
    gateway_financial_terms: { nominalAmount: 279.90, dueDate: '2026-10-15' },
    valor: 279.90, data_vencimento: '2026-10-15',
  };
  const rows = {
    parceiros: [student],
    contas_receber: [payment],
    polos: [{ id: POLO_ID, nome: 'Polo sintético', logo_url: null }],
    payment_gateway_credentials: [{ provider_code: 'banese_card', environment: 'production', metadata: {} }],
  };
  if (options.otherOwner) rows.parceiros.push({ ...student, id: OTHER_ALUNO_ID, auth_user_id: OTHER_UID });
  if (options.duplicate) rows.parceiros.push({ ...student, id: OTHER_ALUNO_ID });

  const query = (table) => {
    const calls = [];
    let maxRows = Infinity;
    let single = false;
    const result = () => {
      const data = (rows[table] || []).filter(row => calls.every(([op, key, value]) =>
        op === 'in' ? value.includes(row[key]) : row[key] === value,
      )).slice(0, maxRows);
      return { data: single ? data[0] || null : data, error: null };
    };
    trace.queries.push({ table, filters: calls });
    return {
      select() { return this; },
      eq(key, value) { calls.push(['eq', key, value]); return this; },
      is(key, value) { calls.push(['is', key, value]); return this; },
      in(key, value) { calls.push(['in', key, value]); return this; },
      order() { return this; },
      limit(value) { maxRows = value; return this; },
      range(start, end) { assert.equal(start, 0); maxRows = end + 1; return this; },
      maybeSingle() { single = true; return this; },
      then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
    };
  };
  const client = { from: query, auth: { getUser: async token => {
    assert.equal(token, 'valid-fixture-token');
    return { data: { user }, error: options.invalidSession ? new Error('invalid') : null };
  } } };
  let handler;
  const context = vm.createContext({
    Response, Request, URL, AbortSignal, Uint8Array, console, btoa,
    fetch: async () => new Response(null, { status: 404 }),
    Deno: {
      serve(fn) { handler = fn; },
      env: { get: name => ({
        SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_ANON_KEY: 'anon-fixture',
        SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', BANESE_STUDENT_GROUP_MARKER_SECRET: 'marker-fixture',
      })[name] },
    },
  });
  const pdf = async () => { trace.pdf += 1; return new TextEncoder().encode('%PDF-fixture'); };
  const stubs = {
    'npm:@supabase/supabase-js@2': { createClient: (_url, key, config) => {
      trace.clients.push({ key, config }); return client;
    } },
    [path.join(ROOT, '_shared/http.ts')]: {
      buildCorsHeaders: () => ({}), getClientIp: () => 'fixture', isRateLimitExceeded: () => false,
      json: (body, status) => new Response(JSON.stringify(body), { status }),
    },
    [path.join(ROOT, '_shared/authz.ts')]: {
      bearerTokenFromRequest: req => (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, ''),
      requireGestorAtivo: async () => {
        trace.gestor += 1;
        if (!options.gestor) throw new Error('not gestor');
        return { id: 'gestor-fixture' };
      },
      requireBaneseBoletoDocumentReadAccess: () => {},
      requireFinanceDocumentReadAccess: () => {},
      requireGestorForPolo: (_gestor, poloId) => {
        trace.scope += 1; assert.equal(poloId, POLO_ID);
        if (options.deniedPolo) throw new Error('outside polo');
      },
    },
    [path.join(ROOT, 'banese/internal/boletos/boleto-pdf.ts')]: { buildBaneseBoletoPdf: pdf },
    [path.join(ROOT, 'banese/internal/carne/carne-pdf.ts')]: { buildBaneseCarnetPdf: pdf },
    [path.join(ROOT, 'banese/internal/technical-billing-context.ts')]: { loadBaneseAcademicBillingContext: async () => null },
    [path.join(ROOT, 'banese/internal/technical-billing-instructions.ts')]: {
      buildBaneseDependencyBillingInstructions: () => [], buildBaneseTechnicalBillingInstructions: () => [],
    },
    [path.join(ROOT, 'banese/internal/dependency-billing.ts')]: {
      dependencyBillingSnapshotFrom: () => null, isDependencyReceivable: () => false,
    },
    [path.join(ROOT, 'gateways/ead-banese-pix-recovery.ts')]: {
      recoverMissingEadBanesePix: async (_client, { receivable }) => {
        trace.recovery += 1; return { refreshRecommended: false, receivable };
      },
    },
    [path.join(ROOT, 'banese-student-payment/payment-dto.ts')]: {
      UUID_RE: /^[0-9a-f-]{36}$/i,
      buildBaneseStudentPaymentDto: selected => ({ id: selected.id }),
      deriveOpaqueGroupMarker: async () => 'opaque-fixture',
      selectSafeInstallmentRows: (_selected, candidates) => candidates,
    },
    [path.join(ROOT, 'banese-carnet-document/document-policy.ts')]: {
      BANESE_CARNET_ALLOWED_LAUNCH_TYPES: ['PARCELA'], BANESE_CARNET_MAX_ITEMS: 30,
      BANESE_DOCUMENT_PAYABLE_LOCAL_STATUSES: ['PENDENTE'],
      BaneseCarnetPolicyError: class extends Error {}, isAllowedBaneseLogoUrl: () => false,
      readBaneseCarnetScope: row => ({
        clientId: row.cliente_id, enrollmentId: row.matricula_id, environment: row.gateway_environment,
        issuerId: row.gateway_issuer_polo_id, agreement: row.gateway_boleto_convenio,
        agency: row.gateway_boleto_agencia, poloId: row.polo_id,
      }),
      selectBaneseCarnetDocumentRows: (_selected, candidates) => candidates,
      takeRegisteredBaneseCarnetCandidateRows: candidates => candidates,
    },
    [path.join(ROOT, 'banese-carnet-document/document-input.ts')]: {
      buildBaneseCarnetDocumentInputs: candidates => candidates,
    },
  };
  const modules = new Map();
  const load = async identifier => {
    if (modules.has(identifier)) return modules.get(identifier);
    let module;
    if (stubs[identifier]) {
      const exports = stubs[identifier];
      module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context, identifier });
    } else {
      const source = await readFile(identifier, 'utf8');
      module = new vm.SourceTextModule(stripTypeScriptTypes(source, { mode: 'transform' }), { context, identifier });
    }
    modules.set(identifier, module);
    await module.link((specifier, parent) => load(specifier.startsWith('.')
      ? path.resolve(path.dirname(parent.identifier), specifier) : specifier));
    return module;
  };
  const module = await load(path.join(ROOT, endpoint, 'index.ts'));
  await module.evaluate();
  return {
    trace,
    request: async (body = {}) => handler(new Request('https://fixture.test/payment', {
      method: 'POST',
      headers: options.missingToken ? {} : { Authorization: 'Bearer valid-fixture-token' },
      body: JSON.stringify({ ...(endpoint === 'banese-student-payment' ? { action: 'get' } : {}), receivableId: PAYMENT_ID, ...body }),
    })),
  };
}
