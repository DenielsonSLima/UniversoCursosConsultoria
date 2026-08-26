import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildAlunoEadCheckoutSelection,
  isAlunoEadBolePixFallback,
  isInlineAlunoBolePix,
  matchesAlunoEadCheckoutReceivable,
} from './alunoEadPaymentOptions';

test('Pix visual usa o checkout BOLETO e preserva presentation PIX', () => {
  const selection = buildAlunoEadCheckoutSelection({
    id: 'PIX',
    label: 'Pix',
    checkoutMethod: 'BOLETO',
    presentation: 'PIX',
  });

  assert.deepEqual(selection, {
    method: 'BOLETO',
    installments: 1,
    presentation: 'PIX',
  });
  assert.equal(isInlineAlunoBolePix(
    {
      id: 'PIX',
      label: 'Pix',
      checkoutMethod: 'BOLETO',
      presentation: 'PIX',
    },
    'BOLETO',
    'PIX',
    { payload: '000201...' },
  ), true);
});

test('Pix sem payload oficial rebaixa para o boleto autenticado', () => {
  const option = {
    id: 'PIX' as const,
    label: 'Pix',
    checkoutMethod: 'BOLETO' as const,
    presentation: 'PIX' as const,
  };

  assert.equal(isInlineAlunoBolePix(option, 'BOLETO', 'PIX', null), false);
  assert.equal(
    isAlunoEadBolePixFallback(option, 'BOLETO', 'BOLETO', null),
    true,
  );
  assert.equal(
    isAlunoEadBolePixFallback(option, 'BOLETO', 'PIX', null),
    true,
  );
});

test('Boleto visual usa o mesmo titulo sem abrir apresentacao Pix', () => {
  const option = {
    id: 'BOLETO' as const,
    label: 'Boleto com Pix',
    checkoutMethod: 'BOLETO' as const,
    presentation: 'BOLETO' as const,
  };

  assert.deepEqual(buildAlunoEadCheckoutSelection(option), {
    method: 'BOLETO',
    installments: 1,
    presentation: 'BOLETO',
  });
  assert.equal(isInlineAlunoBolePix(option, 'BOLETO', 'BOLETO'), false);
});

test('Cartao so e enviado quando o backend o devolve como opcao canonica', () => {
  assert.deepEqual(buildAlunoEadCheckoutSelection({
    id: 'CREDIT_CARD',
    label: 'Cartao',
    checkoutMethod: 'CREDIT_CARD',
  }), {
    method: 'CREDIT_CARD',
    installments: 1,
  });
});

test('checkout aceita somente o mesmo titulo escolhido pelo aluno', () => {
  const selectedId = '11111111-1111-4111-8111-111111111111';
  assert.equal(matchesAlunoEadCheckoutReceivable(selectedId, selectedId), true);
  assert.equal(
    matchesAlunoEadCheckoutReceivable(
      selectedId,
      '22222222-2222-4222-8222-222222222222',
    ),
    false,
  );
  assert.equal(matchesAlunoEadCheckoutReceivable(selectedId, null), false);
});

test('modal financeiro renderiza somente as opcoes recebidas do backend', () => {
  const modalSource = readFileSync(
    'modules/aluno/financeiro/AlunoEadPaymentChoiceModal.tsx',
    'utf8',
  );
  const hookSource = readFileSync(
    'modules/aluno/financeiro/useAlunoEadPayment.ts',
    'utf8',
  );
  const paymentPanelSource = readFileSync(
    'modules/ead/components/EadPaymentModal.tsx',
    'utf8',
  );
  const checkoutServiceSource = readFileSync(
    'modules/asaas/asaas.service.ts',
    'utf8',
  );

  assert.match(modalSource, /options\.map\(/);
  assert.doesNotMatch(modalSource, /const paymentMethods\s*=/);
  assert.match(hookSource, /getStudentEadPaymentOptions/);
  assert.match(hookSource, /buildAlunoEadCheckoutSelection/);
  assert.match(hookSource, /paymentSelection,\s*selectedPayment\.id/);
  assert.match(hookSource, /isAlunoEadBolePixFallback/);
  assert.match(hookSource, /presentation:\s*'BOLETO'/);
  assert.match(checkoutServiceSource, /presentation: paymentSelection\?\.presentation,\s*receivableId/);
  assert.match(paymentPanelSource, /const showBoletoAction = isBoleto/);
  assert.match(paymentPanelSource, /wantsInlineBolePix[^;]*hasPixQrCode/);
  assert.match(paymentPanelSource, /PIX_UNAVAILABLE_USE_BOLETO/);
  assert.match(paymentPanelSource, /Este mesmo título também pode ser pago pelo boleto oficial/);
});
