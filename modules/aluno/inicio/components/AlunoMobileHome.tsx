import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GraduationCap,
  Image as ImageIcon,
  MessageCircle,
  Play,
  WalletCards,
} from 'lucide-react';

import type { StudentCourseAccessItem } from '../../cursos/courseAccessHistory';

type MobileUpcomingEvent = {
  id: string;
  date: string;
  title: string;
  subtitle: string;
  detail: string;
};

type MobileFinanceSummary = {
  nextPayment?: {
    data_vencimento?: string | null;
    descricao?: string | null;
    valor?: number | string | null;
  } | null;
  overdueCount?: number;
  overdueTotal?: number;
  openTotal?: number;
};

type AlunoMobileHomeProps = {
  bibliotecaCount: number;
  canViewCalendar: boolean;
  chatsCount: number;
  financeiroResumo?: MobileFinanceSummary;
  loadingFinanceiro: boolean;
  loadingProximosEventos: boolean;
  matriculasCount: number;
  primaryCourse?: StudentCourseAccessItem;
  proximosEventos: MobileUpcomingEvent[];
  onNavigate: (module: string) => void;
  onOpenCourse: (course: StudentCourseAccessItem) => void;
};

const normalizeModality = (value?: string | null) => {
  const modality = String(value || '').toUpperCase();
  if (modality === 'TECNICO' || modality === 'TÉCNICO') return 'Técnico';
  if (modality === 'ESPECIALIZACAO' || modality === 'ESPECIALIZAÇÃO') return 'Especialização';
  if (modality === 'LIVRE') return 'Curso livre';
  if (modality === 'EAD') return 'EAD';
  return 'Seu curso';
};

const formatCurrency = (value?: number | string | null) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(Number(value || 0));

const formatDate = (dateStr?: string | null) => {
  if (!dateStr) return 'Sem vencimento';
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}`;
};

const formatEventDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) return { day: '--', month: '---' };
  const date = new Date(year, month - 1, day);
  return {
    day: String(day).padStart(2, '0'),
    month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '').toUpperCase(),
  };
};

const AlunoMobileHome = ({
  bibliotecaCount,
  canViewCalendar,
  chatsCount,
  financeiroResumo,
  loadingFinanceiro,
  loadingProximosEventos,
  matriculasCount,
  primaryCourse,
  proximosEventos,
  onNavigate,
  onOpenCourse,
}: AlunoMobileHomeProps) => {
  const nextEvent = proximosEventos[0];
  const eventDate = nextEvent ? formatEventDate(nextEvent.date) : null;
  const hasOverduePayment = Number(financeiroResumo?.overdueCount || 0) > 0;
  const hasOpenPayment = Boolean(financeiroResumo?.nextPayment);

  return (
    <div className="space-y-4 md:hidden">
      <section className="relative overflow-hidden rounded-[1.75rem] bg-[#001a33] px-5 pb-5 pt-5 text-white shadow-[0_18px_45px_rgba(0,26,51,0.18)]">
        <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full border-[26px] border-blue-500/15" />
        <div className="pointer-events-none absolute -bottom-16 right-16 h-28 w-28 rounded-full bg-blue-500/15 blur-2xl" />

        <div className="relative flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-300">Sua jornada</p>
            <h1 className="mt-1 text-xl font-black tracking-tight">Continuar estudando</h1>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('turmas')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-blue-100 active:bg-white/20"
            aria-label="Ver todos os meus cursos"
          >
            <ArrowRight size={18} />
          </button>
        </div>

        {primaryCourse ? (
          <div className="relative mt-5 flex gap-4">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-[1.35rem] border border-white/10 bg-white/10 shadow-lg">
              {primaryCourse.imagemUrl ? (
                <img
                  src={primaryCourse.imagemUrl}
                  alt=""
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-blue-200/60">
                  <ImageIcon size={26} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 py-0.5">
              <span className="inline-flex rounded-full bg-blue-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-200">
                {normalizeModality(primaryCourse.modalidade)}
              </span>
              <h2 className="mt-2 line-clamp-2 text-[15px] font-black leading-snug">{primaryCourse.cursoNome}</h2>
              <p className="mt-1 line-clamp-1 text-[10px] font-semibold text-slate-300">
                {primaryCourse.turmaNome || 'Acesso disponível'}
              </p>
              <button
                type="button"
                onClick={() => onOpenCourse(primaryCourse)}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-white shadow-lg shadow-blue-950/30 active:bg-blue-500"
              >
                <Play size={13} fill="currentColor" />
                Continuar
              </button>
            </div>
          </div>
        ) : (
          <div className="relative mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-blue-200">
                <GraduationCap size={21} />
              </div>
              <div>
                <p className="text-sm font-black">Nenhum curso liberado</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-300">Seu acesso aparecerá aqui após a liberação.</p>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <CalendarDays size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Próximo</p>
              <h2 className="mt-0.5 text-sm font-black text-[#001a33]">Sua agenda</h2>
            </div>
          </div>
          {canViewCalendar ? (
            <button
              type="button"
              onClick={() => onNavigate('calendario')}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-500 active:bg-indigo-50 active:text-indigo-700"
              aria-label="Abrir agenda"
            >
              <ChevronRight size={18} />
            </button>
          ) : null}
        </div>

        {loadingProximosEventos ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-[11px] font-bold text-slate-400" aria-live="polite">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent motion-reduce:animate-none" />
            Carregando seus próximos eventos...
          </div>
        ) : nextEvent && eventDate ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <div className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-white shadow-sm">
              <span className="text-lg font-black leading-none text-[#001a33]">{eventDate.day}</span>
              <span className="mt-1 text-[10px] font-black tracking-wider text-indigo-600">{eventDate.month}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-xs font-black text-[#001a33]">{nextEvent.title}</p>
              <p className="mt-1 line-clamp-1 text-[10px] font-semibold text-slate-500">{nextEvent.subtitle}</p>
              {nextEvent.detail ? <p className="mt-1 line-clamp-1 text-[10px] font-bold text-indigo-600">{nextEvent.detail}</p> : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
            <Clock3 size={18} className="shrink-0 text-slate-300" />
            <p className="text-[11px] font-semibold text-slate-500">Nenhuma aula futura encontrada.</p>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={() => onNavigate('financeiro')}
        className={`flex w-full items-center gap-3 rounded-[1.5rem] border p-4 text-left shadow-sm transition-colors ${
          hasOverduePayment
            ? 'border-rose-200 bg-rose-50'
            : hasOpenPayment
              ? 'border-blue-100 bg-white'
              : 'border-emerald-100 bg-emerald-50/60'
        }`}
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
          hasOverduePayment ? 'bg-white text-rose-600' : hasOpenPayment ? 'bg-blue-50 text-blue-600' : 'bg-white text-emerald-600'
        }`}>
          {hasOverduePayment ? <AlertTriangle size={20} /> : hasOpenPayment ? <WalletCards size={20} /> : <CheckCircle2 size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Financeiro</p>
          <p className="mt-0.5 truncate text-sm font-black text-[#001a33]">
            {loadingFinanceiro
              ? 'Consultando sua situação...'
              : hasOverduePayment
                ? `${financeiroResumo?.overdueCount} pagamento(s) em atraso`
                : hasOpenPayment
                  ? `${formatCurrency(financeiroResumo?.nextPayment?.valor)} • vence ${formatDate(financeiroResumo?.nextPayment?.data_vencimento)}`
                  : 'Tudo em dia'}
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-slate-400" />
      </button>

      <section aria-label="Resumo do portal" className="grid grid-cols-3 overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-sm">
        <button type="button" onClick={() => onNavigate('turmas')} className="flex min-h-[5.25rem] flex-col items-center justify-center px-2 text-center active:bg-blue-50">
          <GraduationCap size={18} className="text-blue-600" />
          <strong className="mt-1 text-lg font-black leading-none text-[#001a33]">{matriculasCount}</strong>
          <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Cursos</span>
        </button>
        <button type="button" onClick={() => onNavigate('biblioteca')} className="flex min-h-[5.25rem] flex-col items-center justify-center border-x border-slate-100 px-2 text-center active:bg-indigo-50">
          <BookOpen size={18} className="text-indigo-600" />
          <strong className="mt-1 text-lg font-black leading-none text-[#001a33]">{bibliotecaCount}</strong>
          <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Biblioteca</span>
        </button>
        <button type="button" onClick={() => onNavigate('comunicacao')} className="flex min-h-[5.25rem] flex-col items-center justify-center px-2 text-center active:bg-amber-50">
          <MessageCircle size={18} className="text-amber-600" />
          <strong className="mt-1 text-lg font-black leading-none text-[#001a33]">{chatsCount}</strong>
          <span className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-400">Mensagens</span>
        </button>
      </section>

      <button
        type="button"
        onClick={() => onNavigate('comunicacao')}
        className="flex min-h-14 w-full items-center justify-between rounded-[1.35rem] bg-[#001a33] px-4 text-left text-white shadow-sm active:bg-slate-900"
      >
        <div className="flex items-center gap-3">
          <MessageCircle size={18} className="text-blue-300" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">Atendimento</p>
            <p className="mt-0.5 text-xs font-bold">Precisa de ajuda? Fale com a equipe.</p>
          </div>
        </div>
        <ChevronRight size={17} className="shrink-0 text-blue-200" />
      </button>
    </div>
  );
};

export default AlunoMobileHome;
