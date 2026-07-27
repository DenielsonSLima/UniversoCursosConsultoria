import { canAccessSecretariaOperation } from './secretaria/secretaria-access';

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
  'conciliacao-bancaria',
  'outros-debitos',
  'outros-creditos',
] as const;

export type FinanceiroTabId = typeof FINANCEIRO_TAB_IDS[number];

export const GESTAO_TURMA_TAB_IDS = [
  'resumo',
  'alunos',
  'grade',
  'atividades',
  'diarios',
  'financeiro',
  'vacinas',
  'estagio',
  'academico',
  'configuracoes',
] as const;

export type GestaoTurmaTabId = typeof GESTAO_TURMA_TAB_IDS[number];

export const DASHBOARD_WIDGET_IDS = [
  'alunos-ativos',
  'receita-mes',
  'inadimplencia',
  'matriculas-mes',
  'fluxo-caixa',
  'acoes-rapidas',
  'atividade-recente',
] as const;

export type DashboardWidgetId = typeof DASHBOARD_WIDGET_IDS[number];

export interface GestorPermissions {
  modules: GestorModuleId[];
  financeiroTabs: FinanceiroTabId[];
  dashboardWidgets?: DashboardWidgetId[];
  allPolos: boolean;
  tabs?: Record<string, string[]>;
}

export const DEFAULT_GESTOR_MODULES = [...GESTOR_MODULE_IDS] as GestorModuleId[];
export const DEFAULT_FINANCEIRO_TABS = [...FINANCEIRO_TAB_IDS] as FinanceiroTabId[];
export const DEFAULT_GESTAO_TURMA_TABS = [...GESTAO_TURMA_TAB_IDS] as GestaoTurmaTabId[];

const MODULE_ALIASES: Record<string, GestorModuleId> = {
  dashboard: 'inicio',
};

const moduleIdSet = new Set<string>(GESTOR_MODULE_IDS);
const financeiroTabSet = new Set<string>(FINANCEIRO_TAB_IDS);
const gestaoTurmaTabSet = new Set<string>(GESTAO_TURMA_TAB_IDS);
const dashboardWidgetSet = new Set<string>(DASHBOARD_WIDGET_IDS);

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

export const normalizeGestaoTurmaTabs = (value: unknown): GestaoTurmaTabId[] => {
  const normalized = normalizeStringArray(value)
    .filter((item) => gestaoTurmaTabSet.has(item)) as GestaoTurmaTabId[];

  return [...new Set(normalized)];
};

export const normalizeDashboardWidgets = (value: unknown): DashboardWidgetId[] => {
  const normalized = normalizeStringArray(value)
    .filter((item) => dashboardWidgetSet.has(item)) as DashboardWidgetId[];

  return [...new Set(normalized)];
};

export const hasExplicitGestorPermissions = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (!value || typeof value !== 'object') return false;
  return 'modules' in value
    || 'financeiroTabs' in value
    || 'dashboardWidgets' in value
    || 'allPolos' in value
    || 'tabs' in value;
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
  const hasDashboardWidgets = Object.prototype.hasOwnProperty.call(source, 'dashboardWidgets');
  const dashboardWidgets = normalizeDashboardWidgets(source.dashboardWidgets);
  const modulesWithFallback = modules.length || hasExplicit || !fallbackFullAccess
    ? modules
    : DEFAULT_GESTOR_MODULES;

  const rawTabs = source.tabs && typeof source.tabs === 'object' ? source.tabs as Record<string, unknown> : undefined;
  const tabs: Record<string, string[]> = {};
  if (rawTabs) {
    for (const key in rawTabs) {
      if (Array.isArray(rawTabs[key])) {
        tabs[key] = normalizeStringArray(rawTabs[key]);
      }
    }
  }

  return {
    modules: modulesWithFallback,
    financeiroTabs: financeiroTabs.length || hasExplicit || !fallbackFullAccess
      ? financeiroTabs
      : DEFAULT_FINANCEIRO_TABS,
    dashboardWidgets: hasDashboardWidgets ? dashboardWidgets : undefined,
    allPolos: typeof source.allPolos === 'boolean'
      ? source.allPolos
      : fallbackFullAccess && !hasExplicit,
    tabs: Object.keys(tabs).length > 0 ? tabs : undefined,
  };
};

export const buildGestorPermissionsPayload = (permissions: GestorPermissions) => {
  const payload: any = {
    modules: normalizeGestorModules(permissions.modules),
    financeiroTabs: normalizeFinanceiroTabs(permissions.financeiroTabs),
    allPolos: Boolean(permissions.allPolos),
  };
  if (permissions.dashboardWidgets !== undefined) {
    payload.dashboardWidgets = normalizeDashboardWidgets(permissions.dashboardWidgets);
  }
  if (permissions.tabs) {
    payload.tabs = permissions.tabs;
  }
  return payload;
};

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
) => getEffectiveFinanceiroTabs(permissions).includes(tabId as FinanceiroTabId);

export const getEffectiveGestaoTurmaTabs = (
  permissions: GestorPermissions,
): GestaoTurmaTabId[] => {
  if (!canAccessGestorModule(permissions, 'gestao')) return [];
  if (permissions.tabs && Object.prototype.hasOwnProperty.call(permissions.tabs, 'gestao')) {
    return normalizeGestaoTurmaTabs(permissions.tabs.gestao);
  }
  return DEFAULT_GESTAO_TURMA_TABS;
};

export const canAccessGestaoTurmaTab = (
  permissions: GestorPermissions,
  tabId: string,
) => getEffectiveGestaoTurmaTabs(permissions).includes(tabId as GestaoTurmaTabId);

export const getEffectiveFinanceiroTabs = (
  permissions: GestorPermissions,
): FinanceiroTabId[] => {
  const legacyTabs = normalizeFinanceiroTabs(permissions.financeiroTabs);
  if (permissions.tabs && Object.prototype.hasOwnProperty.call(permissions.tabs, 'financeiro')) {
    const scopedTabs = normalizeFinanceiroTabs(permissions.tabs.financeiro);
    if (!scopedTabs.length) return legacyTabs;

    if (scopedTabs.includes('receber') && legacyTabs.includes('receber')) {
      return scopedTabs.includes('conciliacao-bancaria')
        ? scopedTabs
        : [...new Set<FinanceiroTabId>([
            ...scopedTabs,
            'conciliacao-bancaria',
          ])];
    }

    return scopedTabs;
  }
  return legacyTabs;
};

export const getEligibleDashboardWidgets = (
  permissions: GestorPermissions,
): DashboardWidgetId[] => {
  if (!canAccessGestorModule(permissions, 'inicio')) return [];

  const hasAcademicOverview = canAccessGestorModule(permissions, 'parceiros')
    || canAccessGestaoTurmaTab(permissions, 'resumo')
    || canAccessGestaoTurmaTab(permissions, 'alunos')
    || canAccessSecretariaOperation(permissions.tabs, 'alunos');
  const hasAcademicActivity = canAccessGestorModule(permissions, 'parceiros')
    || canAccessGestaoTurmaTab(permissions, 'alunos')
    || canAccessSecretariaOperation(permissions.tabs, 'alunos');
  const hasFinanceOverview = canAccessGestorModule(permissions, 'financeiro')
    && (
      canAccessFinanceiroTab(permissions, 'resumo')
      || canAccessFinanceiroTab(permissions, 'receber')
    );
  const hasCashFlow = canAccessGestorModule(permissions, 'financeiro')
    && canAccessFinanceiroTab(permissions, 'resumo');
  const hasQuickActions = ['parceiros', 'cadastros', 'caixa']
    .some((moduleId) => canAccessGestorModule(permissions, moduleId));
  const hasRecentActivity = hasAcademicActivity
    || hasFinanceOverview
    || canAccessGestorModule(permissions, 'biblioteca');

  return DASHBOARD_WIDGET_IDS.filter((widgetId) => {
    switch (widgetId) {
      case 'alunos-ativos':
      case 'matriculas-mes':
        return hasAcademicOverview;
      case 'receita-mes':
      case 'inadimplencia':
        return hasFinanceOverview;
      case 'fluxo-caixa':
        return hasCashFlow;
      case 'acoes-rapidas':
        return hasQuickActions;
      case 'atividade-recente':
        return hasRecentActivity;
      default:
        return false;
    }
  });
};

export const getAllowedDashboardWidgets = (
  permissions: GestorPermissions,
): DashboardWidgetId[] => {
  const eligible = getEligibleDashboardWidgets(permissions);
  if (permissions.dashboardWidgets === undefined) return eligible;

  const selected = new Set(normalizeDashboardWidgets(permissions.dashboardWidgets));
  return eligible.filter((widgetId) => selected.has(widgetId));
};

export const buildDashboardAccessKey = (
  permissions: GestorPermissions,
  identityKey = 'sem-identidade',
): string => {
  const normalizedTabs = Object.entries(permissions.tabs || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleId, tabs]) => [
      moduleId,
      [...new Set(normalizeStringArray(tabs))].sort(),
    ]);

  return JSON.stringify({
    identityKey,
    modules: [...permissions.modules].sort(),
    financeiroTabs: [...getEffectiveFinanceiroTabs(permissions)].sort(),
    tabs: normalizedTabs,
    widgets: getAllowedDashboardWidgets(permissions),
  });
};

export const canAccessTab = (
  permissions: GestorPermissions,
  moduleId: string,
  tabId: string,
): boolean => {
  if (moduleId === 'financeiro') {
    return getEffectiveFinanceiroTabs(permissions).includes(tabId as FinanceiroTabId);
  }

  if (moduleId === 'secretaria') {
    return canAccessSecretariaOperation(permissions.tabs, tabId);
  }

  if (moduleId === 'gestao') {
    return canAccessGestaoTurmaTab(permissions, tabId);
  }

  if (!permissions.tabs || !permissions.tabs[moduleId]) {
    return moduleId !== 'cadastros' && moduleId !== 'comunicacao';
  }

  return permissions.tabs[moduleId].includes(tabId);
};
