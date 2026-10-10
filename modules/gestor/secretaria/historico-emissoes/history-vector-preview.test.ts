import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareHistoryVectorPreview } from './history-vector-preview.ts';
import { makeEmission, makePreview } from './emission-document.pdf.contract.fixtures.ts';

test('reemissão com código igual e contador atualizado gera outro Blob para prévia e saída', async () => {
  const emission = { ...makeEmission(1), documento: 'boletim' as const, quantidade_emissoes: 20 };
  const preview = makePreview();
  let calls = 0;
  const build = async () => ({ blob: new Blob([`PDF-${++calls}`], { type: 'application/pdf' }) });
  const old = await prepareHistoryVectorPreview(emission, preview, null, build);
  const current = { ...emission, quantidade_emissoes: 21, ultima_emissao_em: '2026-10-10T19:00:00Z' };
  const refreshed = await prepareHistoryVectorPreview(current, preview, old, build);
  assert.equal(calls, 2);
  assert.notEqual(refreshed.blob, old.blob);
  assert.equal(emission.quantidade_emissoes, 20);
  const download = await prepareHistoryVectorPreview(current, preview, refreshed, build);
  const print = await prepareHistoryVectorPreview(current, preview, refreshed, build);
  assert.equal(download.blob, refreshed.blob);
  assert.equal(print.blob, refreshed.blob);
  assert.equal(calls, 2, 'Prévia, download e impressão devem compartilhar o mesmo Blob atual');
});

test('modelo atualizado com mesma emissão invalida o Blob sem registrar segunda via', async () => {
  const emission = { ...makeEmission(1), documento: 'boletim' as const, quantidade_emissoes: 20 };
  const preview = { ...makePreview(), template: { v: 3, absoluteFields: [] } };
  const before = JSON.stringify(emission);
  const sources: unknown[] = [];
  const build = async (input: unknown[]) => {
    sources.push(input);
    return { blob: new Blob([JSON.stringify(input)], { type: 'application/pdf' }) };
  };
  const old = await prepareHistoryVectorPreview(emission, preview, null, build);
  const current = { ...preview, template: { v: 4, absoluteFields: [{ id: 'signature', type: 'image', value: 'synthetic-image' }] } };
  const refreshed = await prepareHistoryVectorPreview(emission, current, old, build);
  assert.notEqual(refreshed.blob, old.blob);
  assert.equal(sources.length, 2);
  assert.deepEqual(sources[1], [{ emission, preview: current }]);
  assert.equal(JSON.stringify(emission), before, 'Reler o modelo não pode mudar código, data ou contador');
  assert.equal((await prepareHistoryVectorPreview(emission, current, refreshed, build)).blob, refreshed.blob);
});

test('dados acadêmicos atualizados invalidam o PDF mesmo com o modelo e o código iguais', async () => {
  const emission = { ...makeEmission(1), documento: 'boletim' as const };
  const preview = makePreview();
  const build = async () => ({ blob: new Blob(['PDF'], { type: 'application/pdf' }) });
  const old = await prepareHistoryVectorPreview(emission, preview, null, build);
  const current = { ...preview, academicData: { ...preview.academicData!, mediaGeral: 9.25 } };
  const refreshed = await prepareHistoryVectorPreview(emission, current, old, build);
  assert.notEqual(refreshed.blob, old.blob);
});

test('declaração preserva o Blob da prévia ao registrar download e impressão da mesma emissão', async () => {
  const emission = { ...makeEmission(1), documento: 'declaracao_matricula' as const,
    quantidade_emissoes: 20, validacao_publica: true };
  const preview = makePreview();
  let calls = 0;
  const build = async () => ({ blob: new Blob([`PDF-${++calls}`], { type: 'application/pdf' }) });
  const original = await prepareHistoryVectorPreview(emission, preview, null, build);
  const prepared = { ...emission, quantidade_emissoes: 21,
    ultima_emissao_em: '2026-10-10T19:00:00Z', validade_ate: '2026-11-09T19:00:00Z',
    dados_emissao: { ...emission.dados_emissao, validationPublic: true } };
  const download = await prepareHistoryVectorPreview(prepared, { ...preview }, original, build);
  const print = await prepareHistoryVectorPreview({ ...prepared, quantidade_emissoes: 22 }, preview, download, build);
  assert.equal(download.blob, original.blob);
  assert.equal(print.blob, original.blob);
  assert.equal(calls, 1, 'Registrar a segunda via da declaração não deve reconstruir o PDF exibido');
  const other = await prepareHistoryVectorPreview({ ...prepared, codigo: 'SYNTHETIC-OTHER' }, preview, print, build);
  assert.notEqual(other.blob, original.blob);
  assert.equal(calls, 2);
});
