import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatCarteirinhaDate,
  formatCarteirinhaMonthYear,
} from './carteirinha-date-formatters.ts';

test('data canônica da carteirinha é apresentada como DD/MM/AAAA', () => {
  assert.equal(formatCarteirinhaDate('2005-08-15'), '15/08/2005');
  assert.equal(formatCarteirinhaDate('15/08/2005'), '15/08/2005');
  assert.equal(formatCarteirinhaDate('2027-04-01T02:59:59.999Z'), '31/03/2027');
  assert.equal(formatCarteirinhaDate('Não informado'), 'Não informado');
  assert.equal(formatCarteirinhaDate('2005-02-30'), '2005-02-30');
});

test('competência e validade resumida são apresentadas como MM/AAAA', () => {
  assert.equal(formatCarteirinhaMonthYear('2026-09'), '09/2026');
  assert.equal(formatCarteirinhaMonthYear('2027-03-31'), '03/2027');
  assert.equal(formatCarteirinhaMonthYear('03/2027'), '03/2027');
  assert.equal(formatCarteirinhaMonthYear('Sem vencimento'), 'Sem vencimento');
});

test('entrypoints de prévia, PDF e segunda via usam a mesma apresentação brasileira', () => {
  const sources = [
    'modules/aluno/secretaria/SecretariaPage.tsx',
    'modules/gestor/secretaria/carteirinhas/SecretariaCarteirinhasPage.tsx',
    'modules/gestor/secretaria/historico-emissoes/preview-utils.ts',
    'modules/gestor/secretaria/historico-emissoes/components/EmissionDocumentPages.tsx',
    'modules/gestor/secretaria/shared/secretaria-documentos.service.ts',
  ].map((path) => readFileSync(path, 'utf8'));

  for (const source of sources) {
    assert.match(source, /formatCarteirinhaDate\(/);
  }
});
