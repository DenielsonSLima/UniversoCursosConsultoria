import { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CircleDollarSign,
  ExternalLink,
  GraduationCap,
  Megaphone,
} from 'lucide-react';
import type { AlunoNotification, AlunoNotificationCategory } from './notificacoes.types';

type Props = {
  notification: AlunoNotification;
  onBack: () => void;
  onOpenDestination: (destination: string) => void;
};

const CATEGORY_UI: Record<AlunoNotificationCategory, {
  label: string;
  icon: typeof Bell;
  iconClass: string;
  surfaceClass: string;
}> = {
  financial: { label: 'Financeiro', icon: CircleDollarSign, iconClass: 'text-emerald-700', surfaceClass: 'bg-emerald-50 ring-emerald-100' },
  academic: { label: 'Acadêmico', icon: GraduationCap, iconClass: 'text-blue-700', surfaceClass: 'bg-blue-50 ring-blue-100' },
  calendar: { label: 'Agenda', icon: CalendarDays, iconClass: 'text-violet-700', surfaceClass: 'bg-violet-50 ring-violet-100' },
  institutional: { label: 'Universo', icon: Megaphone, iconClass: 'text-amber-700', surfaceClass: 'bg-amber-50 ring-amber-100' },
  service: { label: 'Comunicado', icon: Bell, iconClass: 'text-cyan-700', surfaceClass: 'bg-cyan-50 ring-cyan-100' },
  marketing: { label: 'Novidade', icon: Megaphone, iconClass: 'text-pink-700', surfaceClass: 'bg-pink-50 ring-pink-100' },
};

const detailDate = (value: string) => new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
}).format(new Date(value));

const destinationAction = (notification: AlunoNotification) => {
  try {
    const url = new URL(notification.deepLink, window.location.origin);
    const module = url.searchParams.get('module');
    if (url.pathname === '/aluno/comunicacao' || module === 'comunicacao') {
      return { label: 'Abrir Atendimento', destination: notification.deepLink };
    }
    if (module === 'financeiro') {
      return { label: 'Abrir Financeiro', destination: notification.deepLink };
    }
    if (module === 'calendario') {
      return { label: 'Abrir Agenda', destination: notification.deepLink };
    }
    if (module === 'cursos' || module === 'turmas') {
      return { label: 'Abrir meus cursos', destination: notification.deepLink };
    }
    if (module && module !== 'inicio' && module !== 'notificacoes') {
      return { label: 'Abrir conteúdo relacionado', destination: notification.deepLink };
    }
    return null;
  } catch {
    return null;
  }
};

const NotificationImage = ({ url, title }: { url: string; title: string }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className="border-b border-slate-100 bg-slate-50 p-3 sm:p-4">
      <img
        src={url}
        alt={`Imagem da notificação: ${title}`}
        onError={() => setFailed(true)}
        className="mx-auto max-h-[420px] w-full rounded-2xl object-cover shadow-sm ring-1 ring-slate-200"
      />
    </div>
  );
};

const AlunoNotificationDetail = ({ notification, onBack, onOpenDestination }: Props) => {
  const presentation = CATEGORY_UI[notification.category];
  const Icon = presentation.icon;
  const action = destinationAction(notification);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-black text-[#001a33] shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50"
      >
        <ArrowLeft size={18} /> Voltar às notificações
      </button>

      <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
        <header className="relative overflow-hidden bg-[#001a33] px-5 py-6 text-white sm:px-7 sm:py-8">
          <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full border-[34px] border-blue-500/10" />
          <div className="relative flex items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ring-1 ${presentation.surfaceClass} ${presentation.iconClass}`}>
              <Icon size={22} />
            </span>
            <div className="min-w-0">
              <span className="inline-flex rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100">
                {presentation.label}
              </span>
              <h1 className="mt-3 text-xl font-black leading-tight tracking-tight sm:text-2xl">
                {notification.title}
              </h1>
            </div>
          </div>
        </header>

        {notification.imageUrl ? (
          <NotificationImage url={notification.imageUrl} title={notification.title} />
        ) : null}

        <div className="px-5 py-6 sm:px-7 sm:py-8">
          <p className="whitespace-pre-wrap text-base font-semibold leading-7 text-slate-700">
            {notification.body}
          </p>

          <div className="mt-7 flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs font-bold text-slate-400">
              <p>{detailDate(notification.visibleAt)}</p>
              <p className={`mt-1 inline-flex items-center gap-1 ${
                notification.readAt ? 'text-emerald-600' : 'text-slate-500'
              }`}>
                <Check size={13} />
                {notification.readAt ? 'Notificação lida' : 'Ainda não marcada como lida'}
              </p>
            </div>
            {action ? (
              <button
                type="button"
                onClick={() => onOpenDestination(action.destination)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700"
              >
                {action.label} <ExternalLink size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </article>
    </div>
  );
};

export default AlunoNotificationDetail;
