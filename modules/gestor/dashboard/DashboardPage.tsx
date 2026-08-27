import type React from 'react';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Clock3, GraduationCap, Sparkles, Users } from 'lucide-react';
import type { RecentActivityItem } from './dashboard.service';
import {
  dashboardActivityQueryOptions,
  dashboardKpisQueryOptions,
} from './dashboard.queries';
import { gestorCalendarQueryOptions } from '../calendario/calendario.queries';
import { toDateKey } from '../calendario/calendario.official';
import {
  buildDashboardAccessKey,
  canAccessGestorModule,
  getAllowedDashboardWidgets,
  type DashboardWidgetId,
  type GestorPermissions,
} from '../access-control';
import DashboardAgendaSection from './components/DashboardAgendaSection';
import DashboardFinancialShortcut from './components/DashboardFinancialShortcut';
import DashboardMetricCard from './components/DashboardMetricCard';
import DashboardQuickActionsHeader from './components/DashboardQuickActionsHeader';
import DashboardQuickActionsModal from './components/DashboardQuickActionsModal';
import DashboardRecentActivity from './components/DashboardRecentActivity';
import {
  addDays,
  formatShortDate,
  startOfDay,
  startOfWeek,
  type DashboardDaySummary,
  type DashboardPartnerForm,
  type DashboardQuickActionMode,
} from './dashboard.presentation';
import { getDashboardStudentFinanceAccess } from './student-finance/dashboard-student-finance.access';

interface DashboardPageProps {
  poloId?: string | null;
  onNavigate?: (moduleId: string) => void;
  permissions: GestorPermissions;
  cacheIdentity?: string;
}

const DashboardPage: React.FC<DashboardPageProps> = ({
  poloId,
  onNavigate,
  permissions,
  cacheIdentity,
}) => {
  const [quickActionMode, setQuickActionMode] = useState<DashboardQuickActionMode | null>(null);
  const now = new Date();
  const today = startOfDay(now);
  const todayKey = toDateKey(today);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 7);
  const activePoloId = poloId || '';

  const allowedWidgets = getAllowedDashboardWidgets(permissions);
  const widgetSet = new Set<DashboardWidgetId>(allowedWidgets);
  const hasWidget = (widgetId: DashboardWidgetId) => widgetSet.has(widgetId);
  const dashboardAccessKey = buildDashboardAccessKey(permissions, cacheIdentity);

  const showStudents = hasWidget('alunos-ativos');
  const showEnrollments = hasWidget('matriculas-mes');
  const showAcademicKpis = showStudents || showEnrollments;
  const showQuickActions = hasWidget('acoes-rapidas');
  const showRecentActivity = hasWidget('atividade-recente');
  const hasFinancialShortcut = ['receita-mes', 'inadimplencia', 'fluxo-caixa']
    .some((widgetId) => hasWidget(widgetId as DashboardWidgetId));
  const financialShortcutLabels = [
    hasWidget('receita-mes') ? 'Contas a receber' : null,
    hasWidget('inadimplencia') ? 'Inadimplência' : null,
    hasWidget('fluxo-caixa') ? 'Fluxo de caixa' : null,
  ].filter((label): label is string => Boolean(label));

  const canUseCalendar = canAccessGestorModule(permissions, 'calendario');
  const canUseFinance = canAccessGestorModule(permissions, 'financeiro');
  const canCreatePartner = canAccessGestorModule(permissions, 'parceiros');
  const studentFinanceAccess = getDashboardStudentFinanceAccess(permissions);

  const { data: kpis, isLoading: loadingKpis, isError: kpisError } = useQuery({
    ...dashboardKpisQueryOptions(activePoloId, dashboardAccessKey),
    enabled: Boolean(activePoloId) && showAcademicKpis,
  });

  const { data: recentActivity = [], isLoading: loadingActivity } = useQuery<RecentActivityItem[]>({
    ...dashboardActivityQueryOptions(activePoloId, dashboardAccessKey),
    enabled: Boolean(activePoloId) && showRecentActivity,
  });

  const { data: calendarData, isLoading: loadingCalendar } = useQuery({
    ...gestorCalendarQueryOptions(activePoloId),
    enabled: Boolean(activePoloId) && canUseCalendar,
  });

  const eventTypes = useMemo(
    () => calendarData?.eventTypes || [],
    [calendarData?.eventTypes],
  );

  const allEvents = useMemo(() => {
    const events = canUseCalendar ? calendarData?.events || [] : [];
    return [...events]
      .filter((event, index, list) => list.findIndex((item) => item.id === event.id) === index)
      .sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));
  }, [calendarData?.events, canUseCalendar]);

  const weekDays = useMemo<DashboardDaySummary[]>(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      const dateKey = toDateKey(date);
      return {
        dateKey,
        label: date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        dayNumber: String(date.getDate()).padStart(2, '0'),
        events: allEvents.filter((event) => event.date === dateKey),
        isToday: dateKey === todayKey,
      };
    }),
    [allEvents, todayKey, weekStart],
  );

  const weekEvents = useMemo(
    () => allEvents.filter((event) => {
      const eventDate = new Date(`${event.date}T12:00:00`);
      return eventDate >= weekStart && eventDate < weekEnd;
    }),
    [allEvents, weekEnd, weekStart],
  );

  const upcomingEvents = allEvents.filter((event) => event.date > todayKey).slice(0, 4);
  const nextImportantDate = allEvents.find(
    (event) => event.date >= todayKey && ['fer', 'fac', 'inst', 'evt'].includes(event.typeId),
  );

  const visibleMetricCount = 2 + Number(showStudents) + Number(showEnrollments);
  const metricGridClass = visibleMetricCount >= 4
    ? 'xl:grid-cols-4'
    : visibleMetricCount === 3
      ? 'xl:grid-cols-3'
      : 'xl:grid-cols-2';

  const hasHomeContent = canUseCalendar
    || showAcademicKpis
    || showQuickActions
    || showRecentActivity
    || (canUseFinance && hasFinancialShortcut);

  const openCalendar = () => {
    if (canUseCalendar) onNavigate?.('calendario');
  };

  const handlePartnerSelection = (form: DashboardPartnerForm) => {
    setQuickActionMode(null);
    onNavigate?.(`parceiros-novo-${form}`);
  };

  return (
    <div className="animate-fadeIn space-y-6 pb-10 text-[#001a33] antialiased">
      <DashboardQuickActionsHeader
        canCreatePartner={showQuickActions && canCreatePartner}
        canSearchStudentFinance={showQuickActions && studentFinanceAccess.canSearch}
        onOpenAction={setQuickActionMode}
      />

      <section className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${metricGridClass}`}>
        <DashboardMetricCard
          label="Agenda do dia"
          value={formatShortDate(todayKey)}
          helper={today.toLocaleDateString('pt-BR', { weekday: 'long' })}
          icon={Clock3}
          tone="bg-blue-50 text-blue-600"
          onClick={canUseCalendar ? openCalendar : undefined}
        />
        <DashboardMetricCard
          label="Agenda semanal"
          value={formatShortDate(toDateKey(weekStart))}
          helper={`até ${formatShortDate(toDateKey(addDays(weekEnd, -1)))}`}
          icon={CalendarDays}
          tone="bg-amber-50 text-amber-600"
          onClick={canUseCalendar ? openCalendar : undefined}
        />
        {showStudents && (
          <DashboardMetricCard
            label="Cadastros de alunos ativos"
            value={kpis?.cadastrosAlunosAtivos.toLocaleString('pt-BR') ?? '—'}
            helper={kpisError ? 'indicador indisponível' : 'perfis de aluno ativos no polo'}
            icon={Users}
            tone="bg-emerald-50 text-emerald-600"
            loading={loadingKpis}
            onClick={canCreatePartner ? () => onNavigate?.('parceiros') : undefined}
          />
        )}
        {showEnrollments && (
          <DashboardMetricCard
            label="Matrículas no mês"
            value={kpis?.novasMatriculas || 0}
            helper="novos alunos no período"
            icon={GraduationCap}
            tone="bg-indigo-50 text-indigo-600"
            loading={loadingKpis}
            onClick={canCreatePartner ? () => onNavigate?.('parceiros') : undefined}
          />
        )}
      </section>

      <DashboardAgendaSection
        weekStart={weekStart}
        weekEnd={weekEnd}
        weekDays={weekDays}
        weekEvents={weekEvents}
        upcomingEvents={upcomingEvents}
        nextImportantDate={nextImportantDate}
        eventTypes={eventTypes}
        loading={loadingCalendar}
        canUseCalendar={canUseCalendar}
        onOpenCalendar={openCalendar}
      />

      {showRecentActivity && (
        <DashboardRecentActivity activities={recentActivity} loading={loadingActivity} now={now} />
      )}

      {canUseFinance && hasFinancialShortcut && (
        <DashboardFinancialShortcut
          labels={financialShortcutLabels}
          onOpen={() => onNavigate?.('financeiro')}
        />
      )}

      {!hasHomeContent && (
        <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
            <Sparkles size={21} />
          </span>
          <h2 className="mt-4 text-base font-bold">Tela inicial sem recursos configurados</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Um administrador pode liberar agenda, indicadores acadêmicos e atalhos em Configurações → Perfis de acesso.
          </p>
        </div>
      )}

      {quickActionMode && (
        <DashboardQuickActionsModal
          mode={quickActionMode}
          poloId={poloId}
          canSettleStudentFinance={studentFinanceAccess.canSettle}
          onClose={() => setQuickActionMode(null)}
          onSelectPartner={handlePartnerSelection}
        />
      )}
    </div>
  );
};

export default DashboardPage;
