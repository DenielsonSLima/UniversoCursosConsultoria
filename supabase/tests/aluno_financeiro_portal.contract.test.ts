import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const listMigration = read(
  'supabase/migrations/20260824235300_fix_student_financial_list_json_precedence.sql',
);
const receiptMigration = read(
  'supabase/migrations/20260824235350_fix_student_financial_receipt_json_precedence.sql',
);
const receiptSecurityMigration = read(
  'supabase/migrations/20260824235450_use_invoker_student_financial_receipt.sql',
);
const page = read('modules/aluno/financeiro/FinanceiroPage.tsx');
const courseAccessRealtime = read('modules/aluno/hooks/useAlunoCourseAccessRealtime.ts');
const list = read('modules/aluno/financeiro/AlunoFinanceiroList.tsx');
const card = read('modules/aluno/financeiro/FinanceiroCardItem.tsx');
const service = read('modules/aluno/financeiro/financeiro.service.ts');
const queries = read('modules/aluno/financeiro/financeiro.queries.ts');
const presentation = read('modules/aluno/financeiro/financeiro.presentation.ts');
const eadPayment = read('modules/aluno/financeiro/useAlunoEadPayment.ts');
const receiptModal = read('modules/aluno/financeiro/AlunoFinanceiroReceiptModal.tsx');
const receiptPdf = read('modules/aluno/financeiro/aluno-financeiro-receipt.pdf.ts');
const previewModal = read(
  'modules/gestor/secretaria/shared/CanonicalDocumentPreviewModal.tsx',
);

test('lista confirma a identidade corrente e expõe grants mínimos', () => {
  const authCheck = listMigration.indexOf('auth.uid() IS NULL');
  const baseRead = listMigration.indexOf(
    'public.get_aluno_financeiro_portal_secure(p_aluno_id)',
  );
  assert.ok(authCheck >= 0 && baseRead > authCheck);
  assert.match(listMigration, /SECURITY INVOKER[\s\S]*SET search_path TO ''/);
  assert.match(listMigration, /p_aluno_id IS DISTINCT FROM public\.current_aluno_id\(\)/);
  assert.match(listMigration, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(listMigration, /TO authenticated;/);
  assert.doesNotMatch(listMigration, /GRANT EXECUTE[\s\S]*TO anon/);
});

test('valor pago zero e parcial nunca recebem fallback para o valor previsto', () => {
  assert.match(
    listMigration,
    /nullif\(element\.row_data->>'valor_pago', ''\)::numeric, 0/,
  );
  assert.match(listMigration, /sum\(effective_paid\)/);
  assert.match(listMigration, /amount_due - effective_paid/);
  assert.match(listMigration, /'paidValue', effective_paid/);
  assert.match(receiptMigration, /\{financial_summary,paidValue\}/);
  assert.doesNotMatch(
    `${listMigration}\n${receiptMigration}`,
    /coalesce\([^\n]*valor_pago[^\n]*valor\b|valor_pago\s*\|\|/i,
  );
});

test('hoje fica aberto, ontem fica atrasado e cancelado ou estornado é excluído', () => {
  assert.match(
    listMigration,
    /v_today date := \(statement_timestamp\(\) AT TIME ZONE 'America\/Maceio'\)::date/,
  );
  assert.match(listMigration, /raw_status = 'PENDENTE' AND due_date < v_today/);
  assert.doesNotMatch(listMigration, /due_date <= v_today/);
  assert.match(listMigration, /NOT IN \('CANCELADO', 'ESTORNADO'\)/);
  assert.match(listMigration, /WHEN raw_status = 'PAGO' THEN 'PAGO'/);
  assert.match(listMigration, /WHEN raw_status = 'PENDENTE' THEN 'ABERTO'/);
});

test('totais, filtros, contagens, ordem e paginação são do RPC', () => {
  for (const parameter of [
    'p_busca text',
    'p_data_inicial date',
    'p_data_final date',
    'p_modalidade text',
    'p_status text',
    'p_pagina integer',
    'p_tamanho_pagina integer',
  ]) assert.ok(listMigration.includes(parameter), `parâmetro ausente: ${parameter}`);
  assert.match(listMigration, /count\(\*\) FILTER \(WHERE status_code = 'ABERTO'\)/);
  assert.match(listMigration, /row_number\(\) OVER/);
  assert.match(listMigration, /'currentPage', page_context\.current_page/);
  assert.match(listMigration, /'totalItems', page_context\.total_items/);
  assert.match(listMigration, /'totalPages', page_context\.total_pages/);
  assert.match(listMigration, /'openByModality'/);
});

test('modalidades e tipos legados são normalizados no backend', () => {
  assert.match(listMigration, /IN \('DISCIPLINA', 'EAD', 'TECNICO', 'LIVRE', 'ESPECIALIZACAO'\)/);
  assert.match(listMigration, /ELSE 'OUTROS'/);
  for (const label of ['Inscrição EAD', 'Matrícula', 'Rematrícula', 'Mensalidade']) {
    assert.ok(listMigration.includes(label), `tipo canônico ausente: ${label}`);
  }
  assert.match(listMigration, /CASE WHEN modality = 'DISCIPLINA' THEN ''/);
});

test('payload vazio e rótulo de turma não acionam concatenação JSONB', () => {
  assert.match(
    listMigration,
    /jsonb_array_elements\(coalesce\(v_base->'rows', '\[\]'::jsonb\)\)/,
  );
  assert.match(
    listMigration,
    /coalesce\(jsonb_agg\(item ORDER BY ordinal\), '\[\]'::jsonb\)/,
  );
  assert.match(
    listMigration,
    /ELSE concat\(' ', row_data->>'parcela_numero'\) END/,
  );
  assert.doesNotMatch(listMigration, /' ' \|\| row_data->>'parcela_numero'/);
  assert.match(
    receiptMigration,
    /ELSE concat\('Turma ', v_item->>'turmaNome'\) END/,
  );
  assert.doesNotMatch(receiptMigration, /'Turma ' \|\| v_item->>'turmaNome'/);
});

test('recibo usa snapshot dedicado, exige PAGO e escopo explícito do aluno', () => {
  const authCheck = receiptMigration.indexOf('auth.uid() IS NULL');
  const accountRead = receiptMigration.indexOf('FROM public.contas_receber AS conta');
  assert.ok(authCheck >= 0 && accountRead > authCheck);
  assert.match(receiptMigration, /SET search_path TO ''/);
  assert.match(
    receiptSecurityMigration,
    /ALTER FUNCTION public\.portal_aluno_financeiro_preparar_recibo\(uuid, uuid\)\s+SET SCHEMA portal_private/,
  );
  assert.match(
    receiptSecurityMigration,
    /CREATE OR REPLACE FUNCTION public\.portal_aluno_financeiro_preparar_recibo\([\s\S]*SECURITY INVOKER\s+SET search_path TO ''/,
  );
  assert.match(
    receiptSecurityMigration,
    /SELECT portal_private\.portal_aluno_financeiro_preparar_recibo\(/,
  );
  assert.match(receiptMigration, /conta\.cliente_id = p_aluno_id/);
  assert.match(receiptMigration, /upper\(btrim\(coalesce\(conta\.status, ''\)\)\) = 'PAGO'/);
  assert.match(receiptMigration, /v_item->>'statusCode' <> 'PAGO'/);
  assert.match(receiptMigration, /'source', 'MODELO_RECIBO_PADRAO'/);
  assert.match(receiptMigration, /'documentKind', 'RECIBO_PAGAMENTO_ALUNO'/);
  assert.match(receiptMigration, /'Pagamento acadêmico'/);
  assert.match(receiptMigration, /FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(receiptMigration, /TO authenticated;/);
});

test('wrapper INVOKER preserva o compositor privado e ACL mínima', () => {
  const allowed = new Set(['id', 'polo_id', 'cliente_id', 'status']);
  const references = [
    ...receiptMigration.matchAll(/\bconta\.([a-z_][a-z0-9_]*)/g),
  ].map((match) => match[1]);
  for (const column of references) {
    assert.ok(allowed.has(column), `coluna não canônica em contas_receber: ${column}`);
  }
  assert.match(receiptMigration, /public\.current_aluno_id\(\)/);
  assert.match(receiptMigration, /WHERE aluno\.id = p_aluno_id/);
  assert.match(receiptMigration, /INNER JOIN public\.polos AS polo ON polo\.id = v_polo_id/);
  assert.match(receiptMigration, /COMMENT ON FUNCTION public\.portal_aluno_financeiro_preparar_recibo/);
  assert.match(
    receiptSecurityMigration,
    /ALTER FUNCTION portal_private\.portal_aluno_financeiro_preparar_recibo\(uuid, uuid\)\s+SECURITY DEFINER\s+SET search_path = ''/,
  );
  assert.match(
    receiptSecurityMigration,
    /REVOKE ALL ON FUNCTION portal_private\.portal_aluno_financeiro_preparar_recibo\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.match(
    receiptSecurityMigration,
    /REVOKE ALL ON FUNCTION public\.portal_aluno_financeiro_preparar_recibo\([\s\S]*FROM PUBLIC, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    receiptSecurityMigration,
    /CREATE OR REPLACE FUNCTION public\.portal_aluno_financeiro_preparar_recibo\([\s\S]*SECURITY DEFINER/,
  );
});

test('frontend envia filtros e apresenta payload sem cálculo financeiro ou DOM PDF', () => {
  assert.doesNotMatch(page, /new Date\(|Math\.|\.reduce\(|\.slice\(/);
  assert.doesNotMatch(page, /valor_pago\s*\|\||financial_summary\s*\|\|/);
  assert.doesNotMatch(list, /new Date\(|Math\.|\.reduce\(|valor_pago\s*\|\|/);
  assert.doesNotMatch(card, /installment\.(?:status|isOverdue)\b/);
  assert.match(card, /statusCode === 'ABERTO' \|\| statusCode === 'ATRASADO'/);
  assert.match(card, /statusCode === 'PAGO' && installment\.receiptEligible/);
  assert.match(card, /isAlunoPaidThroughAsaas\(installment\)/);
  assert.match(page, /financeQuery\.isError \|\| !financeQuery\.data/);
  assert.match(page, /financeQuery\.refetch\(\)/);
  assert.match(service, /supabase\.rpc\('portal_aluno_financeiro_listar'/);
  assert.match(service, /supabase\.rpc\('portal_aluno_financeiro_preparar_recibo'/);
  assert.match(service, /request = request\.abortSignal\(signal\)/);
  assert.doesNotMatch(`${page}\n${receiptPdf}`, /html2canvas|dom-to-selectable|canvas/i);
});

test('erro inicial e shape inválido nunca viram resumo R$ 0', () => {
  assert.match(page, /Financeiro indisponível/);
  assert.match(page, /Tentar novamente/);
  assert.doesNotMatch(page, /totalPaid:\s*0|totalPending:\s*0/);
  assert.match(presentation, /Verifique sua conexão e tente novamente/);
  assert.doesNotMatch(presentation, /return\s+error\.message\b/);
  assert.match(service, /ALUNO_FINANCE_LIST_UNAVAILABLE/);
  assert.doesNotMatch(service, /throw new Error\(error\.message\)/);
});

test('checkout EAD e boleto nunca exibem error.message remoto', () => {
  assert.match(eadPayment, /alunoEadPaymentErrorMessage\(error, 'BOLETO'\)/);
  assert.match(eadPayment, /alunoEadPaymentErrorMessage\(error, 'CHECKOUT'\)/);
  assert.match(eadPayment, /renderPaymentWindowError\(paymentWindow, message\)/);
  assert.match(eadPayment, /showNotice\(message, 5500\)/);
  assert.doesNotMatch(eadPayment, /error instanceof Error[\s\S]{0,80}error\.message/);
  assert.match(presentation, /safeEadPaymentMessages/);
});

test('TanStack inclui aluno, filtros, página, detalhe e AbortSignal', () => {
  for (const dependency of [
    'alunoId',
    'search: filters.search',
    'startDate: filters.startDate',
    'endDate: filters.endDate',
    'modality: filters.modality',
    'status: filters.status',
    'page: filters.page',
    'pageSize: filters.pageSize',
    'paymentId',
  ]) assert.ok(queries.includes(dependency), `query key sem dependência: ${dependency}`);
  assert.match(queries, /queryFn: \(\{ signal \}\)/);
  assert.match(queries, /gcTime: 0/);
});

test('Realtime financeiro tem assinatura única no hook global', () => {
  assert.doesNotMatch(page, /finance_realtime_events|createRealtimeInvalidationController|\.channel\(/);
  assert.match(page, /invalidateAlunoCourseAccessQueries\(queryClient, alunoId\)/);
  assert.match(courseAccessRealtime, /createRealtimeInvalidationController/);
  assert.match(courseAccessRealtime, /table: 'finance_realtime_events'/);
  assert.match(courseAccessRealtime, /subscribe\(invalidation\.onChannelStatus\)/);
  assert.equal(
    `${page}\n${courseAccessRealtime}`.match(/table: 'finance_realtime_events'/g)?.length,
    1,
  );
});

test('prévia, download e impressão reutilizam o mesmo PDF vetorial', () => {
  assert.match(receiptPdf, /drawCanonicalInstitutionalHeader/);
  assert.match(receiptPdf, /drawCanonicalPdfWatermark/);
  assert.match(receiptPdf, /pdf\.output\('blob'\)/);
  assert.match(receiptModal, /CanonicalDocumentPreviewModal/);
  assert.match(receiptModal, /createPdf=\{createAlunoFinancialReceiptPdf\}/);
  assert.match(receiptModal, /snapshot: payload/);
  assert.match(previewModal, /preparedPdfRef\.current\?\.key === key/);
  assert.match(previewModal, /downloadPdfBlob\(pdf\.blob, pdf\.fileName\)/);
  assert.match(previewModal, /printPdfBlob\(pdf\.blob/);
});
