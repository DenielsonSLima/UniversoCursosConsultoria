import {
  mapConfigToRegraTecnicaInput,
  mapRegraTecnicaToConfig,
  type FinanceiroConfigData,
} from '../financeiro/financeiro-config.service';
import type {
  MatriculaTecnicaOverrideInput,
  MatriculaTecnicaRegra,
  MatriculaTecnicaRegraTurmaInput,
} from '../financeiro/matricula-tecnica-financeiro.types';

export interface TechnicalEnrollmentConditionDraft {
  cobrarMatricula: boolean;
  valorMatricula: number;
  valorMensalidade: number;
  cobrarRematricula: boolean;
  valorRematricula: number;
  descontoPontualidade: number;
}

export const createTechnicalEnrollmentConditionDraft = (
  regra: MatriculaTecnicaRegra,
): TechnicalEnrollmentConditionDraft => ({
  cobrarMatricula: regra.cobranca.matricula.habilitada,
  valorMatricula: Number(regra.cobranca.matricula.valor),
  valorMensalidade: Number(regra.cobranca.mensalidade.valor),
  cobrarRematricula: regra.cobranca.rematricula.habilitada,
  valorRematricula: Number(regra.cobranca.rematricula.valor),
  descontoPontualidade: Number(regra.encargos.descontoPontualidade),
});

export const applyTechnicalEnrollmentCondition = (
  regra: MatriculaTecnicaRegra,
  draft: TechnicalEnrollmentConditionDraft,
): FinanceiroConfigData => ({
  ...mapRegraTecnicaToConfig(regra),
  cobrarMatricula: draft.cobrarMatricula,
  valorMatricula: draft.valorMatricula,
  valorParcela: draft.valorMensalidade,
  cobrarRematricula: draft.cobrarRematricula,
  valorRematricula: draft.valorRematricula,
  descontoPontualidade: draft.descontoPontualidade,
});

const emptyOverride = (): MatriculaTecnicaOverrideInput => ({
  cobrarMatricula: null,
  valorMatricula: null,
  qtdMensalidades: null,
  valorMensalidade: null,
  cobrarRematricula: null,
  valorRematricula: null,
  diaVencimento: null,
  descontoPontualidade: null,
  jurosAtrasoPercentual: null,
  multaAtrasoPercentual: null,
  aplicarDescontoMatricula: null,
  aplicarMultaJurosMatricula: null,
  aplicarDescontoMensalidade: null,
  aplicarMultaJurosMensalidade: null,
  aplicarDescontoRematricula: null,
  aplicarMultaJurosRematricula: null,
  instrucaoBoleto: null,
});

const sameNumber = (left: string | number, right: string | number) => (
  Math.round(Number(left) * 100) === Math.round(Number(right) * 100)
);

export const buildTechnicalEnrollmentOverride = (
  regra: MatriculaTecnicaRegra,
  draft: TechnicalEnrollmentConditionDraft,
): MatriculaTecnicaOverrideInput => {
  const base = mapConfigToRegraTecnicaInput(mapRegraTecnicaToConfig(regra));
  const next = mapConfigToRegraTecnicaInput(applyTechnicalEnrollmentCondition(regra, draft));
  const override = emptyOverride();
  const keys: Array<keyof Pick<
    MatriculaTecnicaRegraTurmaInput,
    | 'cobrarMatricula'
    | 'valorMatricula'
    | 'valorMensalidade'
    | 'valorRematricula'
    | 'descontoPontualidade'
  >> = [
    'cobrarMatricula',
    'valorMatricula',
    'valorMensalidade',
    'valorRematricula',
    'descontoPontualidade',
  ];
  keys.forEach((key) => {
    const unchanged = typeof next[key] === 'string'
      ? sameNumber(next[key] as string, base[key] as string)
      : next[key] === base[key];
    if (!unchanged) (override as Record<string, unknown>)[key] = next[key];
  });
  return override;
};

export const hasTechnicalEnrollmentOverride = (override: MatriculaTecnicaOverrideInput) => (
  Object.values(override).some((value) => value !== null)
);

export const validateTechnicalEnrollmentCondition = (
  draft: TechnicalEnrollmentConditionDraft,
  regra?: MatriculaTecnicaRegra,
): string | null => {
  if (draft.cobrarMatricula && draft.valorMatricula <= 0) {
    return 'Informe um valor de matrícula ou marque a isenção.';
  }
  if (!Number.isFinite(draft.valorMensalidade) || draft.valorMensalidade <= 0) {
    return 'A mensalidade individual deve ser maior que zero.';
  }
  if (draft.cobrarRematricula && draft.valorRematricula <= 0) {
    return 'Informe um valor de rematrícula ou marque a isenção.';
  }
  if (draft.descontoPontualidade < 0 || draft.descontoPontualidade >= draft.valorMensalidade) {
    return 'O desconto por pagamento em dia deve ser menor que a mensalidade.';
  }
  if (regra && (
    draft.valorMatricula > Number(regra.valorMatricula)
    || draft.valorMensalidade > Number(regra.valorMensalidade)
    || draft.valorRematricula > Number(regra.valorRematricula)
    || draft.descontoPontualidade < Number(regra.encargos.descontoPontualidade)
  )) {
    return 'A condição individual deve reduzir valores ou aumentar o desconto em relação à turma.';
  }
  return null;
};
