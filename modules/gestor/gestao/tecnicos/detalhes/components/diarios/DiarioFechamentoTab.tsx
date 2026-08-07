import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  LockKeyhole,
  RotateCcw,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import { DiarioClosureState, DiarioLockScope } from './diario-classe.types';

interface DiarioFechamentoTabProps {
  state: DiarioClosureState;
  accessMode: 'GESTOR' | 'PROFESSOR';
  saving: boolean;
  onChange: (
    bloqueio: DiarioLockScope,
    motivo?: string,
    confirmarPendencias?: boolean,
  ) => void;
}

const labels = {
  EM_ANDAMENTO: 'Em andamento',
  AGUARDANDO_REVISAO: 'Aguardando revisão',
  EM_REVISAO: 'Em revisão',
  FECHADO: 'Fechado',
};

const DiarioFechamentoTab: React.FC<DiarioFechamentoTabProps> = ({
  state,
  accessMode,
  saving,
  onChange,
}) => {
  const [motivo, setMotivo] = useState('');
  const [showPendingConfirmation, setShowPendingConfirmation] = useState(false);
  const complete = state.progresso_percent >= 100;
  const isGestor = accessMode === 'GESTOR';
  const requestTotalClose = () => {
    if (state.pode_fechar) {
      onChange('TOTAL', motivo);
      return;
    }
    setShowPendingConfirmation(true);
  };

  useEffect(() => {
    if (!showPendingConfirmation) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setShowPendingConfirmation(false);
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [saving, showPendingConfirmation]);

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="rounded-2xl bg-white p-3 text-blue-700 shadow-sm"><ShieldCheck size={22} /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Situação do diário</p>
              <h4 className="mt-1 text-xl font-black text-[#001a33]">{labels[state.status]}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {state.horas_realizadas}h lançadas de {state.carga_horaria}h.
              </p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${
            state.status === 'FECHADO' ? 'bg-slate-200 text-slate-700'
              : state.status === 'EM_REVISAO' ? 'bg-amber-100 text-amber-800'
                : complete ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
          }`}>{state.progresso_percent}% da carga</span>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${state.progresso_percent}%` }} />
        </div>
      </section>

      {!complete && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
          O fechamento será liberado quando a carga horária atingir 100%.
        </div>
      )}

      {complete && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className={`rounded-2xl border p-4 ${
            state.frequencias_pendentes > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Frequências pendentes
            </p>
            <p className="mt-1 text-2xl font-black text-[#001a33]">{state.frequencias_pendentes}</p>
          </div>
          <div className={`rounded-2xl border p-4 ${
            state.notas_pendentes > 0
              ? 'border-amber-200 bg-amber-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
              Notas pendentes
            </p>
            <p className="mt-1 text-2xl font-black text-[#001a33]">{state.notas_pendentes}</p>
          </div>
        </section>
      )}

      {complete && !state.pode_fechar && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-900">
          A Gestão pode travar o professor para revisar, mas o fechamento total só será liberado
          depois que todas as frequências e notas dos alunos ativos estiverem preenchidas.
        </div>
      )}

      {isGestor && (
        <textarea
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          placeholder="Observação ou motivo da reabertura (opcional)"
          className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-blue-500"
        />
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {accessMode === 'PROFESSOR' && state.bloqueio === 'ABERTO' && (
          <button disabled={!complete || saving} onClick={() => onChange('PROFESSOR')}
            className="col-span-full flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-5 py-4 text-xs font-black uppercase text-white disabled:opacity-40">
            <Send size={16} /> Enviar para revisão
          </button>
        )}
        {accessMode === 'PROFESSOR' && state.bloqueio !== 'ABERTO' && (
          <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-5 text-center text-xs font-bold text-slate-600">
            <LockKeyhole className="mx-auto mb-2 text-slate-500" size={20} />
            O diário está bloqueado para o professor. A Gestão pode revisar, fechar ou reabrir.
          </div>
        )}
        {isGestor && state.bloqueio === 'ABERTO' && (
          <>
            <button disabled={!complete || saving} onClick={() => onChange('PROFESSOR', motivo)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs font-black uppercase text-amber-800 disabled:opacity-40">
              <LockKeyhole size={16} /> Travar professor
            </button>
            <button disabled={!complete || saving} onClick={requestTotalClose}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-5 py-4 text-xs font-black uppercase text-white disabled:opacity-40">
              <CheckCircle2 size={16} /> Fechar para todos
            </button>
          </>
        )}
        {isGestor && state.bloqueio === 'PROFESSOR' && (
          <>
            <button disabled={saving} onClick={() => onChange('ABERTO', motivo)}
              className="flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-xs font-black uppercase text-blue-700 disabled:opacity-40">
              <RotateCcw size={16} /> Liberar professor
            </button>
            <button disabled={saving} onClick={requestTotalClose}
              className="flex items-center justify-center gap-2 rounded-2xl bg-[#001a33] px-5 py-4 text-xs font-black uppercase text-white disabled:opacity-40">
              <CheckCircle2 size={16} /> Fechar para todos
            </button>
          </>
        )}
        {isGestor && state.bloqueio === 'TOTAL' && (
          <button disabled={saving} onClick={() => onChange('ABERTO', motivo)}
            className="col-span-full flex items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-xs font-black uppercase text-blue-700 disabled:opacity-40">
            <RotateCcw size={16} /> Reabrir diário
          </button>
        )}
      </div>

      {showPendingConfirmation && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex min-h-[100dvh] w-screen items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setShowPendingConfirmation(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-fechamento-title"
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-3">
                <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h4 id="confirmar-fechamento-title" className="text-lg font-black text-[#001a33]">
                    Fechar diário com pendências?
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    Ainda existem <strong>{state.frequencias_pendentes} frequências</strong> e{' '}
                    <strong>{state.notas_pendentes} notas</strong> sem lançamento.
                    Ao confirmar, professor e Gestão não poderão editar o diário até uma reabertura.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Cancelar fechamento"
                onClick={() => setShowPendingConfirmation(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => setShowPendingConfirmation(false)}
                className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase text-slate-600 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setShowPendingConfirmation(false);
                  onChange('TOTAL', motivo, true);
                }}
                className="rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase text-white disabled:opacity-40"
              >
                Confirmar fechamento
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default DiarioFechamentoTab;
