import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FinanceiroCicloManualStatus, { getFinanceiroSituationLabel } from './FinanceiroCicloManualStatus';
import { requireMatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.parser';
import type { MatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.types';
import type { MatriculaTecnicaFinanceiroRow } from './matricula-tecnica-financeiro.types';

const proescState = (): MatriculaTecnicaCicloManual => ({
  habilitado: true,
  modo: 'MANUAL',
  cicloBaseHistorico: 1,
  cicloMaximo: 2,
  proximoCicloNumero: null,
  primeiroVencimentoSugerido: null,
  criterioElegibilidade: 'HISTORICO_EXTERNO',
  estado: 'PROTEGIDO_EXISTENTE',
  podeGerar: false,
  bloqueio: null,
  politica: { revisao: 1, fingerprint: 'synthetic-policy' },
  cicloGerado: {
    numero: 2,
    status: 'EXTERNAL_COVERAGE',
    origemEmissao: 'PROESC',
    abrangencia: 'CONTRATO_COMPLETO',
    quantidadeItens: 25,
    total: '6100.00',
    emitidosBanese: 0,
    pendentesEmissao: 0,
    emRevisao: 0,
  },
});

const renderStatus = (state: MatriculaTecnicaCicloManual) => renderToStaticMarkup(
  createElement(FinanceiroCicloManualStatus, {
    cicloManual: requireMatriculaTecnicaCicloManual(state),
    disabled: false,
    onGenerate: () => assert.fail('Não deve gerar durante renderização'),
    onResume: () => assert.fail('Não deve retomar durante renderização'),
  }),
);

test('contrato completo Proesc identifica origem sem gerar ou retomar títulos Banese', () => {
  const state = proescState();
  const html = renderStatus(state);
  assert.match(html, /2º ciclo já emitido no Proesc/);
  assert.match(html, /Contrato completo protegido contra novas cobranças/);
  assert.doesNotMatch(html, /<button|Retomar|Gerar e emitir|emissão incompleta|0\/25|25\/25/);
  assert.equal(
    getFinanceiroSituationLabel({ cicloManual: state } as MatriculaTecnicaFinanceiroRow),
    '2º ciclo já emitido no Proesc',
  );
});

test('marcação externa incompleta, parcial ou misturada com emissão Banese falha fechada', () => {
  for (const change of [
    { origemEmissao: undefined },
    { origemEmissao: 'OUTRO' },
    { abrangencia: undefined },
    { abrangencia: 'SUBCONJUNTO' },
    { status: 'EMITIDO_BANESE' },
    { emitidosBanese: 1 },
    { pendentesEmissao: 1 },
    { emRevisao: 1 },
  ]) {
    const state = proescState();
    assert.throws(() => requireMatriculaTecnicaCicloManual({
      ...state,
      cicloGerado: { ...state.cicloGerado, ...change },
    }), /estado manual de ciclo incompleto/i);
  }
  for (const estado of ['ELEGIVEL', 'JA_GERADO', 'CICLOS_CONCLUIDOS']) {
    assert.throws(() => requireMatriculaTecnicaCicloManual({ ...proescState(), estado }),
      /estado manual de ciclo incompleto/i);
  }
});

const baneseState = (): MatriculaTecnicaCicloManual => {
  const state = proescState();
  delete state.cicloGerado!.origemEmissao;
  delete state.cicloGerado!.abrangencia;
  state.cicloGerado!.status = 'EMITIDO_BANESE';
  state.cicloGerado!.emitidosBanese = 25;
  return state;
};

test('ciclo Banese protegido preserva a apresentação existente', () => {
  const state = baneseState();
  const html = renderStatus(state);
  assert.match(html, /2º ciclo já gerado e emitido/);
  assert.doesNotMatch(html, /Proesc|<button/);
  assert.equal(
    getFinanceiroSituationLabel({ cicloManual: state } as MatriculaTecnicaFinanceiroRow),
    '2º ciclo gerado e emitido',
  );
});

test('emissão Banese incompleta conserva contagem e botão de retomada', () => {
  const state = baneseState();
  state.estado = 'JA_GERADO';
  state.cicloGerado!.emitidosBanese = 24;
  state.cicloGerado!.pendentesEmissao = 1;
  const html = renderStatus(state);
  assert.match(html, /24\/25 emitidos/);
  assert.match(html, /<button/);
  assert.match(html, /Retomar emissão/);
  assert.doesNotMatch(html, /Proesc/);
});

test('matrícula elegível sem cobertura externa conserva geração manual do segundo ciclo', () => {
  const state = baneseState();
  state.estado = 'ELEGIVEL';
  state.podeGerar = true;
  state.proximoCicloNumero = 2;
  state.cicloGerado = null;
  const html = renderStatus(state);
  assert.match(html, /Gerar e emitir 2º ciclo/);
  assert.match(html, /<button/);
  assert.doesNotMatch(html, /Proesc|Retomar emissão/);
});
