import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
async function load(file) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs' });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const { toCamel, toSnake } = await load('../../../utils/parceiro-mappers.ts');
const { normalizeAlunoFormData } = await load('./parceiro-aluno-dados.utils.ts');
const { prepareAlunoSaveData, updateAlunoDraft } = await load('./parceiro-aluno-edicao.ts');

const formFor = (orgao) => normalizeAlunoFormData(toCamel({
  tipo: 'Aluno', orgao_emissor: orgao, rg_uf_emissao: null, telefone: '79999990000',
}));
const save = (draft, baseline) => toSnake(prepareAlunoSaveData(normalizeAlunoFormData(draft), baseline));

test('editar telefone conserva órgão legado literal da leitura até o payload', () => {
  for (const original of ['  emissor desconhecido/se  ', 'ssp/se', 'outro', 'SSP/SE']) {
    const baseline = formFor(original);
    const draft = updateAlunoDraft(baseline, 'telefone', '79999991111');
    const payload = save(draft, baseline);
    assert.equal(payload.orgao_emissor, original);
    assert.equal(payload.rg_uf_emissao, null);
    assert.equal(payload.telefone, '(79) 99999-1111');
  }
});

test('seleção explícita substitui legado pela sigla canônica e permite limpar', () => {
  const baseline = formFor('  emissor desconhecido/se  ');
  const selected = updateAlunoDraft(baseline, 'orgaoEmissor', 'SSP');
  assert.equal(save(selected, baseline).orgao_emissor, 'SSP');
  const cleared = updateAlunoDraft(baseline, 'orgaoEmissor', '');
  assert.equal(save(cleared, baseline).orgao_emissor, null);
});

test('cadastro sem órgão permanece opcional', () => {
  const baseline = formFor(null);
  assert.equal(save(baseline, baseline).orgao_emissor, null);
});
