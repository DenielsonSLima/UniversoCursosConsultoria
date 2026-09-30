import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
  calculateManualSettlementBreakdown,
  calculateManualSettlementTotal,
  currencyInputToCents,
  formatCurrencyInput,
  sanitizeCurrencyInput,
} from './manual-settlement-calculation.ts';

const read = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

test('desconto reduz automaticamente o valor final recebido', () => {
  assert.equal(
    calculateManualSettlementTotal(279.90, {
      interestValue: '',
      penaltyValue: '',
      discountValue: '30,00',
      additionValue: '',
    }),
    249.90,
  );
});

test('juros, multa e outros acréscimos aumentam o valor final recebido', () => {
  assert.equal(
    calculateManualSettlementTotal(279.90, {
      interestValue: '10,10',
      penaltyValue: '5,50',
      discountValue: '',
      additionValue: '4,40',
    }),
    299.90,
  );
});

test('parser monetário usa centavos e rejeita formatos divergentes do backend', () => {
  assert.equal(currencyInputToCents(''), 0);
  assert.equal(currencyInputToCents('1.234,56'), 123_456);
  assert.equal(currencyInputToCents('1,234.56'), 123_456);

  for (const malformed of [
    '1,2,3',
    '12,34.56',
    '1,',
    '1234.567',
    '0.123',
    '-1,00',
  ]) {
    assert.equal(
      currencyInputToCents(malformed),
      null,
      `${malformed} deve ser bloqueado antes do envio ao backend.`,
    );
  }
});

test('digitação monetária desloca centavos e formata o real brasileiro em tempo real', () => {
  assert.equal(sanitizeCurrencyInput('1', ''), '0,01');
  assert.equal(sanitizeCurrencyInput('0,019', '0,01'), '0,19');
  assert.equal(sanitizeCurrencyInput('0,190', '0,19'), '1,90');
  assert.equal(sanitizeCurrencyInput('1,900', '1,90'), '19,00');
  assert.equal(sanitizeCurrencyInput('1,9', '1,90'), '0,19');
  assert.equal(sanitizeCurrencyInput('0,0', '0,01'), '');
  assert.equal(sanitizeCurrencyInput('R$ 1.234,56', ''), '1.234,56');
  assert.equal(sanitizeCurrencyInput('0,01a', '0,01'), '0,01');
  assert.equal(sanitizeCurrencyInput('90000000000000001', '1,00'), '1,00');
  assert.equal(sanitizeCurrencyInput('', '19,00'), '');
});

test('campo monetário normaliza automaticamente para real brasileiro com duas casas', () => {
  assert.equal(formatCurrencyInput(''), '0,00');
  assert.equal(formatCurrencyInput('19'), '19,00');
  assert.equal(formatCurrencyInput('19,9'), '19,90');
  assert.equal(formatCurrencyInput('1234,56'), '1.234,56');
  assert.equal(formatCurrencyInput('1,234.56'), '1.234,56');
  assert.equal(formatCurrencyInput('1,2,3'), '1,2,3');
});

test('breakdown identifica cada ajuste inválido e calcula o ajuste líquido em centavos', () => {
  const validValues = {
    interestValue: '10,10',
    penaltyValue: '5,50',
    discountValue: '30,00',
    additionValue: '4,40',
  };
  const valid = calculateManualSettlementBreakdown(279.90, validValues);

  assert.deepEqual(valid.inputValidity, {
    interestValue: true,
    penaltyValue: true,
    discountValue: true,
    additionValue: true,
  });
  assert.equal(valid.adjustmentCents, -1_000);
  assert.equal(valid.receivedCents, 26_990);

  for (const field of Object.keys(validValues) as Array<keyof typeof validValues>) {
    const invalid = calculateManualSettlementBreakdown(279.90, {
      ...validValues,
      [field]: '1,2,3',
    });
    assert.equal(invalid.inputValidity[field], false, `${field} deve ser marcado como inválido.`);
    assert.equal(invalid.inputsValid, false);
    for (const otherField of Object.keys(validValues) as Array<keyof typeof validValues>) {
      if (otherField !== field) assert.equal(invalid.inputValidity[otherField], true);
    }
  }
});

test('desconto maior que a cobrança limita o valor final a zero', () => {
  assert.equal(
    calculateManualSettlementTotal(279.90, {
      interestValue: '',
      penaltyValue: '',
      discountValue: '999,99',
      additionValue: '',
    }),
    0,
  );
});

test('total zerado é tratado como composição inválida e bloqueia o envio', async () => {
  const form = await read('./useManualSettlementForm.ts');
  const breakdown = calculateManualSettlementBreakdown(279.90, {
    interestValue: '',
    penaltyValue: '',
    discountValue: '279,90',
    additionValue: '',
  });

  assert.equal(breakdown.receivedCents, 0);
  assert.equal(breakdown.discountIsValid, false);
  assert.match(
    form,
    /canSubmit:[\s\S]*?amounts\.received\s*>\s*0[\s\S]*?!compositionError/,
    'O frontend deve bloquear a composição que o backend rejeita.',
  );
  assert.match(
    form,
    /!amounts\.inputsValid/,
    'O hook deve reconhecer entrada monetária inválida sem quebrar o modal.',
  );
});

test('payload preserva a composição financeira e uma idempotência estável', async () => {
  const form = await read('./useManualSettlementForm.ts');

  const payloadSource = form.match(
    /const payload\s*=\s*useMemo<ManualSettlementPayload>\(\(\)\s*=>\s*\(\{([\s\S]*?)\}\),\s*\[/,
  )?.[1];
  assert.ok(payloadSource, 'O payload memoizado deve continuar explícito e auditável.');

  assert.match(
    form,
    /const \[idempotencyKey\]\s*=\s*useState\(generateSafeUuid\)/,
    'A chave deve nascer uma vez por abertura do formulário, sem setter que a regenere.',
  );

  for (const [payloadField, formValue] of [
    ['idempotencyKey', 'idempotencyKey'],
    ['contaBancariaId', 'accountId'],
    ['valorPago', 'receivedValue'],
    ['valorJuros', 'interestValue'],
    ['valorMulta', 'penaltyValue'],
    ['valorDesconto', 'discountValue'],
    ['valorAcrescimo', 'additionValue'],
    ['dataPagamento', 'paymentDate'],
    ['formaPagamento', 'paymentMethod'],
  ]) {
    assert.match(
      payloadSource,
      payloadField === formValue
        ? new RegExp(`\\b${payloadField}\\s*(?:,|:\\s*${formValue}\\b)`)
        : new RegExp(`\\b${payloadField}:\\s*${formValue}\\b`),
      `O payload deve preservar ${payloadField}.`,
    );
  }

  assert.match(
    form,
    /calculateManualSettlementBreakdown\(principalValue,\s*\{[\s\S]*?interestValue[\s\S]*?penaltyValue[\s\S]*?discountValue[\s\S]*?additionValue[\s\S]*?\}\)/,
    'O valor pago deve vir da mesma composição canônica exercitada nos testes numéricos.',
  );
});

test('modal usa seletores próprios e explicita cobrança e valor final', async () => {
  const entries = await readdir(new URL('.', import.meta.url), { withFileTypes: true });
  const componentFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.tsx'))
    .map((entry) => entry.name);
  const components = await Promise.all(componentFiles.map((file) => read(`./${file}`)));
  const modal = await read('./ManualSettlementModal.tsx');
  const allComponents = components.join('\n');

  assert.doesNotMatch(
    allComponents,
    /<select\b/i,
    'Os campos do modal não podem delegar a lista ao navegador.',
  );
  assert.match(allComponents, /role="combobox"/);
  assert.match(allComponents, /role="listbox"/);
  assert.match(allComponents, /role="option"/);
  assert.match(modal, /Valor da cobrança/i);
  assert.match(modal, /Valor final recebido/i);
  assert.match(
    modal,
    /onBlur=\{\(event\) => onChange\(formatCurrencyInput\(event\.currentTarget\.value\)\)\}/,
    'Os ajustes devem assumir o padrão brasileiro com duas casas ao sair do campo.',
  );
});

test('combobox fecha e recusa seleção quando o modal fica desabilitado', async () => {
  const combobox = await read('./ManualSettlementCombobox.tsx');

  assert.match(
    combobox,
    /useEffect\(\(\)\s*=>\s*\{[\s\S]*?if\s*\(!disabled\)\s*return[\s\S]*?setOpen\(false\)[\s\S]*?\},\s*\[disabled\]\)/,
    'O portal aberto deve fechar assim que a baixa entrar em processamento.',
  );
  assert.match(
    combobox,
    /const openPicker[\s\S]*?if\s*\(disabled\)\s*return/,
  );
  assert.match(
    combobox,
    /const selectOption[\s\S]*?if\s*\(disabled\)\s*return/,
    'Uma opção ainda visível não pode alterar o formulário desabilitado.',
  );
});

test('erros monetários são associados ao campo exato para tecnologia assistiva', async () => {
  const modal = await read('./ManualSettlementModal.tsx');

  assert.match(modal, /aria-invalid=\{invalid\}/);
  assert.match(modal, /aria-describedby=\{/);
  for (const [label, validityField] of [
    ['Juros recebidos', 'interestValue'],
    ['Multa recebida', 'penaltyValue'],
    ['Desconto concedido', 'discountValue'],
    ['Outros acréscimos', 'additionValue'],
  ]) {
    assert.match(
      modal,
      new RegExp(`<CurrencyField[^>]*label="${label}"[^>]*invalid=\\{!form\\.amounts\\.inputValidity\\.${validityField}\\}[^>]*/>`),
      `${label} deve receber somente a sua própria validade.`,
    );
  }
});

test('comboboxes obrigatórios têm marca visual e semântica', async () => {
  const combobox = await read('./ManualSettlementCombobox.tsx');

  assert.match(combobox, /aria-required="true"/);
  assert.match(
    combobox,
    /aria-hidden="true"[\s\S]*?\*/,
    'O rótulo deve mostrar o asterisco obrigatório sem duplicá-lo para leitores de tela.',
  );
});
