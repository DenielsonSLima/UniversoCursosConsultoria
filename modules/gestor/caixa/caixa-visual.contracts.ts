import type { CaixaVisualSegment, CaixaVisualizacoes } from './caixa.types';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  isCaixaDate,
  isNonNegativeSafeInteger,
} from './caixa.contracts';
import {
  isCaixaCanonicalDecimalText,
  isCaixaSignedCanonicalDecimalText,
} from './caixa.formatters';

type RawItem = Record<string, unknown>;

const isPercentage = (value: unknown) => {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= 100;
};

const isSignedPercentage = (value: unknown) => {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= -100
    && value <= 100;
};

const isVisualSegment = (value: unknown) => {
  const item = asRecord(value);
  return typeof item.codigo === 'string'
    && typeof item.rotulo === 'string'
    && isCaixaCanonicalDecimalText(item.valor)
    && isNonNegativeSafeInteger(item.quantidade)
    && isPercentage(item.percentual)
    && isPercentage(item.inicio_percentual)
    && isPercentage(item.comprimento_percentual)
    && isSignedPercentage(item.offset_percentual)
    && isPercentage(item.gap_percentual);
};

const isMovementMonth = (value: unknown) => {
  const item = asRecord(value);
  return isCaixaDate(item.competencia)
    && typeof item.rotulo === 'string'
    && isPercentage(item.x)
    && isPercentage(item.base_y)
    && isPercentage(item.entrada_x)
    && isPercentage(item.saida_x)
    && isPercentage(item.entrada_y)
    && isPercentage(item.saida_y)
    && isPercentage(item.largura)
    && isCaixaCanonicalDecimalText(item.entradas_valor)
    && isCaixaCanonicalDecimalText(item.saidas_valor)
    && isCaixaSignedCanonicalDecimalText(item.resultado_valor)
    && isCaixaCanonicalDecimalText(item.inadimplencia_valor)
    && isPercentage(item.entradas_altura)
    && isPercentage(item.saidas_altura)
    && isPercentage(item.resultado_y)
    && isPercentage(item.inadimplencia_y);
};

const isBalanceItem = (value: unknown) => {
  const item = asRecord(value);
  return typeof item.id === 'string'
    && typeof item.banco === 'string'
    && typeof item.conta === 'string'
    && typeof item.titular === 'string'
    && (item.natureza === 'BANCARIA' || item.natureza === 'CAIXA_INTERNO')
    && isCaixaCanonicalDecimalText(item.valor)
    && isPercentage(item.percentual)
    && isPercentage(item.inicio_percentual)
    && isPercentage(item.comprimento_percentual)
    && isSignedPercentage(item.offset_percentual)
    && isPercentage(item.gap_percentual);
};

export const assertCaixaVisualizacoesPayload = (value: unknown): RawItem => {
  const visual = asRecord(value);
  const movement = asRecord(visual.movimentacao);
  const composition = asRecord(visual.composicao);
  const revenues = asRecord(composition.receitas);
  const expenses = asRecord(composition.despesas);
  const balances = asRecord(visual.saldos_por_conta);

  const valid = visual.versao === 1
    && visual.janela_meses === 6
    && movement.view_box === '0 0 100 100'
    && isCaixaSignedCanonicalDecimalText(movement.dominio_minimo)
    && isCaixaSignedCanonicalDecimalText(movement.dominio_maximo)
    && isPercentage(movement.base_y)
    && typeof movement.resultado_pontos === 'string'
    && typeof movement.inadimplencia_pontos === 'string'
    && Array.isArray(movement.meses)
    && movement.meses.every(isMovementMonth)
    && isCaixaCanonicalDecimalText(revenues.total)
    && Array.isArray(revenues.itens)
    && revenues.itens.every(isVisualSegment)
    && isCaixaCanonicalDecimalText(expenses.total)
    && Array.isArray(expenses.itens)
    && expenses.itens.every(isVisualSegment)
    && isCaixaCanonicalDecimalText(balances.total_positivo)
    && Array.isArray(balances.itens)
    && balances.itens.every(isBalanceItem);

  if (!valid) throw new Error('Contrato inválido das visualizações canônicas do Caixa.');
  return visual;
};

const mapSegment = (item: RawItem): CaixaVisualSegment => ({
  codigo: asString(item.codigo),
  rotulo: asString(item.rotulo),
  valor: asString(item.valor),
  quantidade: asNumber(item.quantidade),
  percentual: asNumber(item.percentual),
  inicioPercentual: asNumber(item.inicio_percentual),
  comprimentoPercentual: asNumber(item.comprimento_percentual),
  offsetPercentual: asNumber(item.offset_percentual),
  gapPercentual: asNumber(item.gap_percentual),
});

export const mapCaixaVisualizacoes = (value: unknown): CaixaVisualizacoes => {
  const visual = assertCaixaVisualizacoesPayload(value);
  const movement = asRecord(visual.movimentacao);
  const composition = asRecord(visual.composicao);
  const revenues = asRecord(composition.receitas);
  const expenses = asRecord(composition.despesas);
  const balances = asRecord(visual.saldos_por_conta);

  return {
    versao: 1,
    janelaMeses: 6,
    movimentacao: {
      viewBox: '0 0 100 100',
      dominioMinimo: asString(movement.dominio_minimo),
      dominioMaximo: asString(movement.dominio_maximo),
      baseY: asNumber(movement.base_y),
      resultadoPontos: asString(movement.resultado_pontos),
      inadimplenciaPontos: asString(movement.inadimplencia_pontos),
      meses: asArray(movement.meses).map((item) => ({
        competencia: asString(item.competencia),
        rotulo: asString(item.rotulo),
        x: asNumber(item.x),
        baseY: asNumber(item.base_y),
        entradaX: asNumber(item.entrada_x),
        saidaX: asNumber(item.saida_x),
        entradaY: asNumber(item.entrada_y),
        saidaY: asNumber(item.saida_y),
        largura: asNumber(item.largura),
        entradasValor: asString(item.entradas_valor),
        saidasValor: asString(item.saidas_valor),
        resultadoValor: asString(item.resultado_valor),
        inadimplenciaValor: asString(item.inadimplencia_valor),
        entradasAltura: asNumber(item.entradas_altura),
        saidasAltura: asNumber(item.saidas_altura),
        resultadoY: asNumber(item.resultado_y),
        inadimplenciaY: asNumber(item.inadimplencia_y),
      })),
    },
    composicao: {
      receitas: {
        total: asString(revenues.total),
        itens: asArray(revenues.itens).map(mapSegment),
      },
      despesas: {
        total: asString(expenses.total),
        itens: asArray(expenses.itens).map(mapSegment),
      },
    },
    saldosPorConta: {
      totalPositivo: asString(balances.total_positivo),
      itens: asArray(balances.itens).map((item) => ({
        id: asString(item.id),
        banco: asString(item.banco),
        conta: asString(item.conta),
        titular: asString(item.titular),
        natureza: item.natureza === 'CAIXA_INTERNO' ? 'CAIXA_INTERNO' : 'BANCARIA',
        valor: asString(item.valor),
        percentual: asNumber(item.percentual),
        inicioPercentual: asNumber(item.inicio_percentual),
        comprimentoPercentual: asNumber(item.comprimento_percentual),
        offsetPercentual: asNumber(item.offset_percentual),
        gapPercentual: asNumber(item.gap_percentual),
      })),
    },
  };
};
