import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import {
  createFinancialReportPdfDocument,
  inspectFinancialReportPdfOperatorsForTest,
} from '../../../components/financial-report.vector-pdf';
import { ReceivableAmountSummary } from './ReceivableAmountSummary';

test('extrato vetorial conserva decomposição, origem calculada e residual no mesmo compositor oficial', async () => {
  const values = [
    { status: 'PAGO', valor: 279.9, valorPago: 260, descontoAplicado: 19.9,
      jurosAplicados: 0, multaAplicada: 0, acrescimoAplicado: 0, diferencaNaoDiscriminada: 0,
      composicaoStatus: 'CALCULADO_REGRA_INFORMADA_PROESC' },
    { status: 'PAGO', valor: 279.9, valorPago: 260, descontoAplicado: 19.9,
      jurosAplicados: 1.71, multaAplicada: 5.2, acrescimoAplicado: 0, diferencaNaoDiscriminada: -6.91,
      composicaoStatus: 'API_E_REGRA_INFORMADA_PROESC' },
    { status: 'PAGO', valor: 279.9, valorPago: 260, descontoAplicado: undefined,
      jurosAplicados: 1.71, multaAplicada: 5.2, acrescimoAplicado: undefined, diferencaNaoDiscriminada: -26.81,
      composicaoStatus: 'PARCIAL_POR_API_PROESC' },
  ];
  const pdf = await createFinancialReportPdfDocument({
    title: 'Extrato financeiro', subtitle: 'Conferência da composição de recebimentos',
    fileName: 'extrato-composicao-teste', issuedAt: new Date('2026-09-13T18:00:00Z'),
    columns: ['Aluno', 'Curso / turma', 'Parcela', 'Recebimento', 'Datas', 'Situação', 'Valor']
      .map((label) => ({ label })),
    rows: values.map((item, index) => ({
      id: `synthetic-${index}`,
      cells: [`Aluno de teste ${index + 1}`, 'Curso de teste / Turma de teste', 'Parcela 1',
        'Origem: Proesc', 'Venc.: 15/09/2026 Pago: 04/09/2026', 'PAGO',
        <ReceivableAmountSummary item={item} compact />],
    })),
    company: { nomeFantasia: 'Instituição de teste', cidade: 'Japoatã', uf: 'SE' },
    footerNote: 'Valores pagos preservados; componentes provenientes do contrato financeiro.',
  });
  const source = pdf.output();
  for (const amount of ['279,90', '260,00', '19,90', '1,71', '5,20', '6,91', '26,81']) {
    assert.ok(source.includes(amount), `Valor ${amount} ausente do PDF vetorial`);
  }
  assert.match(source, /Calculado/);
  assert.match(source, /complementados/);
  const pages = inspectFinancialReportPdfOperatorsForTest(pdf);
  assert.ok(pages.every((page) => page.hasTextOperator && page.hasVectorGeometry));
  assert.ok(pages.every((page) => page.imageDrawCount === 1));
  if (process.env.RECEIVABLE_COMPOSITION_PDF_OUTPUT) {
    await writeFile(process.env.RECEIVABLE_COMPOSITION_PDF_OUTPUT, new Uint8Array(pdf.output('arraybuffer')));
  }
});
