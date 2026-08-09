import React from 'react';
import { CalendarClock, CheckCircle2, Clock3, Loader2, ReceiptText, RefreshCw, X } from 'lucide-react';
import { Turma } from '../../../../gestao.types';
import type {
  MatriculaTecnicaRegra,
  MatriculaTecnicaRegraIdentidade,
} from '../financeiro/matricula-tecnica-financeiro.types';
import { useAccessibleDialog } from '../financeiro/hooks/useAccessibleDialog';

export type EnrollmentFinanceIntent = 'PENDENTE' | 'AGORA' | 'AGENDADA';

interface ConfirmarMatriculaModalProps {
  turma: Turma;
  student: { nome: string };
  regra?: MatriculaTecnicaRegraIdentidade;
  canManageFinanceiro: boolean;
  intent: EnrollmentFinanceIntent;
  primeiroVencimento: string;
  ativarEm: string;
  loading: boolean;
  error: boolean;
  retrying: boolean;
  isPending: boolean;
  onIntentChange: (intent: EnrollmentFinanceIntent) => void;
  onPrimeiroVencimentoChange: (value: string) => void;
  onAtivarEmChange: (value: string) => void;
  onRetry: () => void;
  onClose: () => void;
  onConfirm: () => void;
}

const formatMoney = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parsed)
    : value;
};

const intentOptions: Array<{
  value: EnrollmentFinanceIntent;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    value: 'PENDENTE',
    title: 'Deixar pendente',
    description: 'Cria somente o vínculo. Nenhuma cobrança será gerada.',
    icon: <Clock3 size={18} />,
  },
  {
    value: 'AGORA',
    title: 'Gerar agora',
    description: 'Após o vínculo, o servidor cria apenas o título inicial.',
    icon: <ReceiptText size={18} />,
  },
  {
    value: 'AGENDADA',
    title: 'Agendar',
    description: 'Após o vínculo, deixa a geração programada para a data informada.',
    icon: <CalendarClock size={18} />,
  },
];

const ConfirmarMatriculaModal: React.FC<ConfirmarMatriculaModalProps> = ({
  turma,
  student,
  regra,
  canManageFinanceiro,
  intent,
  primeiroVencimento,
  ativarEm,
  loading,
  error,
  retrying,
  isPending,
  onIntentChange,
  onPrimeiroVencimentoChange,
  onAtivarEmChange,
  onRetry,
  onClose,
  onConfirm,
}) => {
  const { dialogRef, initialFocusRef } = useAccessibleDialog(true, onClose, isPending);
  const regraCompleta = regra && 'valorMatricula' in regra
    ? regra as MatriculaTecnicaRegra
    : null;
  return (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmar-matricula-title"
      tabIndex={-1}
      className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl"
    >
      <div className="flex shrink-0 items-start justify-between bg-[#001a33] p-6 text-white">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-300">Pré-vínculo financeiro técnico</p>
          <h3 id="confirmar-matricula-title" className="mt-1 text-xl font-black">{student.nome}</h3>
          <p className="mt-1 text-xs font-semibold text-blue-200">{turma.codigo || turma.nome}</p>
        </div>
        <button ref={(node) => { initialFocusRef.current = node; }} type="button" onClick={onClose} disabled={isPending} className="rounded-full p-2 text-blue-200 hover:bg-white/10 disabled:opacity-50" aria-label="Fechar">
          <X size={18} />
        </button>
      </div>

      <div className="overflow-y-auto p-6">
        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 className="animate-spin text-blue-600" size={22} /> Carregando regra oficial da turma...
          </div>
        ) : error || !regra ? (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-6 text-center">
            <p className="text-sm font-black text-rose-800">Regra financeira indisponível</p>
            <p className="mt-1 text-xs font-semibold text-rose-600">A matrícula foi bloqueada para não usar valores ou vencimentos antigos.</p>
            <button type="button" onClick={onRetry} disabled={retrying} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-2 text-[10px] font-black uppercase text-rose-700 disabled:opacity-50">
              <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} /> Tentar novamente
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-blue-700">
                <CheckCircle2 size={15} /> Regra vigente · revisão {regra.revisao}
              </p>
              {canManageFinanceiro && regraCompleta ? <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-white p-3"><span className="block text-[9px] font-black uppercase text-slate-400">Matrícula</span><strong className="text-sm text-[#001a33]">{formatMoney(regraCompleta.valorMatricula)}</strong></div>
                <div className="rounded-xl bg-white p-3"><span className="block text-[9px] font-black uppercase text-slate-400">Mensalidade</span><strong className="text-sm text-[#001a33]">{formatMoney(regraCompleta.valorMensalidade)}</strong></div>
                <div className="rounded-xl bg-white p-3"><span className="block text-[9px] font-black uppercase text-slate-400">Rematrícula</span><strong className="text-sm text-[#001a33]">{formatMoney(regraCompleta.valorRematricula)}</strong></div>
              </div> : null}
              <p className="mt-3 text-[10px] font-semibold text-blue-700">
                Ciclo e vencimentos serão validados e derivados pelo servidor. Esta tela não altera valores nem parcelas.
              </p>
            </div>

            <fieldset>
              <legend className="text-[10px] font-black uppercase tracking-wider text-slate-500">O que fazer após vincular?</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {intentOptions.filter((option) => canManageFinanceiro || option.value === 'PENDENTE').map((option) => (
                  <label key={option.value} className={`cursor-pointer rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-500 has-[:focus-visible]:ring-offset-2 ${intent === option.value ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-600 hover:border-blue-200'}`}>
                    <input type="radio" name="finance-intent" value={option.value} checked={intent === option.value} onChange={() => onIntentChange(option.value)} className="sr-only" />
                    <span className="flex items-center gap-2 text-xs font-black uppercase">{option.icon}{option.title}</span>
                    <span className="mt-2 block text-[10px] font-semibold leading-relaxed">{option.description}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {canManageFinanceiro ? <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Primeiro vencimento (opcional)</span>
                <input type="date" value={primeiroVencimento} onChange={(event) => onPrimeiroVencimentoChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500" />
                <span className="block text-[10px] font-semibold text-slate-400">Sugestão oficial: {regra.primeiroVencimentoSugerido}.</span>
              </label>
              {intent === 'AGENDADA' ? (
                <label className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Gerar em</span>
                  <input type="datetime-local" value={ativarEm} onChange={(event) => onAtivarEmChange(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500" />
                  <span className="block text-[10px] font-semibold text-slate-400">O servidor valida o agendamento e o título permanece ausente até a execução.</span>
                </label>
              ) : <div />}
            </div> : (
              <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-600">
                Seu acesso permite o pré-vínculo acadêmico sem cobrança. Geração e agendamento ficam disponíveis somente para quem possui acesso à aba Financeiro.
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} disabled={isPending} className="flex-1 rounded-xl border border-slate-200 py-3 text-xs font-black uppercase text-slate-500 disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={onConfirm} disabled={isPending || (intent === 'AGENDADA' && !ativarEm)} className="flex-[1.5] rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                {isPending ? 'Processando...' : intent === 'PENDENTE' ? 'Vincular sem cobrança' : intent === 'AGORA' ? 'Vincular e gerar agora' : 'Vincular e agendar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

export default ConfirmarMatriculaModal;
