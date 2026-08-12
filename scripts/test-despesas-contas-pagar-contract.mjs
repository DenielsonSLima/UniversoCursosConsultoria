import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260811123901_harden_expense_corrections_and_detail_reads.sql'),
  'utf8',
);
const service = readFileSync(
  resolve(root, 'modules/gestor/financeiro/despesas/despesas.service.ts'),
  'utf8',
);
const table = readFileSync(
  resolve(root, 'modules/gestor/financeiro/despesas/components/DespesaTable.tsx'),
  'utf8',
);
const card = readFileSync(
  resolve(root, 'modules/gestor/financeiro/despesas/components/DespesaCard.tsx'),
  'utf8',
);
const grouped = readFileSync(
  resolve(root, 'modules/gestor/financeiro/despesas/components/DespesaGroupedView.tsx'),
  'utf8',
);
const receiptModal = readFileSync(
  resolve(root, 'modules/gestor/financeiro/despesas/components/DespesaReciboModal.tsx'),
  'utf8',
);
const receiptPdf = readFileSync(
  resolve(root, 'modules/gestor/financeiro/despesas/components/despesa-recibo.pdf.ts'),
  'utf8',
);
const receiptExample = readFileSync(
  resolve(root, 'modules/gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPage.tsx'),
  'utf8',
);
const legacyReceiptPreview = readFileSync(
  resolve(root, 'modules/gestor/cadastros/modelos-documentos/recibo/ReciboDespesaPreview.tsx'),
  'utf8',
);
const expenseTabs = [
  readFileSync(resolve(root, 'modules/gestor/financeiro/despesas/fixas/DespesasFixasTab.tsx'), 'utf8'),
  readFileSync(resolve(root, 'modules/gestor/financeiro/despesas/variaveis/DespesasVariaveisTab.tsx'), 'utf8'),
  readFileSync(resolve(root, 'modules/gestor/financeiro/outros-debitos/OutrosDebitosTab.tsx'), 'utf8'),
];

const functionBody = (name) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.notEqual(start, -1, `RPC ${name} deve existir.`);
  const end = migration.indexOf('$function$;', start);
  assert.notEqual(end, -1, `RPC ${name} deve possuir corpo delimitado.`);
  return migration.slice(start, end);
};

test('leitura preserva e apresenta categoria, fornecedor, turma e data real de lançamento', () => {
  for (const fragment of [
    'dataLancamento: row.data_lancamento ?? undefined',
    'categoriaNome: row.categoria_nome ?? row.categorias_financeiras?.nome ?? undefined',
    'fornecedorNome: row.fornecedor_nome ?? row.parceiros?.nome ?? undefined',
    'turmaNome: row.turma_nome ?? row.turmas?.nome ?? undefined',
    'listar_despesas_economicas_detalhadas_secure',
    'enrichLegacyEconomicRowsWithLaunchDate',
    '.filter((row) => !row.is_rateio_derivado)',
    ".select('id, data_lancamento')",
    'O lançamento não retornou nenhuma despesa confirmada.',
  ]) {
    assert.ok(service.includes(fragment), `Mapper/serviço deve conter: ${fragment}`);
  }

  const detailBody = functionBody('listar_despesas_economicas_detalhadas_secure');
  for (const fragment of [
    'despesa.data_lancamento',
    'conta_bancaria_nome text',
    'item.is_rateio_derivado OR conta.id IS NULL THEN NULL',
    'public.listar_despesas_economicas_secure(',
  ]) {
    assert.ok(detailBody.includes(fragment), `Leitura detalhada deve conter: ${fragment}`);
  }
});

test('tabela, cards e agrupamento exibem o contrato financeiro e ações corretas', () => {
  for (const fragment of [
    'Lançamento:',
    'Vencimento:',
    'Valor pago:',
    'Conta de saída:',
    'Única (1/1)',
    'Editar lançamento',
    'Estornar e cancelar',
    '<Printer',
  ]) {
    assert.ok(table.includes(fragment), `Tabela deve conter: ${fragment}`);
  }
  assert.equal(table.includes('Edit2'), false, 'Ícone de editar não pode acionar impressão.');

  for (const fragment of [
    'Data de lançamento',
    'Fornecedor não informado',
    'Valor pago:',
    'Conta de saída',
    'Estornar e cancelar',
  ]) {
    assert.ok(card.includes(fragment), `Card deve conter: ${fragment}`);
  }
  assert.ok(grouped.includes('contas={contas}'), 'Visão agrupada deve preservar o rótulo da conta.');
});

test('edição e estorno são idempotentes, autorizados e auditáveis', () => {
  const updateBody = functionBody('atualizar_despesa_secure');
  const cancelBody = functionBody('cancelar_ou_estornar_despesa_secure');

  for (const [name, body] of [
    ['atualizar_despesa_secure', updateBody],
    ['cancelar_ou_estornar_despesa_secure', cancelBody],
  ]) {
    const authorization = body.indexOf("IF auth.role() <> 'service_role'");
    const replay = body.indexOf('FROM public.despesas_operacoes_requisicoes');
    assert.ok(authorization >= 0, `${name} deve validar autorização.`);
    assert.ok(replay >= 0, `${name} deve consultar o replay durável.`);
    assert.ok(authorization < replay, `${name} deve autorizar antes do replay.`);
    assert.ok(body.includes("SET search_path TO ''"), `${name} deve fixar search_path seguro.`);
    assert.ok(body.includes("public.gestor_has_effective_financeiro_tab('outros-debitos')"));
    assert.ok(body.includes("public.gestor_has_effective_financeiro_tab('despesas')"));
  }

  for (const fragment of [
    "v_despesa.status NOT IN ('PENDENTE', 'VENCIDO')",
    "categoria.status = 'ativo'",
    "parceiro.status = 'ATIVO'",
    'data_lancamento = p_data_lancamento',
  ]) {
    assert.ok(updateBody.includes(fragment), `Edição deve conter: ${fragment}`);
  }

  for (const fragment of [
    "v_despesa.status NOT IN ('PENDENTE', 'VENCIDO', 'PAGO')",
    'p_confirmar_estorno',
    "status = 'CANCELADO'",
    'cancelamento_motivo = v_motivo',
    'estornado_em = CASE WHEN v_era_pago THEN now() ELSE NULL END',
  ]) {
    assert.ok(cancelBody.includes(fragment), `Estorno/cancelamento deve conter: ${fragment}`);
  }

  assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS public.despesas_operacoes_requisicoes'));
  assert.ok(migration.includes('payload_hash text NOT NULL'));
  assert.ok(!migration.includes('payload jsonb NOT NULL'));
  assert.ok(!migration.includes('v_replay.payload IS DISTINCT FROM v_payload'));
  assert.ok(migration.includes('v_replay.actor_id IS DISTINCT FROM auth.uid()'));
  assert.ok(migration.includes('v_replay.payload_hash IS DISTINCT FROM v_payload_hash'));
  assert.ok(migration.includes("extensions.digest(pg_catalog.convert_to(v_payload::text, 'UTF8'), 'sha256')"));
  assert.ok(!migration.includes('p_data_vencimento < p_data_lancamento'));
  assert.ok(migration.includes('REVOKE ALL ON FUNCTION public.cancelar_despesa_secure(uuid, text)'));
});

test('recibo abre prévia fullscreen e reutiliza o PDF vetorial institucional', () => {
  const receiptBody = functionBody('preparar_recibo_despesa_secure');
  const authorization = receiptBody.indexOf("IF auth.role() <> 'service_role'");
  const payload = receiptBody.indexOf("SELECT jsonb_build_object(");
  assert.ok(authorization >= 0, 'Snapshot do recibo deve autorizar o acesso.');
  assert.ok(payload >= 0 && authorization < payload, 'Snapshot deve autorizar antes de retornar dados.');
  for (const fragment of [
    'WHERE id = p_despesa_id',
    "'contaBancariaNome'",
    "'dataLancamento'",
    "'fornecedorNome'",
    "'fornecedorDocumento'",
    'fornecedor.cpf_cnpj',
    "'watermark_url'",
  ]) {
    assert.ok(receiptBody.includes(fragment), `Snapshot do recibo deve conter: ${fragment}`);
  }
  assert.equal(receiptBody.includes('v_despesa.is_rateio_derivado'), false, 'A tabela física não possui o campo econômico de rateio.');
  assert.ok(receiptModal.includes('item?.isRateioDerived'), 'O modal não pode emitir recibo para uma linha derivada de rateio.');

  for (const fragment of [
    'CanonicalDocumentPreviewModal',
    'createDespesaReciboPdf',
    'getDespesaReciboSnapshot',
  ]) {
    assert.ok(receiptModal.includes(fragment), `Modal do recibo deve conter: ${fragment}`);
  }
  for (const fragment of [
    'drawCanonicalInstitutionalHeader',
    'drawCanonicalPdfWatermark',
    'formatCpfCnpj',
    'CPF/CNPJ',
    "pdf.output('blob')",
    'poloSnapshot || await resolveReceiptPolo',
  ]) {
    assert.ok(receiptPdf.includes(fragment), `PDF do recibo deve conter: ${fragment}`);
  }
  assert.equal(receiptPdf.includes('html2canvas'), false, 'Recibo não pode rasterizar a página.');
  assert.equal(receiptPdf.includes('window.print'), false, 'Impressão deve ser feita pelo Blob canônico.');
  assert.equal(receiptPdf.includes('fornecedorId'), false, 'O recibo não pode usar o UUID interno como CPF/CNPJ.');
  assert.equal(
    legacyReceiptPreview.includes('CPF/CNPJ: ${text(data.fornecedorId)}'),
    false,
    'A prévia legada também não pode rotular o UUID interno como documento.',
  );
  assert.ok(receiptExample.includes('DespesaReciboModal'), 'Exemplo também deve abrir a prévia oficial.');
  expenseTabs.forEach((tab) => {
    assert.ok(tab.includes('DespesaReciboModal'), 'Toda aba de despesa deve abrir a prévia fullscreen.');
    assert.equal(tab.includes('printReciboDespesa'), false, 'Nenhuma aba pode disparar impressão direta.');
  });
});
