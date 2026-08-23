import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { hasCoordinationSignatureAccess } from './professor-signature-access.ts';

test('libera a caixa de revisão somente com capability ou escopo canônico de coordenação', () => {
  assert.equal(hasCoordinationSignatureAccess({ capabilities: ['PORTAL_COORDENADOR'] }), true);
  assert.equal(hasCoordinationSignatureAccess({ capabilities: ['LISTAR_ATRIBUICOES'] }), true);
  assert.equal(hasCoordinationSignatureAccess({ scopes: [{
    coordenacaoId: 'coordenacao-1',
    cursoId: 'curso-1',
    cursoNome: 'Enfermagem',
    poloId: 'polo-1',
    poloNome: 'Matriz',
    vigenteDe: null,
    vigenteAte: null,
  }] }), true);
  assert.equal(hasCoordinationSignatureAccess({ capabilities: ['ASSINATURAS_VISUALIZAR'] }), false);
  assert.equal(hasCoordinationSignatureAccess({ scopes: [{ kind: 'DISCIPLINA_PROFESSOR' }] }), false);
  assert.equal(hasCoordinationSignatureAccess({}), false);
});

test('usa duas caixas no mesmo módulo e mantém o mesmo contexto autorizado', async () => {
  const source = await readFile(new URL('./ProfessorAssinaturasPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /profile="PROFESSOR"[\s\S]*heading="Como professor"/);
  assert.match(source, /profile="COORDENADOR"[\s\S]*heading="Revisão como coordenação"/);
  assert.equal(source.match(/contextId=\{contextId\}/gu)?.length, 2);
  assert.match(source, /canReviewAsCoordinator \? \(/);
});
