import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import { parseServiceReceivablesExport } from './servicos-receber.contract';
import { serviceReportColumns, serviceReportRows } from './useServiceReceivablesReport';
import { createFinancialReportPdfDocument, financialReportValueToText, inspectFinancialReportPdfOperatorsForTest } from '../../components/financial-report.vector-pdf';

const id = (n: number) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`;
function snapshot() {
  return { total_items: 31, generated_at: '2026-11-12T18:00:00Z', rows: Array.from({ length: 31 }, (_, index) => ({
    id: id(index + 100), cliente_id: id(20), cliente_nome: 'Parceiro sintético', polo_id: id(1), polo_nome: 'Unidade sintética',
    descricao: `Serviço de exemplo ${index + 1}`, nfse_fiscal_description: `Descrição fiscal integral ${index + 1}`,
    valor: '10.00', data_vencimento: '2026-11-30', status: 'PENDENTE', categoria: 'OUTROS_CREDITOS',
    nfse_number: '999', nfse_installment_number: index + 1, nfse_installment_count: 31,
  })), summary: { pending_count: 31, received_count: 0, canceled_count: 0, overdue_count: 0, all_count: 31,
    pending_value: '310.00', received_value: '0.00', canceled_value: '0.00', overdue_value: '0.00', all_value: '310.00' } };
}

test('export requires the complete single snapshot and preserves server summary without totaling the current page', () => {
  const raw = snapshot(), parsed = parseServiceReceivablesExport(raw), rows = serviceReportRows(parsed);
  assert.equal(rows.length, 31); assert.equal(parsed.summary.pendingValue, 310);
  assert.equal(parsed.generatedAt, raw.generated_at); assert.equal(rows[30].id, id(130));
  const last = rows[30].cells.map(financialReportValueToText).join(' ');
  assert.match(last, /Descrição fiscal integral 31/); assert.match(last, /NFS-e nº 999/); assert.match(last, /31\/31/);
  assert.doesNotMatch(last, /Matrícula:|Turma:/);
  assert.throws(() => parseServiceReceivablesExport({ ...raw, rows: raw.rows.slice(0, 20) }));
  assert.throws(() => parseServiceReceivablesExport({ ...raw, total_items: 5001 }));
  assert.throws(() => parseServiceReceivablesExport({ ...raw, generated_at: 'invalid' }));
  assert.throws(() => parseServiceReceivablesExport({ ...raw, rows: [...raw.rows.slice(0, 30), raw.rows[0]] }));
});

test('service statement reuses the native financial compositor and includes every filtered installment', async () => {
  const parsed = parseServiceReceivablesExport(snapshot());
  const pdf = await createFinancialReportPdfDocument({ title: 'Extrato de Cobranças - Serviços', fileName: 'extrato-servicos-sintetico',
    columns: serviceReportColumns, rows: serviceReportRows(parsed), tone: 'emerald', issuedAt: new Date(parsed.generatedAt),
    summaryCards: [{ label: 'A receber', value: 'R$ 310,00', tone: 'amber' }],
    filters: [{ label: 'Origem', value: 'Serviços NFS-e' }, { label: 'Registros', value: '31 cobranças' }],
    footerNote: 'Valores e situações provenientes do snapshot financeiro canônico.',
    company: { nomeFantasia: 'Instituição sintética', cidade: 'Cidade sintética', uf: 'SE', tipo: 'Matriz' } });
  const pages = inspectFinancialReportPdfOperatorsForTest(pdf);
  assert(pages.length > 1); assert(pages.every(page => page.hasTextOperator && page.imageDrawCount === 1));
  assert.match(pdf.output(), /integral 31/); assert.match(pdf.output(), /31\/31/); assert.doesNotMatch(pdf.output(), /html2canvas/);
  if (process.env.SERVICE_RECEIVABLES_PDF_OUTPUT) await writeFile(process.env.SERVICE_RECEIVABLES_PDF_OUTPUT, new Uint8Array(pdf.output('arraybuffer')));
});

