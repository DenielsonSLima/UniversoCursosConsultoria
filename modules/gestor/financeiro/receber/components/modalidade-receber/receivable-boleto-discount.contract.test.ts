import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [types, mapper, presentation, report, list] = await Promise.all([
  readFile(new URL('../../../financeiro.types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../financeiro.receivables-page.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./ReceivableItemPresentation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./useModalidadeReceberReport.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./ReceivablesList.tsx', import.meta.url), 'utf8'),
]);

test('contrato diferencia desconto do boleto e desconto aplicado', () => {
  for (const field of [
    'boletoNossoNumero',
    'boletoDescontoConfigurado',
    'boletoDescontoValidoAte',
    'boletoDescontoSituacao',
    'descontoAplicado',
  ]) {
    assert.match(types, new RegExp(`\\b${field}\\b`));
  }

  assert.match(mapper, /boletoNossoNumero:\s*row\.boleto_nosso_numero/i);
  assert.match(
    mapper,
    /boletoDescontoConfigurado:\s*row\.boleto_desconto_configurado/i,
  );
  assert.match(mapper, /boletoDescontoValidoAte:\s*row\.boleto_desconto_valido_ate/i);
  assert.match(mapper, /boletoDescontoSituacao:\s*row\.boleto_desconto_situacao/i);
});

test('tabela reserva espaço entre valor, desconto e ações', () => {
  assert.match(list, /min-w-\[1080px\]/);
  assert.match(
    list,
    /w-\[11%\][\s\S]*?w-\[17%\][\s\S]*?w-\[14%\]/,
    'Datas, Valor e Ações devem reservar 11%, 17% e 14% da tabela.',
  );
  assert.match(presentation, /compact \? 'min-w-0 ' : ''/);
  assert.match(presentation, /compact \? 'text-\[10px\] leading-tight' : 'text-\[11px\]'/);
  assert.match(presentation, /compact \? 'mt-0\.5 text-\[9px\]' : 'text-\[10px\]'/);
  assert.match(
    presentation,
    /<td className="py-5 pl-3 pr-2">[\s\S]*?<ReceivableAmountSummary item=\{item\} compact \/>/,
  );
  assert.equal(
    (presentation.match(/<ReceivableAmountSummary item=\{item\} compact \/>/g) || []).length,
    1,
    'Somente a linha desktop deve usar o resumo financeiro compacto.',
  );
  assert.equal(
    (presentation.match(/<ReceivableAmountSummary item=\{item\} \/>/g) || []).length,
    1,
    'O card responsivo deve preservar a tipografia original.',
  );
  assert.match(
    presentation,
    /<td className="py-5 pl-2 pr-3"><ReceivableActionButtons/,
  );
});

test('tela e extrato usam a mesma apresentação canônica do desconto', () => {
  assert.match(presentation, /receivableDiscountPresentation\(item\)/);
  assert.match(report, /receivableDiscountPresentation\(item\)/);

  for (const source of [presentation, report]) {
    assert.match(source, /Desconto aplicado/);
    assert.match(source, /Desconto do boleto/);
    assert.match(source, /Desconto expirado/);
  }
});
