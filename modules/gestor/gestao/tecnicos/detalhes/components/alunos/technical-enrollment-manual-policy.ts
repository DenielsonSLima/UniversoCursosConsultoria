import { requireMatriculaTecnicaCicloFinanceiroPolicy } from '../financeiro/matricula-tecnica-ciclo-financeiro-policy';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export const isManualTechnicalCycleContext = (source: unknown) => {
  if (!isRecord(source) || !isRecord(source.turma)) {
    throw new Error('O contexto financeiro técnico canônico ainda não foi carregado.');
  }
  const policy = requireMatriculaTecnicaCicloFinanceiroPolicy(
    source.turma.cicloFinanceiroTecnico,
  );
  return policy.habilitado === true && policy.modo === 'MANUAL';
};
