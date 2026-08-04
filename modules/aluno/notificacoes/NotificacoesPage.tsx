import { useMemo, useState } from 'react';
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  CircleDollarSign,
  GraduationCap,
  Loader2,
  Megaphone,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { useAlunoNotifications } from './useAlunoNotifications';
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

const FILTERS: Array<{ id: AlunoNotificationFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'unread', label: 'Não lidas' },
  { id: 'financial', label: 'Financeiro' },
  { id: 'academic', label: 'Acadêmico' },
  { id: 'institutional', label: 'Comunicados' },
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

const NotificacoesPage = ({ alunoId, unreadCount, onNavigate }: NotificacoesPageProps) => {
  const [filter, setFilter] = useState<AlunoNotificationFilter>('all');
  const {
    notifications,
    loading,
    error,
    refetch,
    markRead,
    markAllRead,
    markingAllRead,
    archive,
    archivingId,
  } = useAlunoNotifications(alunoId, filter);

  const groupedNotifications = useMemo(() => {
    const groups = new Map<string, AlunoNotification[]>();
    for (const notification of notifications) {
      const label = dayLabel(notification.visibleAt);
      groups.set(label, [...(groups.get(label) || []), notification]);
    }
    return [...groups.entries()];
  }, [notifications]);

  const openNotification = async (notification: AlunoNotification) => {
    try {
      if (!notification.readAt) await markRead(notification.id);
    } catch (markError) {
      console.warn('Não foi possível marcar a notificação como lida.', markError);
    } finally {
      onNavigate(notification.deepLink);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-4">
      <section className="overflow-hidden rounded-[28px] bg-[#001a33] text-white shadow-xl shadow-slate-300/40">
        <div className="relative px-5 py-6 sm:px-7">
          <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full border-[30px] border-blue-500/10" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-950/40">
                <Bell size={23} />
                {unreadCount > 0 ? (
                  <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#001a33] bg-red-500 px-1 text-[10px] font-black">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-300">Central do aluno</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Notificações</h1>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-slate-300">
                  Cobranças, pagamentos, aulas, feriados, aniversários e comunicados ficam salvos aqui.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0 || markingAllRead}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-xs font-black uppercase tracking-wide text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
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

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`min-h-10 rounded-xl px-4 text-xs font-black transition-colors ${
                filter === item.id
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-[#001a33]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-3xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 size={20} className="animate-spin text-blue-600" />
            Carregando notificações...
          </div>
        </div>
      ) : error ? (
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
          {groupedNotifications.map(([label, items]) => (
            <section key={label}>
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
                        onClick={() => void openNotification(notification)}
                        className="flex w-full items-start gap-3.5 py-4 pl-4 pr-14 text-left sm:gap-4 sm:p-5 sm:pr-16"
                      >
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${presentation.surfaceClass} ${presentation.iconClass}`}>
                          <Icon size={20} />
                        </span>
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
        </div>
      )}
    </div>
  );
};

export default NotificacoesPage;
