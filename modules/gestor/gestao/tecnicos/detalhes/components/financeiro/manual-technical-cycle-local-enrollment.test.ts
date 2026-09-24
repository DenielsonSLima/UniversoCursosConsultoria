import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  isIssuedCycleReceivable, isProvenLocalEnrollment, readCycleQuantities,
} from './matricula-tecnica-ciclo-manual-destination';
import { requireCicloFinanceiroTecnicoManualPreview } from './matricula-tecnica-ciclo-manual-preview.parser';

const instruction = 'Condições revisadas da cobrança';
const item = (number: number) => {
  const date = new Date(Date.UTC(2027, number, 20)).toISOString().slice(0, 10);
  const description = number === 0 ? 'Matrícula' : `Mensalidade ${number}`;
  return {
    chave: `item-${number}`, tipo: number === 0 ? 'MATRICULA' : 'PARCELA', numero: number,
    descricao: description, valor: '100.00', vencimento: date,
    destinoCobranca: number === 0 ? 'LOCAL' : 'BANESE',
    detalhesBoleto: {
      valorNominal: '100.00', valorEmDia: '100.00', desconto: null, multa: null, juros: null,
      instrucaoBoleto: instruction, mensagensBoleto: [description, 'Turma de teste', instruction],
    },
  };
};
const preview = () => ({
  cicloNumero: 1, sourceVencimento: 'TURMA', dataOrigem: '2027-01-20', primeiroVencimento: '2027-01-20',
  quantidadeItens: 13, quantidadeBancaria: 12, quantidadeLocal: 1, modoMatricula: 'REGISTRO_SEM_BOLETO',
  total: '1300.00', itens: Array.from({ length: 13 }, (_, number) => item(number)),
  termos: {
    descontoPontualidade: '0', jurosAtrasoPercentual: '0', multaAtrasoPercentual: '0', instrucaoBoleto: instruction,
    aplicacao: {
      matricula: { desconto: false, multaJuros: false }, mensalidade: { desconto: false, multaJuros: false },
      rematricula: { desconto: false, multaJuros: false },
    },
  },
  regraEfetivaFingerprint: 'regra', politicaFingerprint: 'politica', cronogramaFingerprint: 'cronograma',
});
const local = () => ({
  ...item(0), id: 'matricula-local-id', status: 'PENDENTE',
  localSemBoletoComprovado: true, emissaoBanese: 'NAO_APLICAVEL',
});

test('prévia local mantém 13 registros, 12 boletos e datas canônicas', () => {
  const result = requireCicloFinanceiroTecnicoManualPreview(preview());
  assert.equal(result.quantidadeItens, 13);
  assert.equal(result.quantidadeBancaria, 12);
  assert.equal(result.itens[0].destinoCobranca, 'LOCAL');
  assert.equal(result.itens[1].vencimento, '2027-02-20');
  assert.equal(result.itens[12].vencimento, '2028-01-20');
  const omitted = preview();
  Object.assign(omitted, {
    modoMatricula: 'OMITIR', quantidadeItens: 12, quantidadeLocal: 0,
    matriculaSemBoleto: omitted.itens[0], itens: omitted.itens.slice(1), primeiroVencimento: '2027-02-20',
  });
  const parsedOmitted = requireCicloFinanceiroTecnicoManualPreview(omitted);
  assert.deepEqual(parsedOmitted.itens.map((entry) => entry.vencimento), result.itens.slice(1).map((entry) => entry.vencimento));
});

test('destino local exige escolha coerente, matrícula e contadores completos', () => {
  for (const patch of [
    { modoMatricula: 'BOLETO' }, { modoMatricula: undefined }, { quantidadeBancaria: 13 },
    { quantidadeLocal: undefined }, { cicloNumero: 2 },
  ]) assert.throws(() => requireCicloFinanceiroTecnicoManualPreview({ ...preview(), ...patch }), /incompleta/);
  const invalid = preview();
  invalid.itens[1].destinoCobranca = 'LOCAL';
  assert.throws(() => requireCicloFinanceiroTecnicoManualPreview(invalid), /incompleta/);
  assert.deepEqual(readCycleQuantities({ quantidadeItens: 13 }), { bank: 13, local: 0, total: 13 });
  assert.equal(readCycleQuantities({ quantidadeItens: 13, quantidadeBancaria: 12 }), null);
});

test('matrícula LOCAL paga só representa baixa local; boleto pago exige prova bancária distinta', () => {
  for (const status of ['PENDENTE', 'VENCIDO', 'PAGO']) {
    assert.equal(isIssuedCycleReceivable({ ...local(), status }, 1), true);
  }
  for (const patch of [
    { localSemBoletoComprovado: false }, { localSemBoletoComprovado: 'true' },
    { emissaoBanese: 'EMITIDO' }, { emissaoHistoricaComprovada: true }, { tipo: 'PARCELA' }, { numero: 1 }, { status: 'CANCELADO' },
  ]) assert.equal(isIssuedCycleReceivable({ ...local(), ...patch }, 1), false);
  assert.equal(isIssuedCycleReceivable(local(), 2), false);
  const bank = { ...item(1), status: 'PAGO', emissaoBanese: 'EMITIDO' };
  assert.equal(isIssuedCycleReceivable(bank, 1), false);
  assert.equal(isIssuedCycleReceivable({ ...bank, emissaoHistoricaComprovada: true }, 1), true);
  for (const patch of [{ valor: '0.00' }, { tipo: 'PARCELA' }, { numero: 1 },
    { emissaoBanese: 'EMITIDO' }, { emissaoHistoricaComprovada: true }]) {
    assert.equal(isProvenLocalEnrollment({ ...local(), ...patch }), false);
  }
});

test('baixa usa serviço canônico, trava síncrona, permissão e ação persistente sem gerar ciclo', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const hook = read('./hooks/useCicloManualEnrollmentSettlement.ts');
  const table = read('./FinanceiroAlunosTable.tsx');
  const options = read('./FinanceiroCicloManualEnrollmentOptions.tsx');
  const list = read('./FinanceiroAlunosList.tsx');
  assert.match(hook, /financeiroService\.markReceivablePaid\(receivableId, payload\)/);
  assert.match(hook, /if \(!canSettle\) throw new Error/);
  assert.match(hook, /inFlight\.current = true;\s*mutation\.mutate/);
  assert.match(hook, /account\.ativo !== false[\s\S]*?isContaDisponivelNoPolo/);
  assert.doesNotMatch(hook, /\.update\(|\.insert\(|gerar_ciclo|settlementContext|setStatus/);
  assert.match(table, /matriculaLocal[\s\S]*?Registrar recebimento da matrícula/);
  assert.match(options, /Esta escolha não registra pagamento/);
  assert.match(list, /if \(abrirRecebimento && local\) settlement\.open/);
  assert.match(list, /onSettleEnrollment=\{canSettleEnrollment \? settlement\.open : undefined\}/);
});
