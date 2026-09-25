import { isProvenLocalEnrollment, readCycleQuantities } from './matricula-tecnica-ciclo-manual-destination';
import type {
  MatriculaTecnicaCicloManual,
  MatriculaTecnicaCicloManualCriterio,
} from './matricula-tecnica-ciclo-manual.types';

const MANUAL_STATES = [
  'ELEGIVEL',
  'BLOQUEADO',
  'JA_GERADO',
  'PROTEGIDO_EXISTENTE',
  'CICLOS_CONCLUIDOS',
  'NAO_HABILITADO',
] as const;

const ELIGIBILITY_LABELS: Record<MatriculaTecnicaCicloManualCriterio, string> = {
  HISTORICO_EXTERNO: '1º ciclo administrado no sistema anterior; sem informação de quitação',
  QUITACAO_TOTAL: 'Ciclo anterior totalmente quitado',
  PENULTIMA_SEM_ATRASO: 'Penúltima parcela paga e nenhuma cobrança vencida',
  MANUAL_APOS_EMISSAO: 'Geração manual por ciclo',
  TRANSFERENCIA_PLANEJADA: 'Ciclo inicial definido na transferência; sem presumir pagamento de ciclo anterior',
  TRANSFERENCIA_INTERNA_CANONICA: 'Continuidade do 1º ciclo emitido na matrícula de origem',
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isNullableEligibilityCriterion = (
  value: unknown,
): value is MatriculaTecnicaCicloManualCriterio | null => (
  value === null || Object.hasOwn(ELIGIBILITY_LABELS, String(value))
);

const isNullableInteger = (value: unknown): value is number | null => (
  value === null || Number.isInteger(value)
);

const isDecimalString = (value: unknown): value is string => (
  typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
);

const isNonEmptyString = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0
);

const isIsoCalendarDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value;
};

const isNullableIsoCalendarDate = (value: unknown): value is string | null => (
  value === null || isIsoCalendarDate(value)
);

export const getCriterioElegibilidadeLabel = (
  value: MatriculaTecnicaCicloManualCriterio | null,
) => value === null ? null : ELIGIBILITY_LABELS[value];

export const requireMatriculaTecnicaCicloManual = (
  value: unknown,
): MatriculaTecnicaCicloManual => {
  if (!isRecord(value) || !isRecord(value.cicloGerado) && value.cicloGerado !== null) {
    throw new Error('O servidor não retornou o estado manual do ciclo financeiro.');
  }
  const policyValid = value.politica === null || (
    isRecord(value.politica)
    && Number.isInteger(value.politica.revisao)
    && Number(value.politica.revisao) > 0
    && isNonEmptyString(value.politica.fingerprint)
  );
  const blockValid = value.bloqueio === null || (
    isRecord(value.bloqueio)
    && isNonEmptyString(value.bloqueio.codigo)
    && isNonEmptyString(value.bloqueio.mensagem)
  );
  const generated = value.cicloGerado;
  const quantities = isRecord(generated) ? readCycleQuantities(generated) : null;
  const hasExternalOrigin = isRecord(generated) && (
    generated.origemEmissao !== undefined
    || generated.abrangencia !== undefined
    || generated.status === 'EXTERNAL_COVERAGE'
  );
  const generatedOriginValid = !hasExternalOrigin || (
    isRecord(generated)
    && generated.origemEmissao === 'PROESC'
    && (generated.abrangencia === 'CONTRATO_COMPLETO' || generated.abrangencia === 'SEGUNDO_CICLO')
    && generated.status === 'EXTERNAL_COVERAGE'
    && value.estado === 'PROTEGIDO_EXISTENTE'
    && generated.emitidosBanese === 0
    && generated.pendentesEmissao === 0
    && generated.emRevisao === 0
  );
  const generatedValid = generated === null || (
    isRecord(generated)
    && generatedOriginValid
    && quantities !== null
    && Number.isInteger(generated.numero)
    && Number(generated.numero) > 0
    && isNonEmptyString(generated.status)
    && Number.isInteger(generated.quantidadeItens)
    && Number(generated.quantidadeItens) > 0
    && isDecimalString(generated.total)
    && Number.isInteger(generated.emitidosBanese)
    && Number(generated.emitidosBanese) >= 0
    && Number.isInteger(generated.pendentesEmissao)
    && Number(generated.pendentesEmissao) >= 0
    && Number.isInteger(generated.emRevisao)
    && Number(generated.emRevisao) >= 0
    && Number(generated.emitidosBanese)
      + Number(generated.pendentesEmissao)
      + Number(generated.emRevisao) <= quantities!.bank
  );
  const state = String(value.estado);
  const baseline = Number.isInteger(value.cicloBaseHistorico)
    ? Number(value.cicloBaseHistorico) : null;
  const maximum = Number.isInteger(value.cicloMaximo)
    ? Number(value.cicloMaximo) : null;
  const next = Number.isInteger(value.proximoCicloNumero)
    ? Number(value.proximoCicloNumero) : null;
  const generatedNumber = isRecord(generated) ? Number(generated.numero) : null;
  const entry = value.planoEntrada;
  const entryValid = isRecord(entry)
    && [1, 2].includes(Number(entry.cicloInicial)) && Number.isInteger(entry.cicloInicial)
    && Number.isInteger(entry.quantidadeParcelas)
    && Number(entry.quantidadeParcelas) >= 1 && Number(entry.quantidadeParcelas) <= 60
    && isIsoCalendarDate(entry.primeiroVencimento)
    && typeof entry.requestId === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.requestId)
    && (entry.cicloInicial === 2 ? isNonEmptyString(entry.justificativaCiclo2)
      : entry.justificativaCiclo2 === null);
  const plannedInitialCycle = value.criterioElegibilidade === 'TRANSFERENCIA_PLANEJADA';
  const plannedTransitionValid = plannedInitialCycle && entryValid
    && generated === null && baseline === 0 && maximum === 2
    && state === 'ELEGIVEL' && value.podeGerar === true
    && value.bloqueio === null && next === entry.cicloInicial
    && value.primeiroVencimentoSugerido === entry.primeiroVencimento;
  const continuity = value.continuidadeFinanceira;
  const continuityValid = isRecord(continuity)
    && [continuity.matriculaOrigemId, continuity.transferenciaId].every((id) =>
      typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    && Array.isArray(continuity.cadeiaOrigemIds)
    && continuity.cadeiaOrigemIds.length >= 1 && continuity.cadeiaOrigemIds.length <= 32
    && continuity.cadeiaOrigemIds[0] === continuity.matriculaOrigemId
    && new Set(continuity.cadeiaOrigemIds).size === continuity.cadeiaOrigemIds.length
    && continuity.cadeiaOrigemIds.every((id) => typeof id === 'string'
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    && (continuity.cicloOrigem === null || continuity.cicloOrigem === 1)
    && typeof continuity.origemCompleta === 'boolean'
    && typeof continuity.semHistoricoFinanceiro === 'boolean'
    && (!continuity.origemCompleta || (continuity.cicloOrigem === 1 && !continuity.semHistoricoFinanceiro));
  const internalInitialCycle = value.criterioElegibilidade === 'TRANSFERENCIA_INTERNA_CANONICA';
  const internalTransitionValid = internalInitialCycle && continuityValid
    && continuity.origemCompleta === true && generated === null
    && baseline === 0 && maximum === 2 && next === 2
    && state === 'ELEGIVEL' && value.podeGerar === true && value.bloqueio === null
    && isIsoCalendarDate(value.primeiroVencimentoSugerido);
  // Individual history can prevent generation without proving a complete cycle
  // or supplying a class policy. This state is display-only, never actionable.
  const protectedHistoryOnly = state === 'PROTEGIDO_EXISTENTE'
    && isRecord(value.bloqueio)
    && value.bloqueio.codigo === 'HISTORICO_FINANCEIRO_EXISTENTE'
    && value.habilitado === true
    && value.modo === 'MANUAL'
    && value.podeGerar === false
    && value.proximoCicloNumero === null
    && value.primeiroVencimentoSugerido === null
    && maximum === 2
    && (baseline === null || (baseline >= 0 && baseline <= maximum))
    && (generated === null || (generatedNumber! >= 1 && generatedNumber! <= maximum));
  const baseValid = (
    (entry === undefined || entry === null || entryValid)
    && (continuity === undefined || continuity === null || continuityValid)
    && (!plannedInitialCycle || plannedTransitionValid)
    && (!internalInitialCycle || internalTransitionValid)
    && (value.matriculaLocal === undefined || value.matriculaLocal === null
      || isProvenLocalEnrollment(value.matriculaLocal))
    && typeof value.habilitado === 'boolean'
    && (value.conferenciaProesc === undefined || (
      isRecord(value.conferenciaProesc)
      && value.conferenciaProesc.necessaria === true
      && (protectedHistoryOnly || (['ELEGIVEL', 'BLOQUEADO'].includes(state)
        && generated === null))
    ))
    && (value.modo === 'MANUAL' || value.modo === null)
    && isNullableInteger(value.cicloBaseHistorico)
    && isNullableInteger(value.cicloMaximo)
    && isNullableInteger(value.proximoCicloNumero)
    && isNullableIsoCalendarDate(value.primeiroVencimentoSugerido)
    && isNullableEligibilityCriterion(value.criterioElegibilidade)
    && MANUAL_STATES.includes(state as typeof MANUAL_STATES[number])
    && typeof value.podeGerar === 'boolean'
    && blockValid
    && policyValid
    && generatedValid
  );
  if (!baseValid) {
    throw new Error('O servidor retornou um estado manual de ciclo incompleto.');
  }
  if (protectedHistoryOnly) {
    return value as unknown as MatriculaTecnicaCicloManual;
  }
  if (
    (state === 'NAO_HABILITADO' && (value.habilitado || value.podeGerar))
    || (!value.habilitado && state !== 'NAO_HABILITADO')
    || (value.habilitado && (value.modo !== 'MANUAL' || value.politica === null))
    || (value.habilitado && (
      baseline === null
      || maximum === null
      || baseline < 0
      || maximum < 1
      || maximum > 2
      || baseline > maximum
    ))
    || (state === 'ELEGIVEL' && (!value.podeGerar || value.proximoCicloNumero === null))
    || (state !== 'ELEGIVEL' && value.podeGerar)
    || (state === 'BLOQUEADO' && value.bloqueio === null)
    || (['JA_GERADO', 'PROTEGIDO_EXISTENTE'].includes(state) && generated === null)
    || (['JA_GERADO', 'PROTEGIDO_EXISTENTE'].includes(state) && generatedNumber !== maximum)
    || (
      state === 'CICLOS_CONCLUIDOS'
      && (generatedNumber === null ? baseline !== maximum : generatedNumber !== maximum)
    )
    || (next !== null && (next < 1 || next > maximum!))
    || (generatedNumber !== null && (generatedNumber < 1 || generatedNumber > maximum!))
    || (['JA_GERADO', 'PROTEGIDO_EXISTENTE', 'CICLOS_CONCLUIDOS'].includes(state) && next !== null)
    || (
      generatedNumber === null
      && ['ELEGIVEL', 'BLOQUEADO'].includes(state)
      && !plannedTransitionValid && !internalTransitionValid
      && next !== baseline! + 1
    )
    || (
      generatedNumber !== null
      && ['ELEGIVEL', 'BLOQUEADO'].includes(state)
      && next !== generatedNumber + 1
    )
  ) {
    throw new Error('O servidor retornou um estado manual de ciclo incoerente.');
  }
  return value as unknown as MatriculaTecnicaCicloManual;
};
