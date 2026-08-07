export type SecretariaAcademicModuleStatus =
  | 'ABERTO'
  | 'EM_FECHAMENTO'
  | 'FECHADO';

export interface SecretariaAcademicModule {
  periodId: string;
  moduleId: string;
  name: string;
  order: number;
  status: SecretariaAcademicModuleStatus;
  disciplines: Array<{
    id: string;
    name: string;
  }>;
}

const ACTIVE_MODULE_STATUSES = new Set<SecretariaAcademicModuleStatus>([
  'ABERTO',
  'EM_FECHAMENTO',
]);

const AVAILABLE_MODULE_STATUSES = new Set<SecretariaAcademicModuleStatus>([
  'ABERTO',
  'EM_FECHAMENTO',
  'FECHADO',
]);

export const isAvailableAcademicModuleStatus = (
  status: unknown,
): status is SecretariaAcademicModuleStatus =>
  AVAILABLE_MODULE_STATUSES.has(String(status) as SecretariaAcademicModuleStatus);

export const selectDefaultAcademicModule = (
  modules: SecretariaAcademicModule[],
  currentPeriodId?: string,
) => {
  const availableModules = modules
    .filter((module) => isAvailableAcademicModuleStatus(module.status))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  const current = availableModules.find(
    (module) => module.periodId === currentPeriodId,
  );
  if (current) return current;

  const active = availableModules.find(
    (module) => ACTIVE_MODULE_STATUSES.has(module.status),
  );
  if (active) return active;

  return availableModules.filter((module) => module.status === 'FECHADO').at(-1) || null;
};
