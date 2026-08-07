import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTurmaEnrollmentService,
  type MatricularAlunoComCobrancaInput,
} from './turma-enrollment.service';

const baseInput: MatricularAlunoComCobrancaInput = {
  turmaId: 'turma-1',
  alunoId: 'aluno-1',
  gerar_cobranca_inicial: true,
  gerar_cobranca_futura: true,
  sincronizar_asaas: false,
  paymentMethod: null,
  valorMatricula: 100,
  valorParcela: 200,
  valorRematricula: 50,
  descontoPontualidade: 10,
  jurosAtraso: 1,
  multaAtraso: 2,
  dataVencimentoMatricula: '2026-08-10',
  diaVencimento: 10,
};

const createDependencies = (events: string[]) => ({
  preflightEnrollmentCharge: async () => {
    events.push('preflight');
    return {} as never;
  },
  matricularAlunoComFinanceiro: async () => {
    events.push('matricula');
    return { id: 'matricula-1' } as never;
  },
  syncEnrollment: async () => {
    events.push('sync');
    return {
      receivable: { gateway_payment_id: 'gateway-1' },
      skipped: false,
    } as never;
  },
});

test('gera matrícula local sem exigir método nem chamar o gateway quando a sincronização está desligada', async () => {
  const events: string[] = [];
  const service = createTurmaEnrollmentService(createDependencies(events));

  const result = await service.matricularAlunoComCobranca(baseInput);

  assert.deepEqual(events, ['matricula']);
  assert.equal(result.asaasSynced, false);
  assert.equal(result.asaasSkipped, true);
  assert.match(result.asaasSkipReason || '', /cobrança inicial.*localmente/i);
});

test('com sincronização ativa valida o método antes de criar a matrícula', async () => {
  const events: string[] = [];
  const service = createTurmaEnrollmentService(createDependencies(events));

  await assert.rejects(
    service.matricularAlunoComCobranca({
      ...baseInput,
      sincronizar_asaas: true,
      paymentMethod: null,
    }),
    /Escolha Pix, boleto ou cartão/i,
  );

  assert.deepEqual(events, []);
});

test('com sincronização ativa executa preflight, matrícula e sync nessa ordem', async () => {
  const events: string[] = [];
  const service = createTurmaEnrollmentService(createDependencies(events));

  const result = await service.matricularAlunoComCobranca({
    ...baseInput,
    sincronizar_asaas: true,
    paymentMethod: 'BOLETO',
  });

  assert.deepEqual(events, ['preflight', 'matricula', 'sync']);
  assert.equal(result.asaasSynced, true);
  assert.equal(result.asaasSkipped, false);
});

test('sem cobrança inicial cria apenas a matrícula e registra o gateway como dispensado', async () => {
  const events: string[] = [];
  const service = createTurmaEnrollmentService(createDependencies(events));

  const result = await service.matricularAlunoComCobranca({
    ...baseInput,
    gerar_cobranca_inicial: false,
    sincronizar_asaas: true,
  });

  assert.deepEqual(events, ['matricula']);
  assert.equal(result.asaasSynced, false);
  assert.equal(result.asaasSkipped, true);
  assert.match(result.asaasSkipReason || '', /não exige cobrança inicial/i);
});
