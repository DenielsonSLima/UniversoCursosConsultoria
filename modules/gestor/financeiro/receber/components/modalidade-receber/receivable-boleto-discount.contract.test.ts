import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [types, mapper, presentation, report] = await Promise.all([
  readFile(new URL('../../../financeiro.types.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../../financeiro.receivables-page.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('./ReceivableItemPresentation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('./useModalidadeReceberReport.tsx', import.meta.url), 'utf8'),
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

test('tela e extrato usam a mesma apresentação canônica do desconto', () => {
  assert.match(presentation, /receivableDiscountPresentation\(item\)/);
  assert.match(report, /receivableDiscountPresentation\(item\)/);

  for (const source of [presentation, report]) {
    assert.match(source, /Desconto aplicado/);
    assert.match(source, /Desconto do boleto/);
    assert.match(source, /Desconto expirado/);
  }
});
