export const GESTOR_MODULE_IDS = [
  'inicio',
  'parceiros',
  'cadastros',
  'gestao',
  'secretaria',
  'caixa',
  'financeiro',
  'biblioteca',
  'calendario',
  'comunicacao',
  'relatorios',
  'configuracoes',
] as const;

export type GestorModuleId = typeof GESTOR_MODULE_IDS[number];

export const FINANCEIRO_TAB_IDS = [
  'resumo',
  'receber',
  'despesas',
  'transferencias',
  'outros-debitos',
  'outros-creditos',
] as const;

export type FinanceiroTabId = typeof FINANCEIRO_TAB_IDS[number];

export interface GestorPermissions {
  modules: GestorModuleId[];
  financeiroTabs: FinanceiroTabId[];
  allPolos: boolean;
}

export const DEFAULT_GESTOR_MODULES = [...GESTOR_MODULE_IDS] as GestorModuleId[];
export const DEFAULT_FINANCEIRO_TABS = [...FINANCEIRO_TAB_IDS] as FinanceiroTabId[];

const MODULE_ALIASES: Record<string, GestorModuleId> = {
  dashboard: 'inicio',
};

const moduleIdSet = new Set<string>(GESTOR_MODULE_IDS);
const financeiroTabSet = new Set<string>(FINANCEIRO_TAB_IDS);

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
};

export const normalizeGestorModules = (value: unknown): GestorModuleId[] => {
  const normalized = normalizeStringArray(value)
    .map((item) => MODULE_ALIASES[item] || item)
    .filter((item) => moduleIdSet.has(item)) as GestorModuleId[];

  return [...new Set(normalized)];
};

export const normalizeFinanceiroTabs = (value: unknown): FinanceiroTabId[] => {
  const normalized = normalizeStringArray(value)
    .filter((item) => financeiroTabSet.has(item)) as FinanceiroTabId[];

  return [...new Set(normalized)];
};

export const hasExplicitGestorPermissions = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== 'object') return false;
  return 'modules' in value || 'financeiroTabs' in value || 'allPolos' in value;
};

export const normalizeGestorPermissions = (
  value: unknown,
  options: { fallbackFullAccess?: boolean } = {},
): GestorPermissions => {
  const fallbackFullAccess = options.fallbackFullAccess !== false;
  const hasExplicit = hasExplicitGestorPermissions(value);
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { modules: value };

  const modules = normalizeGestorModules(source.modules);
  const financeiroTabs = normalizeFinanceiroTabs(source.financeiroTabs);
  const modulesWithFallback = modules.length || hasExplicit || !fallbackFullAccess
    ? modules
    : DEFAULT_GESTOR_MODULES;

  return {
    modules: modulesWithFallback,
    financeiroTabs: financeiroTabs.length || hasExplicit || !fallbackFullAccess
      ? financeiroTabs
      : DEFAULT_FINANCEIRO_TABS,
    allPolos: typeof source.allPolos === 'boolean'
      ? source.allPolos
      : fallbackFullAccess && !hasExplicit,
  };
};

export const buildGestorPermissionsPayload = (permissions: GestorPermissions) => ({
  modules: normalizeGestorModules(permissions.modules),
  financeiroTabs: normalizeFinanceiroTabs(permissions.financeiroTabs),
  allPolos: Boolean(permissions.allPolos),
});

export const canAccessGestorModule = (
  permissions: GestorPermissions,
  moduleId: string,
) => {
  const normalized = MODULE_ALIASES[moduleId] || moduleId;
  return permissions.modules.includes(normalized as GestorModuleId);
};

export const canAccessFinanceiroTab = (
  permissions: GestorPermissions,
  tabId: string,
) => permissions.financeiroTabs.includes(tabId as FinanceiroTabId);
