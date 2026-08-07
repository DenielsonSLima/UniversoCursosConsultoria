import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeSearchText, textMatchesSearch } from './search.ts';

test('normaliza caixa, acentos compostos e espaços sem alterar o conteúdo pesquisável', () => {
  assert.equal(
    normalizeSearchText('  DÉBORA   São\nFrancisco  '),
    'debora sao francisco',
  );
});

test('normaliza acentos representados por caracteres Unicode decompostos', () => {
  assert.equal(normalizeSearchText('Jose\u0301'), 'jose');
  assert.equal(textMatchesSearch('jose', ['José']), true);
  assert.equal(textMatchesSearch('josé', ['Jose\u0301']), true);
});

test('encontra nomes sem exigir acento ou a mesma caixa', () => {
  assert.equal(textMatchesSearch('debora', ['DÉBORA FRANCINNY']), true);
  assert.equal(textMatchesSearch('SÃO', ['Amparo de Sao Francisco/SE']), true);
  assert.equal(textMatchesSearch('JOÃO', ['Maria José']), false);
});

test('preserva pontuação significativa de documentos e e-mails na normalização', () => {
  assert.equal(normalizeSearchText('105.236.875-16'), '105.236.875-16');
  assert.equal(
    normalizeSearchText('João.Silva+Financeiro@Exemplo.COM.BR'),
    'joao.silva+financeiro@exemplo.com.br',
  );
});

test('aceita CPF e CNPJ com ou sem máscara sem misturar campos diferentes', () => {
  assert.equal(textMatchesSearch('10523687516', ['105.236.875-16']), true);
  assert.equal(textMatchesSearch('13.278.137/0001-54', ['13278137000154']), true);
  assert.equal(textMatchesSearch('10523687516', ['105.236', '875-16']), false);
});

test('mantém números e valores booleanos pesquisáveis', () => {
  assert.equal(normalizeSearchText(0), '0');
  assert.equal(normalizeSearchText(false), 'false');
  assert.equal(textMatchesSearch('0', [0]), true);
});

test('mantém a busca tolerante por assinatura consonantal existente', () => {
  assert.equal(textMatchesSearch('debora', ['Deborah Nascimento']), true);
  assert.equal(textMatchesSearch('de', ['André']), false);
});

test('termo vazio não elimina resultados', () => {
  assert.equal(textMatchesSearch('   ', []), true);
});
