import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const professorId = '11111111-1111-4111-8111-111111111111';
const baseRow = { id: professorId, tipo: 'Professor', tipo_chave_pix: null, chave_pix: null };
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('./professor-pix.service.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent',
  plugins: [{ name: 'no-real-client', setup(builder) {
    builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'client', namespace: 'synthetic' }));
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({
      contents: 'export const supabase = { from() { throw new Error("Real client forbidden"); } };', loader: 'js',
    }));
  } }],
});
const module = { exports: {} };
new Function('module', 'exports', outputFiles[0].text)(module, module.exports);
const { saveProfessorPix } = module.exports;

const runtime = ({ row = baseRow, error = null, returnedRow } = {}) => {
  const calls = [];
  let payload;
  const client = {
    from(table) {
      calls.push(['from', table]);
      const query = {
        update(value) { payload = value; calls.push(['update', value]); return query; },
        select(value) { calls.push(['select', value]); return query; },
        eq(column, value) { calls.push(['eq', column, value]); return query; },
        async single() {
          return { data: returnedRow ?? (row && { ...row, ...payload }), error };
        },
      };
      return query;
    },
    auth: new Proxy({}, { get() { assert.fail('Pix não pode preparar ou alterar Auth.'); } }),
  };
  return { client, calls };
};

test('grava somente tipo/chave no Professor identificado, sem alteração de perfil ou Auth', async () => {
  const { client, calls } = runtime();
  assert.deepEqual(await saveProfessorPix(professorId, {
    tipoChavePix: 'EMAIL', chavePix: ' Docente@Example.Invalid ',
  }, client), { id: professorId, tipoChavePix: 'EMAIL', chavePix: 'docente@example.invalid' });
  assert.deepEqual(calls, [
    ['from', 'parceiros'],
    ['update', { tipo_chave_pix: 'EMAIL', chave_pix: 'docente@example.invalid' }],
    ['eq', 'id', professorId], ['eq', 'tipo', 'Professor'],
    ['select', 'id,tipo,chave_pix,tipo_chave_pix'],
  ]);
});

test('ambos opcionais podem ser limpos com NULL, sem campos adicionais', async () => {
  const { client, calls } = runtime({ row: { ...baseRow, tipo_chave_pix: 'EMAIL', chave_pix: 'old@example.invalid' } });
  assert.deepEqual(await saveProfessorPix(professorId, { tipoChavePix: '', chavePix: ' ' }, client),
    { id: professorId, tipoChavePix: '', chavePix: '' });
  assert.deepEqual(calls.find(call => call[0] === 'update')[1], { tipo_chave_pix: null, chave_pix: null });
});

test('preserva chave legada sem tipo, inclusive 11 dígitos, sem inferência ou UPDATE', async () => {
  const { client, calls } = runtime({ row: { ...baseRow, chave_pix: '52998224725' } });
  assert.deepEqual(await saveProfessorPix(professorId, { tipoChavePix: '', chavePix: '52998224725' }, client),
    { id: professorId, tipoChavePix: '', chavePix: '52998224725' });
  assert.ok(!calls.some(call => call[0] === 'update'));
});

test('exige tipo ao alterar legado ou tentar remover somente o tipo de uma chave conhecida', async () => {
  for (const row of [
    { ...baseRow, chave_pix: 'legacy' },
    { ...baseRow, tipo_chave_pix: 'EMAIL', chave_pix: 'new@example.invalid' },
  ]) {
    const { client, calls } = runtime({ row });
    await assert.rejects(saveProfessorPix(professorId, { tipoChavePix: '', chavePix: 'new@example.invalid' }, client), /Selecione o tipo/);
    assert.ok(!calls.some(call => call[0] === 'update'));
  }
});

test('CPF e telefone são normalizados por escolha explícita, sem confundir 11 dígitos', async () => {
  for (const [tipoChavePix, chavePix, expected] of [
    ['CPF', '529.982.247-25', '52998224725'],
    ['PHONE', '(79) 99999-9999', '+5579999999999'],
    ['EVP', '550E8400-E29B-41D4-A716-446655440000', '550e8400-e29b-41d4-a716-446655440000'],
  ]) {
    const { client } = runtime();
    assert.equal((await saveProfessorPix(professorId, { tipoChavePix, chavePix }, client)).chavePix, expected);
  }
});

test('recusa identidade, tipo ou chave inválidos antes de gravar', async () => {
  const { client, calls } = runtime();
  await assert.rejects(saveProfessorPix('outro-professor', { tipoChavePix: '', chavePix: '' }, client), /identificado/);
  await assert.rejects(saveProfessorPix(professorId, { tipoChavePix: 'PDF', chavePix: 'arquivo' }, client), /válidos/);
  await assert.rejects(saveProfessorPix(professorId, { tipoChavePix: 'CPF', chavePix: '123' }, client), /CPF válido/);
  await assert.rejects(saveProfessorPix(professorId, { tipoChavePix: 'EMAIL', chavePix: '' }, client), /Informe a chave/);
  assert.deepEqual(calls, []);
});

test('propaga rejeição RLS e rejeita resposta de outro parceiro ou divergente', async () => {
  const denied = new Error('RLS rejected');
  await assert.rejects(saveProfessorPix(professorId, { tipoChavePix: '', chavePix: '' }, runtime({ error: denied }).client), error => error === denied);
  for (const row of [null, { ...baseRow, tipo: 'PJ' }, { ...baseRow, id: '22222222-2222-4222-8222-222222222222' }]) {
    await assert.rejects(saveProfessorPix(professorId, { tipoChavePix: '', chavePix: '' }, runtime({ row }).client), /correspondem/);
  }
  await assert.rejects(saveProfessorPix(professorId, { tipoChavePix: 'EMAIL', chavePix: 'typed@example.invalid' },
    runtime({ returnedRow: baseRow }).client), /não foi confirmada/);
});
