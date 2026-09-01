import type { MatriculaTecnicaCicloManual } from './matricula-tecnica-ciclo-manual.types';

const MANUAL_STATES = [
  'ELEGIVEL',
  'BLOQUEADO',
  'JA_GERADO',
  'PROTEGIDO_EXISTENTE',
  'CICLOS_CONCLUIDOS',
  'NAO_HABILITADO',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
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
  const generatedValid = generated === null || (
    isRecord(generated)
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
      + Number(generated.emRevisao) <= Number(generated.quantidadeItens)
  );
  const state = String(value.estado);
  const baseline = Number.isInteger(value.cicloBaseHistorico)
    ? Number(value.cicloBaseHistorico) : null;
  const maximum = Number.isInteger(value.cicloMaximo)
    ? Number(value.cicloMaximo) : null;
  const next = Number.isInteger(value.proximoCicloNumero)
    ? Number(value.proximoCicloNumero) : null;
  const generatedNumber = isRecord(generated) ? Number(generated.numero) : null;
  const baseValid = (
    typeof value.habilitado === 'boolean'
    && (value.modo === 'MANUAL' || value.modo === null)
    && isNullableInteger(value.cicloBaseHistorico)
    && isNullableInteger(value.cicloMaximo)
    && isNullableInteger(value.proximoCicloNumero)
    && isNullableString(value.criterioElegibilidade)
    && MANUAL_STATES.includes(state as typeof MANUAL_STATES[number])
    && typeof value.podeGerar === 'boolean'
    && blockValid
    && policyValid
    && generatedValid
  );
  if (!baseValid) {
    throw new Error('O servidor retornou um estado manual de ciclo incompleto.');
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
