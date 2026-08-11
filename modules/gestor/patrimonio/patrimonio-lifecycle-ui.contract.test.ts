import assert from 'node:assert/strict';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const read = (path: string) => Deno.readTextFile(new URL(path, import.meta.url));

const [service, page, card, table, toolbar, form, writeOff, remove, exportModal, exportPdf, migration] = await Promise.all([
  read('./patrimonio.service.ts'),
  read('./PatrimonioPage.tsx'),
  read('./components/PatrimonioCard.tsx'),
  read('./components/PatrimonioTable.tsx'),
  read('./components/PatrimonioToolbar.tsx'),
  read('./components/PatrimonioFormModal.tsx'),
  read('./components/PatrimonioWriteOffModal.tsx'),
  read('./components/PatrimonioDeleteDialog.tsx'),
  read('./components/PatrimonioExportModal.tsx'),
  read('./patrimonio-export.pdf.ts'),
  read('../../../supabase/migrations/20260810143000_create_patrimonio_lifecycle.sql'),
]);

Deno.test('cliente usa nomes e argumentos exatos das RPCs do ciclo patrimonial', () => {
  const contracts = [
    ['listar_patrimonios_v2_secure', ['p_polo_id', 'p_search', 'p_tipo_produto_id', 'p_status', 'p_limit', 'p_offset']],
    ['atualizar_patrimonio_secure', ['p_request_id', 'p_polo_id', 'p_patrimonio_id', 'p_expected_updated_at', 'p_data_aquisicao', 'p_tipo_produto_id', 'p_descricao', 'p_quantidade', 'p_valor_unitario', 'p_numero_serie', 'p_observacao', 'p_motivo']],
    ['baixar_patrimonio_perda_secure', ['p_request_id', 'p_polo_id', 'p_patrimonio_id', 'p_expected_updated_at', 'p_data_baixa', 'p_quantidade_baixa', 'p_motivo', 'p_observacao']],
    ['excluir_patrimonio_secure', ['p_request_id', 'p_polo_id', 'p_patrimonio_id', 'p_expected_updated_at', 'p_motivo']],
  ] as const;

  for (const [rpc, args] of contracts) {
    assert.ok(service.includes(`'${rpc}'`), `RPC ausente no cliente: ${rpc}`);
    assert.match(migration, new RegExp(`function public\\.${rpc}\\(`, 'i'));
    for (const argument of args) assert.ok(service.includes(`${argument}:`), `Argumento ausente: ${rpc}.${argument}`);
  }
});

Deno.test('listagem usa 32 itens, quatro cards no desktop e filtro de situação protegido', () => {
  assert.match(page, /const PAGE_SIZE = 32/);
  assert.match(page, /\sxl:grid-cols-4/);
  assert.match(page, /canViewDeleted=\{isGlobal\}/);
  assert.match(toolbar, /value: 'ativos', label: 'Ativos'/);
  assert.match(toolbar, /value: 'baixados', label: 'Baixados'/);
  assert.match(toolbar, /value: 'excluidos',/);
  assert.match(toolbar, /aria-label="Situação do patrimônio"/);
  assert.doesNotMatch(toolbar, /Filtrar por situação do patrimônio/);
  assert.match(page, /caixaQueryKeys\.patrimonioResumosForPolo\(activePoloId\)/);
  assert.match(page, /caixaQueryKeys\.patrimonioResumosForPolo\('todos'\)/);
});

Deno.test('exportação abre o mesmo PDF vetorial para prévia, download e impressão', () => {
  assert.match(toolbar, /FileOutput/);
  assert.match(toolbar, />\s*Exportar\s*</);
  assert.match(page, /<PatrimonioExportModal/);
  assert.match(page, /patrimonioQueryKeys\.export\(activePoloId\)/);
  assert.match(service, /async listAllForExport\(poloId: string\)/);
  assert.match(service, /status: 'todos'/);
  assert.match(service, /const pageSize = 100/);
  assert.match(exportModal, /createPortal/);
  assert.match(exportModal, /buildPatrimonioExportPdf/);
  assert.match(exportModal, /downloadPdfBlob/);
  assert.match(exportModal, /printPdfBlob/);
  assert.match(exportModal, /Baixar PDF/);
  assert.match(exportModal, /Imprimir/);
  assert.match(exportModal, /<iframe/);
  assert.match(exportModal, /marcaDaguaService\.getCompaniesWithWatermark/);
  assert.match(exportModal, /landscapeWatermarkUrl/);
  assert.match(exportPdf, /PATRIMONIO_EXPORT_PDF_PIPELINE = 'native-vector'/);
  assert.match(exportPdf, /drawCanonicalInstitutionalHeader/);
  assert.match(exportPdf, /normalizeCanonicalInstitutionalHeader/);
  assert.match(exportPdf, /patrimonio-landscape-watermark/);
  assert.match(exportPdf, /orientation: 'landscape'/);
  assert.doesNotMatch(exportPdf, /html2canvas|dom-to-selectable-pdf/i);
});

Deno.test('conflito recarrega apenas a lista atual e fecha a ação se o item sair do filtro', () => {
  assert.match(page, /const currentListKey = patrimonioQueryKeys\.list\(filters\)/);
  assert.match(page, /getQueryData<PatrimonioListResult>\(currentListKey\)/);
  assert.doesNotMatch(page, /getQueriesData<PatrimonioListResult>/);
  assert.match(page, /if \(!latestItem\) \{\s*setItem\(null\);/);
  assert.match(page, /O registro saiu desta página ou filtro/);
});

Deno.test('cards e tabela mantêm ações visíveis e o card não repete o polo', () => {
  assert.doesNotMatch(card, /poloNome|Polo:/);
  assert.match(card, /'Editar'/);
  assert.match(card, /'Registrar perda'/);
  assert.match(card, /Excluir patrimônio/);
  assert.doesNotMatch(card, /opacity-0/);
  assert.doesNotMatch(table, /opacity-0/);
  assert.match(table, /sticky right-0/);
  assert.match(table, /aria-label=\{`Editar patrimônio/);
  assert.match(table, /aria-label=\{`Registrar perda/);
  assert.match(table, /aria-label=\{`Excluir patrimônio/);
});

Deno.test('modais exigem justificativa, limites de perda e preservação econômica após baixa', () => {
  assert.match(form, /Motivo da edição/);
  assert.match(form, /canEditEconomicFields/);
  assert.match(form, /Data de aquisição, quantidade original e valor unitário ficam preservados/);
  assert.match(writeOff, /min=\{item\.dataAquisicao\}/);
  assert.match(writeOff, /max=\{getToday\(\)\}/);
  assert.match(writeOff, /parsedQuantity <= item\.quantidadeDisponivel/);
  for (const reason of ['perda', 'furto', 'dano', 'obsolescencia', 'outro']) {
    assert.ok(writeOff.includes(`value: '${reason}'`));
  }
  assert.match(writeOff, /motivo !== 'outro' \|\| Boolean\(observacao\.trim\(\)\)/);
  assert.match(remove, /role="alertdialog"/);
  assert.match(remove, /Motivo da exclusão/);
});
