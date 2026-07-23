import assert from 'node:assert/strict';
import test from 'node:test';
import type { BanesePaymentRecord } from './banese-payment.types';
import {
  canPayBaneseRecord,
  getBaneseCarnetInstallments,
  getBanesePaymentActionLabel,
  getBanesePixPresentation,
  getBaneseStatusPresentation,
  hasRegisteredBaneseBoleto,
  isValidBanesePixPayload,
  maskBaneseDocument,
} from './banese-payment.utils';

const pixPayloadWithCrc = (value: string) => {
  let result = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      result = (result & 0x8000) !== 0 ? ((result << 1) ^ 0x1021) & 0xffff : (result << 1) & 0xffff;
    }
  }
  return `${value}${result.toString(16).toUpperCase().padStart(4, '0')}`;
};

const validPixPayload = pixPayloadWithCrc('00020126330014BR.GOV.BCB.PIX0111123456789015204000053039865802BR5908UNIVERSO6007JAPOATA6304');

const registeredRecord = (overrides: Partial<BanesePaymentRecord> = {}): BanesePaymentRecord => ({
  id: '00000000-0000-4000-8000-000000000001',
  matricula_id: '10000000-0000-4000-8000-000000000001',
  tipo_lancamento: 'PARCELA',
  parcela_numero: 1,
  data_vencimento: '2026-08-10',
  status: 'PENDENTE',
  gateway_provider: 'banese_card',
  gateway_environment: 'sandbox',
  gateway_payment_method: 'BOLETO',
  gateway_boleto_nosso_numero: '000000001',
  gateway_boleto_linha_digitavel: '1'.repeat(47),
  gateway_boleto_codigo_barras: '2'.repeat(44),
  gateway_boleto_convenio: '15528',
  gateway_boleto_agencia: '033',
  gateway_issuer_polo_id: '30000000-0000-4000-8000-000000000001',
  ...overrides,
});

test('reconhece somente boleto Banese registrado', () => {
  assert.equal(hasRegisteredBaneseBoleto(registeredRecord()), true);
  assert.equal(hasRegisteredBaneseBoleto(registeredRecord({ gateway_provider: 'asaas' })), false);
  assert.equal(hasRegisteredBaneseBoleto(registeredRecord({ gateway_boleto_linha_digitavel: '123' })), false);
});

test('mantém Pix indisponível no sandbox mesmo quando há payload persistido', () => {
  const pix = getBanesePixPresentation(registeredRecord({
    gateway_pix_payload: 'payload-que-nao-deve-aparecer',
    gateway_pix_encoded_image: `iVBORw0KGgo${'a'.repeat(128)}`,
  }));
  assert.equal(pix.state, 'sandbox-unavailable');
  assert.equal(pix.payload, null);
  assert.equal(pix.imageSource, null);
  assert.equal(getBanesePaymentActionLabel(registeredRecord()), 'Abrir boleto Banese');
  assert.equal(getBanesePaymentActionLabel(registeredRecord({ gateway_environment: 'production' })), 'Abrir boleto + Pix');
});

test('libera Pix somente em produção com dado oficial', () => {
  const pix = getBanesePixPresentation(registeredRecord({
    gateway_environment: 'production',
    gateway_pix_payload: validPixPayload,
    gateway_pix_encoded_image: `iVBORw0KGgo${'a'.repeat(128)}`,
  }));
  assert.equal(pix.state, 'available');
  assert.equal(pix.payload, validPixPayload);
  assert.match(pix.imageSource ?? '', /^data:image\/png;base64,/);
});

test('não libera Pix de produção com retorno incompleto', () => {
  const pix = getBanesePixPresentation(registeredRecord({
    gateway_environment: 'production',
    gateway_pix_payload: validPixPayload,
  }));
  assert.equal(pix.state, 'pending');
  assert.equal(pix.payload, null);
  assert.equal(pix.imageSource, null);
});

test('rejeita Pix copia e cola sem estrutura ou CRC EMV válido', () => {
  assert.equal(isValidBanesePixPayload('erro'), false);
  assert.equal(isValidBanesePixPayload(`${validPixPayload.slice(0, -1)}0`), false);
  assert.equal(isValidBanesePixPayload(validPixPayload), true);
});

test('matrícula permanece cobrança individual', () => {
  const matricula = registeredRecord({ tipo_lancamento: 'MATRICULA', categoria: 'MENSALIDADE' });
  const monthly = [1, 2, 3].map((number) => registeredRecord({
    id: `00000000-0000-4000-8000-00000000000${number + 1}`,
    parcela_numero: number,
  }));
  assert.deepEqual(getBaneseCarnetInstallments(matricula, [matricula, ...monthly]).map((item) => item.id), [matricula.id]);
});

test('só cria carnê com pelo menos três mensalidades bancárias reais', () => {
  const first = registeredRecord();
  const second = registeredRecord({
    id: '00000000-0000-4000-8000-000000000002',
    parcela_numero: 2,
    gateway_boleto_nosso_numero: '000000002',
    gateway_boleto_linha_digitavel: '2'.repeat(47),
    gateway_boleto_codigo_barras: '3'.repeat(44),
  });
  const third = registeredRecord({
    id: '00000000-0000-4000-8000-000000000003',
    parcela_numero: 3,
    gateway_boleto_nosso_numero: '000000003',
    gateway_boleto_linha_digitavel: '3'.repeat(47),
    gateway_boleto_codigo_barras: '4'.repeat(44),
  });
  assert.deepEqual(getBaneseCarnetInstallments(first, [first, second]).map((item) => item.id), [first.id]);
  assert.deepEqual(getBaneseCarnetInstallments(first, [third, first, second]).map((item) => item.id), [first.id, second.id, third.id]);
});

test('não cria carnê quando títulos bancários são repetidos', () => {
  const first = registeredRecord({ gateway_boleto_nosso_numero: '000000001' });
  const second = registeredRecord({ id: '00000000-0000-4000-8000-000000000002', parcela_numero: 2, gateway_boleto_nosso_numero: '000000001' });
  const third = registeredRecord({ id: '00000000-0000-4000-8000-000000000003', parcela_numero: 3, gateway_boleto_nosso_numero: '000000003' });
  assert.deepEqual(getBaneseCarnetInstallments(first, [first, second, third]).map((item) => item.id), [first.id]);
});

test('não mistura parcelas de outra matrícula, outro banco ou canceladas', () => {
  const first = registeredRecord();
  const validSecond = registeredRecord({ id: '00000000-0000-4000-8000-000000000002', parcela_numero: 2 });
  const anotherEnrollment = registeredRecord({
    id: '00000000-0000-4000-8000-000000000003',
    matricula_id: '20000000-0000-4000-8000-000000000001',
    parcela_numero: 3,
  });
  const asaas = registeredRecord({ id: '00000000-0000-4000-8000-000000000004', gateway_provider: 'asaas', parcela_numero: 3 });
  const canceled = registeredRecord({ id: '00000000-0000-4000-8000-000000000005', status: 'CANCELADO', parcela_numero: 3 });
  assert.deepEqual(
    getBaneseCarnetInstallments(first, [first, validSecond, anotherEnrollment, asaas, canceled]).map((item) => item.id),
    [first.id],
  );
});

test('título cancelado aberto por link direto permanece individual', () => {
  const selected = registeredRecord({ status: 'CANCELADO' });
  const related = [2, 3, 4].map((number) => registeredRecord({
    id: `00000000-0000-4000-8000-00000000000${number}`,
    parcela_numero: number,
    gateway_boleto_nosso_numero: `00000000${number}`,
    gateway_boleto_linha_digitavel: String(number).repeat(47),
    gateway_boleto_codigo_barras: String(number + 1).repeat(44),
  }));
  assert.deepEqual(
    getBaneseCarnetInstallments(selected, [selected, ...related]).map((item) => item.id),
    [selected.id],
  );
});

test('título pago não reaparece em carnê disponível para pagamento', () => {
  const selected = registeredRecord({ status: 'PAGO', gateway_status: 'PAID' });
  const related = [2, 3, 4].map((number) => registeredRecord({
    id: `00000000-0000-4000-8000-00000000000${number}`,
    parcela_numero: number,
    gateway_boleto_nosso_numero: `00000000${number}`,
    gateway_boleto_linha_digitavel: String(number).repeat(47),
    gateway_boleto_codigo_barras: String(number + 1).repeat(44),
  }));
  assert.deepEqual(
    getBaneseCarnetInstallments(selected, [selected, ...related]).map((item) => item.id),
    [selected.id],
  );
});

test('não mistura parcelas de sandbox e produção no mesmo carnê', () => {
  const first = registeredRecord();
  const second = registeredRecord({
    id: '00000000-0000-4000-8000-000000000002',
    parcela_numero: 2,
    gateway_boleto_nosso_numero: '000000002',
    gateway_boleto_linha_digitavel: '2'.repeat(47),
    gateway_boleto_codigo_barras: '3'.repeat(44),
  });
  const production = registeredRecord({
    id: '00000000-0000-4000-8000-000000000003',
    parcela_numero: 3,
    gateway_environment: 'production',
    gateway_boleto_nosso_numero: '000000003',
    gateway_boleto_linha_digitavel: '3'.repeat(47),
    gateway_boleto_codigo_barras: '4'.repeat(44),
  });
  assert.deepEqual(getBaneseCarnetInstallments(first, [first, second, production]).map((item) => item.id), [first.id]);
});

test('não mistura convênio, agência ou emissor no mesmo carnê', () => {
  const first = registeredRecord();
  const second = registeredRecord({
    id: '00000000-0000-4000-8000-000000000002',
    parcela_numero: 2,
    gateway_boleto_nosso_numero: '000000002',
    gateway_boleto_linha_digitavel: '2'.repeat(47),
    gateway_boleto_codigo_barras: '3'.repeat(44),
  });
  const anotherAgreement = registeredRecord({
    id: '00000000-0000-4000-8000-000000000003',
    parcela_numero: 3,
    gateway_boleto_nosso_numero: '000000003',
    gateway_boleto_linha_digitavel: '3'.repeat(47),
    gateway_boleto_codigo_barras: '4'.repeat(44),
    gateway_boleto_convenio: '99999',
  });
  assert.deepEqual(
    getBaneseCarnetInstallments(first, [first, second, anotherAgreement]).map((item) => item.id),
    [first.id],
  );
});

test('aceita grupo de carnê previamente validado pelo DTO protegido', () => {
  const rows = [1, 2, 3].map((number) => registeredRecord({
    id: `00000000-0000-4000-8000-00000000000${number}`,
    matricula_id: null,
    parcela_numero: number,
    gateway_group_marker: 'grp_abcdefghijklmnopqrstuvwxyz123456',
    gateway_group_kind: 'carnet',
    gateway_boleto_nosso_numero: null,
    gateway_boleto_convenio: null,
    gateway_boleto_agencia: null,
    gateway_issuer_polo_id: null,
    gateway_boleto_linha_digitavel: String(number).repeat(47),
    gateway_boleto_codigo_barras: String(number + 1).repeat(44),
  }));
  assert.deepEqual(
    getBaneseCarnetInstallments(rows[0], rows).map((item) => item.id),
    rows.map((item) => item.id),
  );
});

test('mascara documento sem depender de PDF ou URL externa do Banese', () => {
  assert.equal(maskBaneseDocument('12345678909'), '***.***.***-09');
  assert.equal(maskBaneseDocument('***.***.***-02'), '***.***.***-02');
});

test('apresenta cobrança devolvida como encerrada', () => {
  assert.deepEqual(getBaneseStatusPresentation(registeredRecord({ status: 'DEVOLVIDO' })), {
    label: 'Devolvido',
    detail: 'O pagamento foi devolvido e esta cobrança está encerrada.',
    tone: 'neutral',
  });
  assert.equal(canPayBaneseRecord(registeredRecord({ status: 'DEVOLVIDO' })), false);
});

test('estado terminal local prevalece sobre status bancário antigo pago', () => {
  assert.equal(getBaneseStatusPresentation(registeredRecord({
    status: 'DEVOLVIDO',
    gateway_status: 'PAID',
  })).label, 'Devolvido');
  assert.equal(getBaneseStatusPresentation(registeredRecord({
    status: 'CANCELADO',
    gateway_status: 'PAID',
  })).label, 'Cancelado');
});

test('permite pagar somente estados locais e remotos explicitamente seguros', () => {
  assert.equal(canPayBaneseRecord(registeredRecord({ gateway_status: 'PENDING' })), true);
  assert.equal(canPayBaneseRecord(registeredRecord({ status: 'VENCIDO', gateway_status: 'OPEN' })), true);
  assert.equal(canPayBaneseRecord(registeredRecord({ status: 'SUSPENSO', gateway_status: 'PENDING' })), false);
  assert.equal(canPayBaneseRecord(registeredRecord({ gateway_status: 'REJECTED' })), false);
  assert.equal(canPayBaneseRecord(registeredRecord({ gateway_status: 'REGISTERING' })), false);
  assert.equal(canPayBaneseRecord(registeredRecord({ gateway_status: 'EXPIRED' })), false);
});
