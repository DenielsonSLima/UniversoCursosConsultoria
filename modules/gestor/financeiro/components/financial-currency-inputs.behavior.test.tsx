import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { OtherCreditPlanFinancialForm } from '../outros-creditos/OtherCreditPlanFinancialForm';
import { OtherCreditPlanTermsFields } from '../outros-creditos/OtherCreditPlanTermsFields';
import { initialOtherCreditPlanForm, initialOtherCreditPlanTerms, toOtherCreditPlanInput } from '../outros-creditos/other-credit-plan.model';
import RenegociacaoScheduleEditor from '../renegociacoes/components/RenegociacaoScheduleEditor';
import { parseRenegociacaoScheduleAmount } from '../renegociacoes/hooks/useRenegociacaoScheduleDraft';

// These presentation components have no hooks: walk their real input handlers.
function inputs(node: React.ReactNode): React.ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(inputs);
  if (!React.isValidElement<Record<string, any>>(node)) return [];
  if (typeof node.type === 'function') return inputs((node.type as Function)(node.props));
  return [...(node.type === 'input' ? [node] : []), ...inputs(node.props.children)];
}

const change = (input: React.ReactElement<Record<string, any>>, value: string) =>
  input.props.onChange({ target: { value } });

test('carnê coleta dígitos em centavos e envia reais sem alterar quantidade', () => {
  let form = initialOtherCreditPlanForm();
  const render = () => inputs(<OtherCreditPlanFinancialForm form={form} disabled={false}
    onChange={patch => { form = { ...form, ...patch }; }} />);
  for (const digit of '123456') {
    const field = render().find(input => input.props.placeholder === '0,00')!;
    change(field, `${form.value}${digit}`);
  }
  assert.equal(form.value, '1.234,56');
  assert.equal(toOtherCreditPlanInput(form).valorParcela, 1234.56);
  assert.equal(form.quantity, '1');
  change(render().find(input => input.props.placeholder === '0,00')!, '1.234,56,');
  assert.equal(form.value, '1.234,56');
});

test('desconto fixo usa centavos e percentual preserva digitação livre', () => {
  let terms = initialOtherCreditPlanTerms();
  const render = () => inputs(<OtherCreditPlanTermsFields label="parcelas" terms={terms}
    onChange={patch => { terms = { ...terms, ...patch }; }} />);
  change(render().find(input => input.props['aria-label'] === 'Desconto de parcelas (R$)')!, '1');
  assert.equal(terms.discount, '0,01');
  terms = { ...terms, discountType: 'PERCENTUAL', discount: '' };
  change(render().find(input => input.props['aria-label'] === 'Desconto de parcelas (%)')!, '12,5');
  assert.equal(terms.discount, '12,5');
  change(render().find(input => input.props['aria-label'] === 'Juros ao mês de parcelas (%)')!, '1,5');
  assert.equal(terms.interest, '1,5');
});

test('parcela renegociada aceita milhar da máscara e converte valor canônico em centavos', () => {
  let amount = '';
  const render = () => inputs(<RenegociacaoScheduleEditor rows={[{ sequence: 1, dueDate: '2026-11-07', amount }]}
    entries={[]} financedCents={123456} changed={true} valid={true} disabled={false} pending={false}
    onChange={(_sequence, field, value) => { if (field === 'amount') amount = value; }}
    onValidate={() => {}} onReset={() => {}} />);
  change(render().find(input => input.props['aria-label'] === 'Valor da parcela 1')!, '123456');
  assert.equal(amount, '1.234,56');
  assert.equal(parseRenegociacaoScheduleAmount(amount), 123456);
  assert.equal(parseRenegociacaoScheduleAmount('1234,56'), 123456);
  assert.equal(parseRenegociacaoScheduleAmount('0,00'), null);
  assert.equal(parseRenegociacaoScheduleAmount('1,2,3'), null);
});
