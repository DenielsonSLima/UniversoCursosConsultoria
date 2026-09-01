import { supabase } from '../../../../../../../lib/supabase';
import type {
  CicloFinanceiroTecnicoManualPreview,
  GerarCicloFinanceiroTecnicoManualInput,
  GerarCicloFinanceiroTecnicoManualResult,
  PreviewCicloFinanceiroTecnicoManualInput,
  PreviewCicloFinanceiroTecnicoManualResult,
} from './matricula-tecnica-ciclo-manual.types';
import { requireMatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.parser';

export { requireMatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.parser';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isDecimalString = (value: unknown): value is string => (
  typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isApplicationItem = (value: unknown) => (
  isRecord(value)
  && typeof value.desconto === 'boolean'
  && typeof value.multaJuros === 'boolean'
);

const requireIndividualSecondCycleDate = (
  cycleNumber: number,
  firstDueDate: string | null,
) => {
  if (cycleNumber === 2 && firstDueDate === null) {
    throw new Error('O 2º ciclo exige o vencimento individual do primeiro item.');
  }
};

const requirePreview = (value: unknown): CicloFinanceiroTecnicoManualPreview => {
  if (!isRecord(value) || !Array.isArray(value.itens)) {
    throw new Error('O servidor não retornou a prévia canônica do ciclo.');
  }
  const items = value.itens as unknown[];
  const terms = value.termos;
  const validItems = items.every((item) => (
    isRecord(item)
    && isNonEmptyString(item.chave)
    && ['MATRICULA', 'REMATRICULA', 'PARCELA'].includes(String(item.tipo))
    && Number.isInteger(item.numero)
    && Number(item.numero) >= 0
    && isNonEmptyString(item.descricao)
    && isDecimalString(item.valor)
    && isNonEmptyString(item.vencimento)
  ));
  const validTerms = isRecord(terms)
    && isDecimalString(terms.descontoPontualidade)
    && isDecimalString(terms.jurosAtrasoPercentual)
    && isDecimalString(terms.multaAtrasoPercentual)
    && typeof terms.instrucaoBoleto === 'string'
    && isRecord(terms.aplicacao)
    && isApplicationItem(terms.aplicacao.matricula)
    && isApplicationItem(terms.aplicacao.mensalidade)
    && isApplicationItem(terms.aplicacao.rematricula);
  if (
    !Number.isInteger(value.cicloNumero)
    || Number(value.cicloNumero) < 1
    || !['TURMA', 'INDIVIDUAL'].includes(String(value.sourceVencimento))
    || (Number(value.cicloNumero) === 2 && value.sourceVencimento !== 'INDIVIDUAL')
    || !isNonEmptyString(value.dataOrigem)
    || !isNonEmptyString(value.primeiroVencimento)
    || !Number.isInteger(value.quantidadeItens)
    || Number(value.quantidadeItens) < 1
    || value.quantidadeItens !== items.length
    || !isDecimalString(value.total)
    || !validItems
    || !validTerms
    || !isNonEmptyString(value.regraEfetivaFingerprint)
    || !isNonEmptyString(value.politicaFingerprint)
    || !isNonEmptyString(value.cronogramaFingerprint)
  ) {
    throw new Error('O servidor retornou uma prévia de ciclo incompleta.');
  }
  return value as unknown as CicloFinanceiroTecnicoManualPreview;
};

const requireGenerationResult = (
  value: unknown,
): GerarCicloFinanceiroTecnicoManualResult => {
  if (!isRecord(value) || !isRecord(value.ciclo) || !Array.isArray(value.ciclo.recebiveis)) {
    throw new Error('O servidor não confirmou a geração local do ciclo.');
  }
  const cycle = value.ciclo;
  const receivables = cycle.recebiveis as unknown[];
  const validReceivables = receivables.every((item) => (
    isRecord(item)
    && isNonEmptyString(item.id)
    && isNonEmptyString(item.chave)
    && ['MATRICULA', 'REMATRICULA', 'PARCELA'].includes(String(item.tipo))
    && Number.isInteger(item.numero)
    && Number(item.numero) >= 0
    && isNonEmptyString(item.descricao)
    && isDecimalString(item.valor)
    && isNonEmptyString(item.vencimento)
    && item.status === 'PENDENTE'
    && item.emissaoBanese === 'NAO_EMITIDO'
  ));
  if (
    value.operacao !== 'GERACAO_CICLO_TECNICO_MANUAL'
    || !isNonEmptyString(value.requestId)
    || typeof value.replayed !== 'boolean'
    || !Number.isInteger(cycle.numero)
    || Number(cycle.numero) < 1
    || cycle.status !== 'CRIADO_LOCAL'
    || !Number.isInteger(cycle.quantidadeItens)
    || Number(cycle.quantidadeItens) < 1
    || cycle.quantidadeItens !== receivables.length
    || !isDecimalString(cycle.total)
    || !validReceivables
  ) {
    throw new Error('O servidor retornou uma geração local de ciclo incompleta.');
  }
  const cicloManual = requireMatriculaTecnicaCicloManual(value.cicloManual);
  return {
    operacao: value.operacao,
    requestId: value.requestId,
    replayed: value.replayed,
    ciclo: cycle as unknown as GerarCicloFinanceiroTecnicoManualResult['ciclo'],
    cicloManual,
  };
};

const requirePreviewResult = (
  value: unknown,
): PreviewCicloFinanceiroTecnicoManualResult => {
  if (
    !isRecord(value)
    || !isNonEmptyString(value.matriculaId)
    || !isNonEmptyString(value.turmaId)
  ) {
    throw new Error('O servidor não confirmou o contexto da prévia do ciclo.');
  }
  const cicloManual = requireMatriculaTecnicaCicloManual(value.cicloManual);
  const preview = requirePreview(value.preview);
  return {
    matriculaId: value.matriculaId,
    turmaId: value.turmaId,
    cicloManual,
    preview,
  };
};

const unwrap = async <T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
  parser: (value: unknown) => T,
) => {
  const { data, error } = await request;
  if (error) throw error;
  return parser(data);
};

export const matriculaTecnicaCicloManualService = {
  async preview(input: PreviewCicloFinanceiroTecnicoManualInput) {
    requireIndividualSecondCycleDate(
      input.cicloNumero,
      input.primeiroVencimento,
    );
    const result = await unwrap(
      supabase.rpc('preview_ciclo_financeiro_tecnico_manual_secure', {
        p_matricula_id: input.matriculaId,
        p_ciclo_numero: input.cicloNumero,
        p_primeiro_vencimento: input.primeiroVencimento,
      }),
      requirePreviewResult,
    );
    if (
      result.matriculaId !== input.matriculaId
      || result.preview.cicloNumero !== input.cicloNumero
      || result.preview.sourceVencimento !== (
        input.primeiroVencimento === null ? 'TURMA' : 'INDIVIDUAL'
      )
      || (
        input.primeiroVencimento !== null
        && result.preview.primeiroVencimento !== input.primeiroVencimento
      )
      || result.cicloManual.estado !== 'ELEGIVEL'
      || !result.cicloManual.podeGerar
    ) {
      throw new Error('O servidor não reconciliou a prévia do ciclo solicitado.');
    }
    return result;
  },

  async generate(input: GerarCicloFinanceiroTecnicoManualInput) {
    requireIndividualSecondCycleDate(
      input.cicloNumero,
      input.primeiroVencimento,
    );
    const result = await unwrap(
      supabase.rpc('gerar_ciclo_financeiro_tecnico_manual_secure', {
        p_matricula_id: input.matriculaId,
        p_ciclo_numero: input.cicloNumero,
        p_primeiro_vencimento: input.primeiroVencimento,
        p_request_id: input.requestId,
        p_expected_regra_fingerprint: input.expectedRegraFingerprint,
        p_expected_politica_fingerprint: input.expectedPoliticaFingerprint,
        p_expected_cronograma_fingerprint: input.expectedCronogramaFingerprint,
      }),
      requireGenerationResult,
    );
    const generated = result.cicloManual.cicloGerado;
    const finalCycle = input.cicloNumero === result.cicloManual.cicloMaximo;
    const validTransition = finalCycle
      ? result.cicloManual.estado === 'JA_GERADO'
        && !result.cicloManual.podeGerar
      : ['BLOQUEADO', 'ELEGIVEL'].includes(result.cicloManual.estado)
        && result.cicloManual.proximoCicloNumero === input.cicloNumero + 1;
    if (
      result.requestId !== input.requestId
      || result.ciclo.numero !== input.cicloNumero
      || !validTransition
      || generated?.numero !== input.cicloNumero
      || generated.quantidadeItens !== result.ciclo.quantidadeItens
      || generated.pendentesEmissao !== result.ciclo.quantidadeItens
      || generated.emitidosBanese !== 0
    ) {
      throw new Error('O servidor não reconciliou o ciclo local solicitado.');
    }
    return result;
  },
};
