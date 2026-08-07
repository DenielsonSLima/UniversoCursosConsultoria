import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertEmissionAlignedWithIssue,
  getEmissionRenderKey,
  isEmissionAlignedWithIssue,
  isCanonicalEmissionRendered,
  shouldUseSharedPreviewCache,
} from './reissue-flow.ts';
import type { EmissionLog } from './historico-emissoes.types.ts';

const emission = (overrides: Partial<EmissionLog> = {}): EmissionLog => ({
  id: 'id',
  identidade: 'identidade',
  codigo: 'BOL-0000-0000-0000',
  documento: 'boletim',
  matricula_id: 'matricula',
  aluno_id: 'aluno',
  polo_id: 'polo',
  periodo_referencia: null,
  referencia_externa: null,
  status: 'ATIVO',
  emitido_em: '2026-07-27T00:00:00.000Z',
  ultima_emissao_em: '2026-07-27T00:00:00.000Z',
  validade_ate: null,
  revogado_em: null,
  emitido_por: null,
  quantidade_emissoes: 1,
  dados_emissao: {},
  ...overrides,
});

test('a identidade de renderização muda após registrar uma reemissão', () => {
  const previous = emission();
  const canonical = emission({
    quantidade_emissoes: 2,
    ultima_emissao_em: '2026-07-28T00:00:00.000Z',
  });

  assert.notEqual(getEmissionRenderKey(previous), getEmissionRenderKey(canonical));
});

test('o DOM antigo não satisfaz o contrato da linha canônica atualizada', () => {
  const previousKey = getEmissionRenderKey(emission());
  const canonicalKey = getEmissionRenderKey(emission({
    quantidade_emissoes: 2,
    ultima_emissao_em: '2026-07-28T00:00:00.000Z',
  }));
  const oldContainer = {
    dataset: { emissionRenderKey: previousKey },
  } as Pick<HTMLElement, 'dataset'>;

  assert.equal(isCanonicalEmissionRendered(oldContainer, canonicalKey), false);
  assert.equal(isCanonicalEmissionRendered(oldContainer, previousKey), true);
});

test('a linha canônica precisa refletir contador e data retornados pela emissão', () => {
  const canonical = emission({
    quantidade_emissoes: 2,
    ultima_emissao_em: '2026-07-28T00:00:00.000Z',
  });
  const issued = {
    code: canonical.codigo,
    issueCount: 2,
    lastIssuedAt: '2026-07-28T00:00:00Z',
  };

  assert.equal(isEmissionAlignedWithIssue(canonical, issued), true);
  assert.equal(
    isEmissionAlignedWithIssue(canonical, { ...issued, issueCount: 1 }),
    false,
  );
  assert.throws(
    () => assertEmissionAlignedWithIssue(
      canonical,
      { ...issued, lastIssuedAt: '2026-07-28T00:00:01Z' },
    ),
    /divergiu do documento capturado/i,
  );
});

test('reemissão individual ignora o cache compartilhado e lote o preserva', () => {
  assert.equal(shouldUseSharedPreviewCache('fresh'), false);
  assert.equal(shouldUseSharedPreviewCache('shared'), true);
});
