import assert from 'node:assert/strict';
import test from 'node:test';
import { getFinancialWorkspaceErrorPresentation } from './financial-workspace-error.ts';

test('regra neutra rejeitada pelo servidor explica a causa sem afirmar ausência de receita', () => {
  const presentation = getFinancialWorkspaceErrorPresentation({
    code: '22023',
    message: 'Regra financeira técnica inválida.',
    details: 'diagnóstico interno que não deve ser exibido',
  });

  assert.equal(presentation.title, 'Regras financeiras pendentes');
  assert.match(presentation.message, /matrícula, mensalidades, vencimento e encargos/);
  assert.match(presentation.message, /não significa ausência de cobranças ou recebimentos/);
  assert.doesNotMatch(presentation.message, /diagnóstico interno|22023/);
});

test('rede, permissão e outros erros não são confundidos com falta de configuração', () => {
  for (const error of [
    null,
    new Error('Failed to fetch'),
    { code: '42501', message: 'Sem permissão para consultar esta turma.' },
    { code: '22023', message: 'Turma técnica não encontrada.' },
    { code: '22023', message: 'Primeiro vencimento inválido.' },
    { message: 'Regra financeira técnica inválida.' },
  ]) {
    const presentation = getFinancialWorkspaceErrorPresentation(error);
    assert.equal(presentation.title, 'Resumo financeiro não carregado');
    assert.match(presentation.message, /totais foram ocultados/);
    assert.doesNotMatch(presentation.message, /configuração financeira/);
  }
});
