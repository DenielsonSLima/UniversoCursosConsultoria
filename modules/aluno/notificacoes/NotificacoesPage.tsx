import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  GraduationCap,
  Gift,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import {
  useAlunoNotificationDetail,
  useAlunoNotifications,
  useAlunoRelationshipBirthdayPreference,
} from './useAlunoNotifications';
import AlunoNotificationDetail from './AlunoNotificationDetail';
import FinancialUnderlineTabs from '../../gestor/financeiro/components/FinancialUnderlineTabs';
import type {
  AlunoNotification,
  AlunoNotificationCategory,
  AlunoNotificationFilter,
} from './notificacoes.types';

type NotificacoesPageProps = {
  alunoId: string;
  unreadCount: number;
  onNavigate: (deepLink: string) => void;
};

type CategoryPresentation = {
  label: string;
  icon: typeof Bell;
  iconClass: string;
  surfaceClass: string;
};

const CATEGORY_PRESENTATION: Record<AlunoNotificationCategory, CategoryPresentation> = {
  financial: {
    label: 'Financeiro',
    icon: CircleDollarSign,
    iconClass: 'text-emerald-700',
    surfaceClass: 'bg-emerald-50 ring-emerald-100',
  },
  academic: {
    label: 'Acadêmico',
    icon: GraduationCap,
    iconClass: 'text-blue-700',
    surfaceClass: 'bg-blue-50 ring-blue-100',
  },
  calendar: {
    label: 'Agenda',
    icon: CalendarDays,
    iconClass: 'text-violet-700',
    surfaceClass: 'bg-violet-50 ring-violet-100',
  },
  institutional: {
    label: 'Universo',
    icon: Megaphone,
    iconClass: 'text-amber-700',
    surfaceClass: 'bg-amber-50 ring-amber-100',
  },
  service: {
    label: 'Comunicado',
    icon: Bell,
    iconClass: 'text-cyan-700',
    surfaceClass: 'bg-cyan-50 ring-cyan-100',
  },
  marketing: {
    label: 'Novidade',
    icon: Megaphone,
    iconClass: 'text-pink-700',
    surfaceClass: 'bg-pink-50 ring-pink-100',
  },
};

const FILTERS: Array<{
  id: AlunoNotificationFilter;
  label: string;
  icon: typeof Bell;
}> = [
  { id: 'all', label: 'Todas', icon: Bell },
  { id: 'unread', label: 'Não lidas', icon: CheckCheck },
  { id: 'financial', label: 'Financeiro', icon: CircleDollarSign },
  { id: 'academic', label: 'Acadêmico', icon: GraduationCap },
  { id: 'institutional', label: 'Comunicados', icon: Megaphone },
];

const dayKey = (value: string) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const dayLabel = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return 'Hoje';
  if (dayKey(value) === dayKey(yesterday.toISOString())) return 'Ontem';
  const label = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const notificationTime = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const NotificationThumbnail = ({ url, title }: { url: string; title: string }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-16 w-20 shrink-0 rounded-xl object-cover ring-1 ring-slate-200 sm:h-20 sm:w-28"
      title={title}
    />
  );
};

const NotificacoesPage = ({ alunoId, unreadCount, onNavigate }: NotificacoesPageProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<AlunoNotificationFilter>('all');
  const detailReference = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      notificationId: params.get('notificationId'),
      sourceJobId: params.get('sourceJobId'),
    };
  }, [location.search]);
  const isDetailOpen = Boolean(detailReference.notificationId || detailReference.sourceJobId);
  const {
    notifications,
    loading,
    error,
    refetch,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore,
    markRead,
    markAllRead,
    markingAllRead,
    archive,
    archivingId,
  } = useAlunoNotifications(alunoId, filter);
  const {
    preference: relationshipPreference,
    loading: relationshipPreferenceLoading,
    error: relationshipPreferenceError,
    updating: relationshipPreferenceUpdating,
    update: updateRelationshipPreference,
    refetch: refetchRelationshipPreference,
  } = useAlunoRelationshipBirthdayPreference(alunoId);
  const {
    notification: detailNotification,
    loading: detailLoading,
    error: detailError,
    refetch: refetchDetail,
  } = useAlunoNotificationDetail(alunoId, detailReference);
  const markedDetailIdsRef = useRef(new Set<string>());

  // O portal usa um contêiner interno de rolagem. No WebView, o Safari pode
  // restaurar o scroll anterior depois da troca de rota e esconder o início
  // do hero sob o cabeçalho fixo. Reancoramos esta tela a cada navegação.
  useLayoutEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scrollContainer = pageRef.current?.parentElement;
      scrollContainer?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.key]);

  useEffect(() => {
    if (!detailNotification || detailNotification.readAt || markedDetailIdsRef.current.has(detailNotification.id)) {
      return;
    }
    markedDetailIdsRef.current.add(detailNotification.id);
    void markRead(detailNotification.id).catch((markError) => {
      markedDetailIdsRef.current.delete(detailNotification.id);
      console.warn('Não foi possível marcar a notificação como lida.', markError);
    });
  }, [detailNotification, markRead]);

  const groupedNotifications = useMemo(() => {
    const groups = new Map<string, { label: string; items: AlunoNotification[] }>();
    for (const notification of notifications) {
      const key = dayKey(notification.visibleAt);
      const label = dayLabel(notification.visibleAt);
      const group = groups.get(key);
      if (group) group.items.push(notification);
      else groups.set(key, { label, items: [notification] });
    }
    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  }, [notifications]);

  const openNotification = (notification: AlunoNotification) => {
    if (!notification.readAt) {
      markedDetailIdsRef.current.add(notification.id);
      void markRead(notification.id).catch((markError) => {
        markedDetailIdsRef.current.delete(notification.id);
        console.warn('Não foi possível marcar a notificação como lida.', markError);
      });
    }
    onNavigate(`/aluno/?module=notificacoes&notificationId=${encodeURIComponent(notification.id)}`);
  };

  const closeDetail = () => {
    navigate('/aluno/?module=notificacoes', { replace: true });
  };

  if (isDetailOpen) {
    if (detailLoading) {
      return (
        <div className="flex min-h-72 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 size={20} className="animate-spin text-blue-600" />
            Carregando notificação...
          </div>
        </div>
      );
    }

    if (detailError) {
      return (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-red-100 bg-white px-6 text-center">
          <Bell size={30} className="text-red-400" />
          <p className="mt-4 text-base font-black text-[#001a33]">Não foi possível abrir a notificação</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Verifique sua conexão e tente novamente.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={closeDetail}
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-[#001a33]"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void refetchDetail()}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wide text-white"
            >
              <RefreshCw size={15} /> Tentar novamente
            </button>
          </div>
        </div>
      );
    }

    if (!detailNotification) {
      return (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 text-center">
          <Bell size={30} className="text-slate-300" />
          <p className="mt-4 text-base font-black text-[#001a33]">Notificação não encontrada</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            Ela pode ter sido removida do seu histórico.
          </p>
          <button
            type="button"
            onClick={closeDetail}
            className="mt-5 min-h-10 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wide text-white"
          >
            Voltar às notificações
          </button>
        </div>
      );
    }

    return (
      <AlunoNotificationDetail
        notification={detailNotification}
        onBack={closeDetail}
        onOpenDestination={onNavigate}
      />
    );
  }

  return (
    <div ref={pageRef} className="mx-auto min-w-0 w-full max-w-5xl space-y-4 overflow-x-clip pb-4 sm:space-y-5">
      <section className="overflow-hidden rounded-[24px] bg-[#001a33] text-white shadow-xl shadow-slate-300/40 sm:rounded-[28px]">
        <div className="relative px-4 py-5 sm:px-7 sm:py-6">
          <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border-[30px] border-blue-500/10" />
          <div className="relative flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/40 sm:h-12 sm:w-12">
                <Bell size={21} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#001a33] bg-red-500 px-1 text-[10px] font-black">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300 sm:text-[11px] sm:tracking-[0.3em]">Central do aluno</p>
                <h1 className="mt-1 text-[1.65rem] font-black leading-none tracking-tight sm:text-3xl">Notificações</h1>
                <p className="mt-2 max-w-2xl text-[13px] font-semibold leading-relaxed text-slate-300 sm:text-sm">
                  Cobranças, pagamentos, aulas, feriados, aniversários e comunicados ficam salvos aqui.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0 || markingAllRead}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-[11px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-4 sm:text-xs"
            >
              {markingAllRead ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
              Marcar todas como lidas
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3.5 sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <MessageSquare size={19} className="mt-0.5 shrink-0 text-blue-700" />
            <div>
              <p className="text-sm font-black text-[#001a33]">Mensagens continuam no Atendimento</p>
              <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-600">
                Respostas de conversas não são duplicadas nesta lista.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/aluno/comunicacao')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm ring-1 ring-blue-100"
            aria-label="Abrir Atendimento"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-pink-100 bg-[linear-gradient(135deg,#fff7fb,#fff)] px-4 py-3.5 sm:px-5">
        {relationshipPreferenceLoading ? (
          <div className="flex min-h-10 items-center gap-3 text-xs font-bold text-slate-500">
            <Loader2 size={17} className="animate-spin text-pink-600" /> Carregando preferência de relacionamento...
          </div>
        ) : relationshipPreferenceError ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-rose-700">Não foi possível consultar esta preferência.</p>
            <button type="button" onClick={() => void refetchRelationshipPreference()} className="min-h-10 rounded-xl bg-white px-3 text-[10px] font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-100">
              Tentar novamente
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-pink-700">
              <Gift size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[#001a33]">
                Relacionamento e aniversários {relationshipPreference?.allowed
                  ? 'ativos'
                  : relationshipPreference?.configured
                    ? 'desativados'
                    : 'ainda não configurados'}
              </p>
              <p className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-600">
                {relationshipPreference?.allowed
                  ? 'Ativos por padrão desde o aceite dos Termos, sob legítimo interesse. Não incluem publicidade comercial ou perfilamento.'
                  : relationshipPreference?.configured
                    ? 'Você desativou esses comunicados. Isso não altera seu acesso e você pode reativá-los quando quiser.'
                    : 'Esta preferência ainda não foi definida. Você pode ativá-la aqui sem alterar seu acesso.'}
              </p>
            </div>
            <button
              type="button"
              disabled={relationshipPreferenceUpdating}
              onClick={() => void updateRelationshipPreference(!relationshipPreference?.allowed).catch(() => undefined)}
              className="min-h-10 shrink-0 rounded-xl px-2.5 text-[10px] font-black uppercase tracking-wide text-slate-500 transition-colors hover:bg-white hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-45 sm:px-3"
              aria-label={`${relationshipPreference?.allowed ? 'Desativar' : 'Ativar'} comunicados de relacionamento e aniversário`}
            >
              {relationshipPreferenceUpdating
                ? <Loader2 size={15} className="animate-spin" />
                : relationshipPreference?.allowed ? 'Desativar' : 'Ativar'}
            </button>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:hidden" role="tablist" aria-label="Filtrar notificações por categoria">
        {FILTERS.map((item) => {
          const Icon = item.icon;
          const isActive = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(item.id)}
              className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-[10px] font-black uppercase tracking-wide transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 shadow-sm'
                  : 'text-slate-500 active:bg-slate-50'
              }`}
            >
              <Icon size={14} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="hidden rounded-2xl border border-slate-200 bg-white px-4 pt-2 shadow-sm sm:block sm:px-5">
        <FinancialUnderlineTabs
          items={FILTERS.map((item) => {
            const Icon = item.icon;
            return {
              id: item.id,
              label: item.label,
              icon: <Icon size={15} />,
            };
          })}
          value={filter}
          onChange={setFilter}
          ariaLabel="Filtrar notificações por categoria"
        />
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 size={20} className="animate-spin text-blue-600" />
            Carregando notificações...
          </div>
        </div>
      ) : error && notifications.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-3xl border border-red-100 bg-white px-6 text-center">
          <Bell size={30} className="text-red-400" />
          <p className="mt-4 text-base font-black text-[#001a33]">Não foi possível carregar as notificações</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">Verifique sua conexão e tente novamente.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wide text-white"
          >
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50 text-slate-300">
            <Bell size={30} />
          </div>
          <p className="mt-5 text-lg font-black text-[#001a33]">
            {filter === 'unread' ? 'Tudo lido por aqui' : 'Nenhuma notificação nesta categoria'}
          </p>
          <p className="mt-1 max-w-md text-sm font-semibold leading-relaxed text-slate-500">
            Quando houver uma atualização importante, ela ficará disponível neste histórico.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedNotifications.map(({ key, label, items }) => (
            <section key={key}>
              <div className="mb-2.5 flex items-center gap-3 px-1">
                <h2 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</h2>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="space-y-2.5">
                {items.map((notification) => {
                  const presentation = CATEGORY_PRESENTATION[notification.category];
                  const Icon = presentation.icon;
                  const isUnread = !notification.readAt;
                  return (
                    <article
                      key={notification.id}
                      className={`relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
                        isUnread ? 'border-blue-200' : 'border-slate-200'
                      }`}
                    >
                      {isUnread ? <span className="absolute inset-y-0 left-0 w-1 bg-blue-600" /> : null}
                      <button
                        type="button"
                        onClick={() => openNotification(notification)}
                        className="flex w-full items-start gap-3.5 py-4 pl-4 pr-14 text-left sm:gap-4 sm:p-5 sm:pr-16"
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${presentation.surfaceClass} ${presentation.iconClass}`}>
                          <Icon size={20} />
                        </span>
                        {notification.imageUrl ? (
                          <NotificationThumbnail url={notification.imageUrl} title={notification.title} />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={`text-sm text-[#001a33] ${isUnread ? 'font-black' : 'font-bold'}`}>
                              {notification.title}
                            </span>
                            {isUnread ? (
                              <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Não lida" />
                            ) : null}
                          </span>
                          <span className="mt-1 block text-sm font-medium leading-relaxed text-slate-600">
                            {notification.body}
                          </span>
                          <span className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                            <span className={`rounded-full px-2 py-1 ${presentation.surfaceClass} ${presentation.iconClass}`}>
                              {presentation.label}
                            </span>
                            <span>{notificationTime(notification.visibleAt)}</span>
                            {notification.readAt ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <Check size={12} /> Lida
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <ChevronRight size={18} className="mt-3 shrink-0 text-slate-300" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void archive(notification.id)}
                        disabled={archivingId === notification.id}
                        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 sm:right-4 sm:top-4"
                        aria-label="Ocultar notificação do histórico"
                        title="Ocultar do histórico"
                      >
                        {archivingId === notification.id ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          {hasMore || loadMoreError ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
              {loadMoreError ? (
                <p className="text-center text-xs font-bold text-rose-600">
                  Não foi possível carregar a próxima página. As notificações já exibidas foram preservadas.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore || !hasMore}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 text-xs font-black uppercase tracking-wide text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
                {loadingMore ? 'Carregando mais…' : loadMoreError ? 'Tentar novamente' : 'Carregar mais'}
              </button>
            </div>
          ) : notifications.length > 20 ? (
            <p className="py-2 text-center text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
              Fim do histórico carregado
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default NotificacoesPage;
