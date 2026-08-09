import type {
  AtivarFinanceiroMatriculasTecnicasLoteInput,
  AtivarFinanceiroMatriculasTecnicasLoteResult,
} from './matricula-tecnica-financeiro.types';

export const validateAtivacaoLoteInput = (
  input: AtivarFinanceiroMatriculasTecnicasLoteInput,
) => {
  const uniqueIds = new Set(input.matriculaIds);
  const expectedIds = new Set(input.expectedRegras.map((item) => item.matriculaId));
  const invalidIdentity = input.expectedRegras.some((item) => (
    !Number.isInteger(item.overrideRevisao)
    || item.overrideRevisao < 0
    || !item.overrideFingerprint
    || !item.efetivaFingerprint
  ));
  if (
    input.matriculaIds.length === 0
    || uniqueIds.size !== input.matriculaIds.length
    || input.expectedRegras.length !== input.matriculaIds.length
    || expectedIds.size !== input.matriculaIds.length
    || [...uniqueIds].some((id) => !expectedIds.has(id))
    || invalidIdentity
  ) {
    throw new Error('O lote financeiro deve conter matrículas pendentes únicas.');
  }
};

export const validateAtivacaoLoteResult = (
  input: AtivarFinanceiroMatriculasTecnicasLoteInput,
  result: AtivarFinanceiroMatriculasTecnicasLoteResult,
) => {
  const requestedIds = new Set(input.matriculaIds);
  const resultIds = new Set(result.resultados.map((item) => item.matriculaId));
  const invalidItem = result.resultados.some((item) => (
    !requestedIds.has(item.matriculaId)
    || (input.modo === 'AGORA' && !['GERADA', 'ATIVADA'].includes(item.status))
    || (input.modo === 'AGENDADA' && item.status !== 'AGENDADA')
    || (input.modo === 'AGORA' && item.status === 'GERADA' && item.titulo === null)
    || (input.modo === 'AGORA' && item.status === 'ATIVADA' && item.titulo !== null)
    || (input.modo === 'AGENDADA' && item.titulo !== null)
  ));
  if (
    result.requestId !== input.requestId
    || result.modo !== input.modo
    || result.turmaId !== input.turmaId
    || result.total !== input.matriculaIds.length
    || result.resultados.length !== input.matriculaIds.length
    || resultIds.size !== input.matriculaIds.length
    || invalidItem
  ) throw new Error('O servidor não reconciliou o lote financeiro solicitado.');
};
