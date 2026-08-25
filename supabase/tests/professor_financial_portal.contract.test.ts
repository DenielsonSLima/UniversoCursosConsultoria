import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const listMigration = readFileSync(resolve(
  root,
  'supabase/migrations/20260824235000_create_professor_financial_portal_read.sql',
), 'utf8');
const receiptMigration = readFileSync(resolve(
  root,
  'supabase/migrations/20260824235050_create_professor_financial_receipt_rpc.sql',
), 'utf8');
const page = readFileSync(resolve(root, 'modules/professor/financeiro/FinanceiroPage.tsx'), 'utf8');
const service = readFileSync(resolve(root, 'modules/professor/financeiro/financeiro.service.ts'), 'utf8');
const queries = readFileSync(resolve(root, 'modules/professor/financeiro/financeiro.queries.ts'), 'utf8');
const receiptPdf = readFileSync(resolve(
  root,
  'modules/professor/financeiro/professor-financeiro-receipt.pdf.ts',
), 'utf8');
const receiptModal = readFileSync(resolve(
  root,
  'modules/professor/financeiro/ProfessorFinanceiroReceiptModal.tsx',
), 'utf8');
const presentation = readFileSync(resolve(
  root,
  'modules/professor/financeiro/financeiro.presentation.ts',
), 'utf8');
const canonicalPreviewModal = readFileSync(resolve(
  root,
  'modules/gestor/secretaria/shared/CanonicalDocumentPreviewModal.tsx',
), 'utf8');
const financialPolicies = readFileSync(resolve(
  root,
  'supabase/migrations/20260718085930_enforce_tabs_reports_and_storage_rbac.sql',
), 'utf8');
const partnerPolicies = readFileSync(resolve(
  root,
  'supabase/migrations/20260718084650_preserve_partner_reads_by_operational_module.sql',
), 'utf8');
const poloPolicies = readFileSync(resolve(
  root,
  'supabase/migrations/20260701232000_split_polos_public_and_gestor_select.sql',
), 'utf8');

const canonicalContasPagarColumnsUsedByPortal = new Set([
  'id',
  'fornecedor_id',
  'polo_id',
  'descricao',
  'categoria',
  'valor',
  'valor_pago',
  'data_vencimento',
  'data_pagamento',
  'forma_pagamento',
  'status',
  'created_at',
]);

const assertCanonicalContasPagarReferences = (source: string) => {
  const referencedColumns = new Set(
    [...source.matchAll(/\bconta\.([a-z_][a-z0-9_]*)/g)].map((match) => match[1]),
  );
  for (const column of referencedColumns) {
    assert.ok(
      canonicalContasPagarColumnsUsedByPortal.has(column),
      `referência não canônica em contas_pagar: ${column}`,
    );
  }
};

test('RPC de listagem autoriza identidade e polo antes de consultar os lançamentos', () => {
  const authCheck = listMigration.indexOf('v_current_professor_id := public.current_professor_id()');
  const scopeCheck = listMigration.indexOf('p_polo_id = ANY(coalesce(professor.polo_ids');
  const financialRead = listMigration.indexOf('FROM public.contas_pagar AS conta');

  assert.ok(authCheck >= 0);
  assert.ok(scopeCheck >= 0);
  assert.ok(financialRead > scopeCheck);
  assert.match(listMigration, /SECURITY INVOKER[\s\S]*SET search_path TO ''/);
  assert.match(listMigration, /IF auth\.uid\(\) IS NULL THEN/);
  assert.match(listMigration, /v_current_professor_id <> p_professor_id/);
  assert.match(listMigration, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(listMigration, /TO authenticated;/);
  assert.doesNotMatch(listMigration, /GRANT EXECUTE[\s\S]*TO anon/);
});

test('SECURITY INVOKER tem políticas RLS compatíveis com professor, polo e contas próprias', () => {
  assert.match(
    partnerPolicies,
    /CREATE POLICY portal_parceiros_select[\s\S]*id = public\.current_professor_id\(\)/,
  );
  assert.match(
    financialPolicies,
    /CREATE POLICY portal_contas_pagar_select[\s\S]*fornecedor_id = public\.current_professor_id\(\)/,
  );
  assert.match(
    poloPolicies,
    /create policy portal_polos_public_select[\s\S]*to anon, authenticated[\s\S]*status, 'ativo'/,
  );
});

test('RPCs usam somente colunas canônicas existentes em contas_pagar', () => {
  assertCanonicalContasPagarReferences(listMigration);
  assertCanonicalContasPagarReferences(receiptMigration);
  assert.doesNotMatch(listMigration, /\bconta\.observacao\b/);
});

test('vencimento usa a fronteira correta e cancelado ou estornado não contaminam os totais', () => {
  assert.match(
    listMigration,
    /v_today date := \(statement_timestamp\(\) AT TIME ZONE 'America\/Maceio'\)::date/,
  );
  assert.match(listMigration, /conta\.data_vencimento < v_today THEN 'ATRASADO'/);
  assert.doesNotMatch(listMigration, /conta\.data_vencimento <= v_today THEN 'ATRASADO'/);
  assert.doesNotMatch(listMigration, /data_vencimento < current_date/);
  assert.match(listMigration, /NOT IN \('CANCELADO', 'ESTORNADO'\)/);
  assert.match(listMigration, /WHEN upper\(btrim\(coalesce\(conta\.status, ''\)\)\) = 'PAGO' THEN 'PAGO'/);
  assert.match(listMigration, /WHEN upper\(btrim\(coalesce\(conta\.status, ''\)\)\) = 'PENDENTE' THEN 'ABERTO'/);
});

test('valor_pago zero ou parcial permanece efetivo e saldo residual é calculado no banco', () => {
  assert.match(listMigration, /greatest\(coalesce\(conta\.valor_pago, 0\), 0\)::numeric AS valor_pago/);
  assert.match(
    listMigration,
    /greatest\(coalesce\(conta\.valor, 0\), 0\)[\s\S]*-[\s\S]*greatest\(coalesce\(conta\.valor_pago, 0\), 0\)/,
  );
  assert.match(listMigration, /coalesce\(sum\(valor_pago\), 0\)::numeric AS total_recebido/);
  assert.match(listMigration, /coalesce\(sum\(valor_em_aberto\), 0\)::numeric AS total_a_receber/);
  assert.doesNotMatch(listMigration, /coalesce\(conta\.valor_pago,\s*conta\.valor/i);
  assert.match(receiptMigration, /'valuePaid', greatest\(coalesce\(conta\.valor_pago, 0\), 0\)/);
  assert.doesNotMatch(receiptMigration, /valor_pago\s*\|\||coalesce\(conta\.valor_pago,\s*conta\.valor/i);
});

test('códigos internos de categoria recebem rótulo canônico antes de chegar à interface e ao PDF', () => {
  for (const [code, label] of [
    ['DESPESA_VARIAVEL', 'Despesa variável'],
    ['DESPESA_ADMINISTRATIVA', 'Despesa administrativa'],
    ['OUTRAS_DESPESAS', 'Outras despesas'],
    ['ADIANTAMENTO_CEDIDO', 'Adiantamento cedido'],
    ['EMPRESTIMO', 'Empréstimo'],
  ]) {
    assert.match(listMigration, new RegExp(`WHEN '${code}' THEN '${label}'`));
    assert.match(receiptMigration, new RegExp(`WHEN '${code}' THEN '${label}'`));
  }
  assert.match(listMigration, /'categoryCode', item\.categoria_codigo/);
  assert.match(receiptMigration, /'categoryCode', coalesce/);
});

test('busca, período, categoria, status e página integram o contrato autoritativo', () => {
  for (const parameter of [
    'p_busca text',
    'p_data_inicial date',
    'p_data_final date',
    'p_categoria text',
    'p_status text',
    'p_pagina integer',
    'p_tamanho_pagina integer',
  ]) {
    assert.ok(listMigration.includes(parameter), `parâmetro ausente: ${parameter}`);
  }
  assert.match(listMigration, /row_number\(\) OVER/);
  assert.match(listMigration, /item\.ordinal > \(pagina\.current_page - 1\) \* v_page_size/);
  assert.match(listMigration, /'totalPages', pagina\.total_pages/);
  assert.match(listMigration, /count\(\*\) FILTER \(WHERE status_exibicao = 'ABERTO'\)/);
  assert.match(listMigration, /SELECT DISTINCT categoria/);
});

test('recibo é autorizado, exige PAGO e congela modelo e marca do polo', () => {
  const authCheck = receiptMigration.indexOf('v_current_professor_id := public.current_professor_id()');
  const financialRead = receiptMigration.indexOf('FROM public.contas_pagar AS conta');
  assert.ok(authCheck >= 0 && financialRead > authCheck);
  assert.match(receiptMigration, /SECURITY INVOKER[\s\S]*SET search_path TO ''/);
  assert.match(receiptMigration, /upper\(btrim\(coalesce\(conta\.status, ''\)\)\) = 'PAGO'/);
  assert.match(receiptMigration, /'source', 'MODELO_RECIBO_PADRAO'/);
  assert.match(receiptMigration, /'documentKind', 'RECIBO_HONORARIOS_PROFESSOR'/);
  for (const field of ["'imageUrl'", "'opacity'", "'scale'", "'rotate'"]) {
    assert.ok(receiptMigration.includes(field), `marca d água sem ${field}`);
  }
  assert.match(receiptMigration, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(receiptMigration, /TO authenticated;/);
});

test('frontend apresenta o payload e nunca consulta ou recalcula o domínio financeiro', () => {
  assert.doesNotMatch(page, /\.from\(['"]contas_pagar/);
  assert.doesNotMatch(page, /\.reduce\(|\.filter\(|\.slice\(|new Date\(/);
  assert.match(page, /financeQuery\.isError \|\| !financeQuery\.data/);
  assert.match(page, /financeQuery\.refetch\(\)/);
  assert.match(service, /supabase\.rpc\('portal_professor_financeiro_listar'/);
  assert.match(service, /supabase\.rpc\('portal_professor_financeiro_preparar_recibo'/);
  assert.match(service, /request = request\.abortSignal\(signal\)/);
  assert.doesNotMatch(service, /valorPago\s*\|\||valuePaid\s*\|\|/);
  assert.match(presentation, /error\.message\.toLowerCase\(\)/);
  assert.doesNotMatch(presentation, /return\s+(?:error\.message|message)\b/);
  assert.match(presentation, /Verifique sua conexão e tente novamente/);
});

test('TanStack separa professor, polo, filtros, página e recibo', () => {
  for (const dependency of [
    'professorId',
    'poloId',
    'search: filters.search',
    'startDate: filters.startDate',
    'endDate: filters.endDate',
    'category: filters.category',
    'status: filters.status',
    'page: filters.page',
    'pageSize: filters.pageSize',
    'paymentId',
  ]) {
    assert.ok(queries.includes(dependency), `query key sem dependência: ${dependency}`);
  }
  assert.match(queries, /queryFn: \(\{ signal \}\)/);
  assert.match(queries, /staleTime: 30_000/);
  assert.match(queries, /gcTime: 0/);
});

test('prévia, download e impressão reutilizam um único Blob PDF vetorial', () => {
  assert.match(receiptPdf, /drawCanonicalInstitutionalHeader/);
  assert.match(receiptPdf, /drawCanonicalPdfWatermark/);
  assert.match(receiptPdf, /resolveCanonicalPdfPhoto/);
  assert.match(receiptPdf, /pdf\.output\('blob'\)/);
  assert.doesNotMatch(receiptPdf, /html2canvas|canvas|ContinuousElement|dom-to-selectable/i);
  assert.match(receiptModal, /CanonicalDocumentPreviewModal/);
  assert.match(receiptModal, /createPdf=\{createProfessorFinancialReceiptPdf\}/);
  assert.match(receiptModal, /snapshot: payload/);
  assert.match(canonicalPreviewModal, /preparedPdfRef\.current\?\.key === key/);
  assert.match(canonicalPreviewModal, /preparedPdfRef\.current = prepared/);
  assert.match(canonicalPreviewModal, /URL\.createObjectURL\(previewPdf\.blob\)/);
  assert.match(canonicalPreviewModal, /downloadPdfBlob\(pdf\.blob, pdf\.fileName\)/);
  assert.match(canonicalPreviewModal, /printPdfBlob\(pdf\.blob/);
});
