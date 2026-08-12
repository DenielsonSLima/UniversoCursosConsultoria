import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

const [tab, table, card, details, baixa, form, lifecycle, exportModal, exportPdf, loanMigration, otherCreditsMigration, otherCreditsService, realtime] = await Promise.all([
  read('./EmprestimosTab.tsx'),
  read('./components/EmprestimosTable.tsx'),
  read('./components/EmprestimoCard.tsx'),
  read('./components/EmprestimoDetailsPage.tsx'),
  read('./components/EmprestimoBaixaModal.tsx'),
  read('./components/EmprestimoForm.tsx'),
  read('./components/EmprestimoLifecycleModal.tsx'),
  read('./components/EmprestimosExportModal.tsx'),
  read('./emprestimos-export.pdf.ts'),
  read('../../../../supabase/migrations/20260811035347_harden_loan_lifecycle_batch_settlement_and_export.sql'),
  read('../../../../supabase/migrations/20260811035350_separate_loan_credits_from_other_credits.sql'),
  read('../financeiro.service.ts'),
  read('../hooks/useFinanceiroRealtime.ts'),
]);

Deno.test('empréstimos possui abas, cards/tabela e abre detalhe em tela própria', () => {
  assert.match(tab, /\['ATIVOS', 'Ativos', counts\.ativos\]/);
  assert.match(tab, /\['FINALIZADOS', 'Finalizados', counts\.finalizados\]/);
  assert.match(tab, /setViewMode\('cards'\)/);
  assert.match(tab, /setViewMode\('table'\)/);
  assert.match(tab, /<EmprestimoDetailsPage/);
  assert.doesNotMatch(tab, /EmprestimoDetailsModal/);
  assert.doesNotMatch(tab, /RefreshCw|Atualizar|\.refetch\(\)/);
  assert.match(table, /onOpen/);
  assert.match(card, /onOpen/);
  assert.match(details, /Crédito liberado em/);
  assert.match(details, /Conta de recebimento do crédito/);
  assert.match(details, /formatEmprestimoContaCredito/);
  assert.match(details, /Valor já pago/);
  assert.match(details, /Saldo pendente/);
  assert.match(details, /onExport/);
  assert.match(tab, /onExport=\{\(\) => setShowExport\(true\)\}/);
});

Deno.test('baixa permite selecionar parcelas e encaminha somente IDs para o backend', () => {
  assert.match(baixa, /getEmprestimoOpenParcelas/);
  assert.match(baixa, /type="checkbox"/);
  assert.match(baixa, /parcelaIds: selectedIds/);
  assert.match(baixa, /emprestimoId: emprestimo\.id/);
  assert.doesNotMatch(baixa, /\.reduce\(/);
  assert.match(tab, /emprestimosService\.baixarParcelas/);
  assert.match(loanMigration, /baixar_emprestimo_parcelas_polo_secure/);
  assert.match(loanMigration, /p_emprestimo_parcela_ids uuid\[\]/);
});

Deno.test('criação e baixa usam a data civil de Maceió, não uma data UTC', () => {
  assert.match(form, /import \{ todayInMaceio \}/);
  assert.match(baixa, /import \{ todayInMaceio \}/);
  assert.match(form, /useState\(todayInMaceio\(\)\)/);
  assert.match(baixa, /useState\(todayInMaceio\(\)\)/);
  assert.doesNotMatch(`${form}\n${baixa}`, /toISOString\(\)\.slice\(0, 10\)/);
});

Deno.test('baixa registra ajustes opcionais sem calcular valor final no frontend', () => {
  assert.match(baixa, /Ajustes desta baixa/);
  assert.match(baixa, /Juros de atraso/);
  assert.match(baixa, /Desconto concedido/);
  assert.match(baixa, /Observação da baixa/);
  assert.match(baixa, /Valores finais e rateios são validados pelo servidor/);
  assert.match(baixa, /jurosValor: parseCurrency\(jurosValor\)/);
  assert.match(baixa, /multaValor: parseCurrency\(multaValor\)/);
  assert.match(baixa, /descontoValor: parseCurrency\(descontoValor\)/);
  assert.match(details, /Ajustes desta baixa/);
  assert.match(details, /Observação da baixa/);
  assert.match(details, /Valor pago:/);
  assert.doesNotMatch(baixa, /\.reduce\(/);
});

Deno.test('ciclo de vida é lógico, auditável e exige confirmação de estorno', () => {
  assert.match(lifecycle, /Excluir logicamente/);
  assert.match(lifecycle, /confirmarEstorno/);
  assert.match(lifecycle, /Motivo/);
  assert.match(tab, /emprestimosService\.cancelarOuEstornar/);
  assert.match(loanMigration, /cancelar_ou_estornar_emprestimo_financeiro_secure/);
  assert.match(loanMigration, /cancelamento_motivo/);
  assert.match(loanMigration, /emprestimos_financeiros_operacoes_requisicoes/);
  assert.doesNotMatch(loanMigration, /DELETE\s+FROM\s+public\.emprestimos_financeiros/i);
});

Deno.test('exportação usa PDF vetorial único para prévia, download e impressão', () => {
  assert.match(tab, /<EmprestimosExportModal/);
  assert.match(exportModal, /buildEmprestimosExportPdf/);
  assert.match(exportModal, /downloadPdfBlob/);
  assert.match(exportModal, /printPdfBlob/);
  assert.match(exportModal, /<iframe/);
  assert.match(exportModal, /Baixar PDF/);
  assert.match(exportModal, /Imprimir PDF/);
  assert.match(exportModal, /Exportar relatório em PDF/);
  assert.match(exportPdf, /EMPRESTIMOS_EXPORT_PDF_PIPELINE = 'native-vector'/);
  assert.match(exportPdf, /drawCanonicalInstitutionalHeader/);
  assert.match(exportPdf, /drawCanonicalPdfWatermark/);
  assert.match(exportPdf, /JÁ PAGO \/ PENDENTE/);
  assert.doesNotMatch(exportPdf, /html2canvas|dom-to-selectable-pdf/i);
  assert.match(loanMigration, /preparar_relatorio_emprestimos_financeiros_secure/);
});

Deno.test('Outros Créditos exclui empréstimos pelo vínculo canônico e recebe Realtime', () => {
  assert.match(otherCreditsService, /listar_outros_creditos_secure/);
  assert.match(otherCreditsMigration, /NOT EXISTS \([\s\S]*emprestimos_financeiros emprestimo[\s\S]*conta_receber_id = credito\.id/);
  assert.match(otherCreditsMigration, /SECURITY DEFINER/);
  assert.match(otherCreditsMigration, /gestor_has_effective_financeiro_tab\('outros-creditos'\)/);
  assert.match(otherCreditsMigration, /get_outros_creditos_summary/);
  assert.match(otherCreditsMigration, /gestor_has_financeiro_tab\('outros-creditos'\)/);
  assert.match(realtime, /outrosCreditosRoot/);
});
