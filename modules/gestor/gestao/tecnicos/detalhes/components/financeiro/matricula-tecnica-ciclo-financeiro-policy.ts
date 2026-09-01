import type {
  MatriculaTecnicaCicloFinanceiroEstadoInicial,
  MatriculaTecnicaCicloFinanceiroPolicy,
} from './matricula-tecnica-financeiro.types';

const INITIAL_BASELINES: Record<MatriculaTecnicaCicloFinanceiroEstadoInicial, number> = {
  NOVA: 0,
  IMPORTADA_CICLO_1: 1,
  IMPORTADA_CONCLUIDA: 2,
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isSha256 = (value: unknown): value is string => (
  typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
);

export const requireMatriculaTecnicaCicloFinanceiroPolicy = (
  value: unknown,
): MatriculaTecnicaCicloFinanceiroPolicy => {
  if (!isRecord(value) || typeof value.habilitado !== 'boolean') {
    throw new Error('O servidor não retornou a política de ciclos da turma técnica.');
  }

  if (!value.habilitado) {
    if (
      value.modo !== null
      || value.estadoInicial !== null
      || value.cicloBaseHistorico !== null
      || value.cicloMaximo !== null
      || value.criterioElegibilidade !== null
      || value.revisao !== null
      || value.fingerprint !== null
    ) {
      throw new Error('O servidor retornou uma política de ciclos desabilitada incoerente.');
    }
    return value as unknown as MatriculaTecnicaCicloFinanceiroPolicy;
  }

  const initialState = String(value.estadoInicial) as MatriculaTecnicaCicloFinanceiroEstadoInicial;
  if (
    value.modo !== 'MANUAL'
    || !(initialState in INITIAL_BASELINES)
    || value.cicloBaseHistorico !== INITIAL_BASELINES[initialState]
    || value.cicloMaximo !== 2
    || !['QUITACAO_TOTAL', 'PENULTIMA_SEM_ATRASO'].includes(String(value.criterioElegibilidade))
    || !Number.isInteger(value.revisao)
    || Number(value.revisao) < 1
    || !isSha256(value.fingerprint)
  ) {
    throw new Error('O servidor retornou uma política manual de ciclos incoerente.');
  }

  return value as unknown as MatriculaTecnicaCicloFinanceiroPolicy;
};
