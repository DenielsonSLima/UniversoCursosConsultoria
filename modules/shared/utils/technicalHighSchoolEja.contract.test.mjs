import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sources = await Promise.all([
  readFile(
    new URL('../../gestor/parceiros/components/formularioparceiros/aluno/ParceiroAlunoFormStepEducation.tsx', import.meta.url),
    'utf8',
  ),
  readFile(
    new URL('../../gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDetailsSections.tsx', import.meta.url),
    'utf8',
  ),
  readFile(new URL('../../aluno/perfil/PerfilTechnicalSection.tsx', import.meta.url), 'utf8'),
]);

test('cadastro, edição e perfil oferecem a opção EJA', () => {
  for (const source of sources) {
    assert.match(source, /<option value=["']EJA["']>EJA<\/option>/);
  }
});

test('as três superfícies informam que o Ensino Médio não bloqueia a matrícula', () => {
  assert.match(sources[0], /opcional e não bloqueia a matrícula/i);
  assert.match(sources[1], /informativos; não bloqueiam a matrícula técnica/i);
  assert.match(sources[2], /dados do Ensino Médio são informativos/i);
});
