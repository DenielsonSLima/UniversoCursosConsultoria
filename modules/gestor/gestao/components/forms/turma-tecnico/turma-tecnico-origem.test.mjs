import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const load = async (name) => {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(name, import.meta.url))],
    bundle: true, platform: 'node', packages: 'external', format: 'cjs', write: false,
    plugins: [{ name: 'no-remote', setup(builder) {
      builder.onResolve({ filter: /lib\/supabase$/ }, () => ({ path: 'stub', namespace: 'qa' }));
      builder.onLoad({ filter: /.*/, namespace: 'qa' }, () => ({
        contents: 'export const supabase = {};', loader: 'js',
      }));
    } }],
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
  return module.exports;
};
const { selectTurmaTecnicoOrigem } = await load('./turma-tecnico-origem.ts');
const { createInitialTurmaTecnicoFormData } = await load('./turma-tecnico-form.constants.ts');
const { validateTurmaTecnicoStep } = await load('./turma-tecnico-form.validation.ts');
const { default: FinanceStep } = await load('./TurmaTecnicoFinanceiroStep.tsx');
const { requireMatriculaTecnicaCicloFinanceiroPolicy: parsePolicy } = await load(
  '../../../tecnicos/detalhes/components/financeiro/matricula-tecnica-ciclo-financeiro-policy.ts',
);
const initial = () => ({ ...createInitialTurmaTecnicoFormData('qa'), cursoId: 'qa',
  dataInicio: '2025-01-01', dataPrevisaoTermino: '2027-01-01', primeiroVencimentoPadrao: '2026-10-10' });
const identity = { nome: 'Turma QA', codigo: 'QA' };
test('sem cobranças descarta rascunho financeiro inválido sem apagar os dados acadêmicos', () => {
  const dirty = { ...initial(), valorParcela: 0, qtdParcelas: 0,
    valorRematricula: -10, descontoPontualidade: -1, jurosAtraso: 101,
    multaAtrasoPercentual: 101, diaVencimentoPadrao: 0, instrucaoBoletoCarne: '' };
  const closed = { ...dirty, ...selectTurmaTecnicoOrigem('IMPORTADA_CONCLUIDA') };
  assert.equal(closed.cursoId, dirty.cursoId);
  assert.equal(closed.dataInicio, dirty.dataInicio);
  assert.equal(closed.dataPrevisaoTermino, dirty.dataPrevisaoTermino);
  assert.equal(closed.cobrarMatricula, false);
  assert.equal(closed.valorMatricula, 0);
  assert.equal(closed.primeiroVencimentoPadrao, '');
  // The server validates reference values even when this mode cannot issue titles.
  const financialReferences = { ...closed,
    ...selectTurmaTecnicoOrigem('IMPORTADA_CICLO_1'), primeiroVencimentoPadrao: '2026-10-10' };
  assert.equal(validateTurmaTecnicoStep('FINANCEIRO', financialReferences, identity), null);
});
test('mudar para legado elimina matrícula e data histórica de cobrança; voltar restaura matrícula nova', () => {
  const external = { ...initial(), ...selectTurmaTecnicoOrigem('IMPORTADA_CICLO_1') };
  assert.equal(external.cobrarMatricula, false);
  assert.equal(external.valorMatricula, 0);
  assert.equal(external.primeiroVencimentoPadrao, '');
  assert.equal(external.criterioElegibilidadeCiclo, 'HISTORICO_EXTERNO');
  assert.equal(external.gerarCobrancasFuturas, false);
  assert.equal(external.permitirInscricoesOnline, false);
  const fresh = { ...external, ...selectTurmaTecnicoOrigem('NOVA') };
  assert.equal(fresh.cobrarMatricula, true);
  assert.equal(fresh.valorMatricula, 150);
  assert.equal(fresh.criterioElegibilidadeCiclo, 'PENULTIMA_SEM_ATRASO');
});
test('selecionar nova ou segundo ciclo preserva mensalidades e encargos personalizados', () => {
  const draft = { ...initial(), qtdParcelas: 8, valorParcela: 350,
    descontoPontualidade: 25, jurosAtraso: 1.5, multaAtrasoPercentual: 2.5 };
  for (const state of ['NOVA', 'IMPORTADA_CICLO_1']) {
    const result = { ...draft, ...selectTurmaTecnicoOrigem(state) };
    for (const key of ['qtdParcelas', 'valorParcela', 'descontoPontualidade', 'jurosAtraso', 'multaAtrasoPercentual']) {
      assert.equal(result[key], draft[key]);
    }
  }
});
test('legado exige início histórico e data explícita para segundo ciclo, nunca para sem cobrança', () => {
  const external = { ...initial(), ...selectTurmaTecnicoOrigem('IMPORTADA_CICLO_1') };
  assert.match(validateTurmaTecnicoStep('FINANCEIRO', external, identity), /primeiro vencimento/);
  assert.equal(validateTurmaTecnicoStep('FINANCEIRO', {
    ...external, primeiroVencimentoPadrao: '2026-10-10',
  }, identity), null);
  assert.match(validateTurmaTecnicoStep('TURMA', {
    ...external, dataInicio: '2999-01-01',
  }, identity), /anterior a hoje/);
  const closed = { ...initial(), ...selectTurmaTecnicoOrigem('IMPORTADA_CONCLUIDA') };
  assert.equal(validateTurmaTecnicoStep('FINANCEIRO', closed, identity), null);
  assert.match(validateTurmaTecnicoStep('FINANCEIRO', {
    ...closed, gerarCobrancasFuturas: true,
  }, identity), /automaticamente/);
});
test('render sem cobrança não oferece campos financeiros; nova preserva matrícula editável', () => {
  const closed = renderToStaticMarkup(React.createElement(FinanceStep, {
    formData: { ...initial(), ...selectTurmaTecnicoOrigem('IMPORTADA_CONCLUIDA') }, onChange() {},
  }));
  assert.match(closed, /Financeiro bloqueado/);
  assert.doesNotMatch(closed, /<input|<textarea|<select/);
  const fresh = renderToStaticMarkup(React.createElement(FinanceStep, {
    formData: initial(), onChange() {},
  }));
  assert.match(fresh, /Incluir matrícula no 1º ciclo/);
  assert.match(fresh, /type="checkbox"[^>]*checked/);
  const external = renderToStaticMarkup(React.createElement(FinanceStep, {
    formData: { ...initial(), ...selectTurmaTecnicoOrigem('IMPORTADA_CICLO_1') }, onChange() {},
  }));
  assert.match(external, /Matrícula no sistema anterior/);
  assert.match(external, /type="checkbox" disabled/);
  assert.match(external, /Primeiro vencimento do 2º ciclo/);
});
test('parser só aceita histórico externo no baseline 1', () => {
  const policy = { habilitado: true, modo: 'MANUAL', estadoInicial: 'IMPORTADA_CICLO_1',
    cicloBaseHistorico: 1, cicloMaximo: 2, criterioElegibilidade: 'HISTORICO_EXTERNO',
    revisao: 1, fingerprint: 'a'.repeat(64) };
  assert.equal(parsePolicy(policy).criterioElegibilidade, 'HISTORICO_EXTERNO');
  assert.throws(() => parsePolicy({ ...policy, estadoInicial: 'NOVA', cicloBaseHistorico: 0 }));
  assert.throws(() => parsePolicy({ ...policy, estadoInicial: 'IMPORTADA_CONCLUIDA', cicloBaseHistorico: 2 }));
});
