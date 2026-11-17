import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { isSelfDirectedPresentation } from './eadPresentation.ts';

test('only explicit self-directed configuration opts in', () => {
  for (const value of [undefined, null, '', {}, { formato: 'video' }]) {
    assert.equal(isSelfDirectedPresentation(value), false);
  }
  assert.equal(isSelfDirectedPresentation({ formato: 'autoinstrucional' }), true);
});
test('self-directed facts disclose format and certificate limits', () => {
  const source = readFileSync(new URL('./EadLearningFacts.tsx', import.meta.url), 'utf8');
  for (const disclosure of ['não inclui videoaulas', 'Não inclui tutoria nem correção docente individual',
    'Certificado de curso livre', 'não representa horas de vídeo', 'depende da instituição ou edital']) {
    assert.ok(source.includes(disclosure));
  }
});
test('public detail keeps publication and active-state filters', () => {
  const source = readFileSync(new URL('../courseAvailability.ts', import.meta.url), 'utf8');
  const detail = source.split('export const fetchPublicCourseById')[1].split('export const')[0];
  assert.ok(detail.includes(".eq('publicar_site', true)"));
  assert.ok(detail.includes(".eq('status', 'ativo')"));
});

test('editing existing courses preserves presentation metadata', () => {
  const source = readFileSync(new URL('../../gestor/cadastros/cursos-ead/components/useEadCourseWizardPersistence.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('...curso?.ead_config?.pagina'));
});
