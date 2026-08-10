import React, { useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { createFinanceiroRequestId } from './hooks/useMatriculaTecnicaFinanceiro';
import {
  useRedefineTechnicalConditionCode,
  useTechnicalConditionCodeStatus,
} from './hooks/useTechnicalConditionAuthorization';

interface TechnicalConditionCodeSettingsProps {
  turmaId: string;
}

const TechnicalConditionCodeSettings: React.FC<TechnicalConditionCodeSettingsProps> = ({ turmaId }) => {
  const statusQuery = useTechnicalConditionCodeStatus(turmaId);
  const redefineMutation = useRedefineTechnicalConditionCode();
  const [editing, setEditing] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [error, setError] = useState('');
  const requestIds = useRef(new Map<string, string>());
  const validCode = codigo.length >= 8 && codigo.length <= 32 && /[A-Za-z]/.test(codigo) && /[0-9]/.test(codigo);

  const resetDraft = () => {
    setEditing(false);
    setShowCode(false);
    setCodigo('');
    setConfirmacao('');
    setJustificativa('');
    setError('');
  };

  const save = async () => {
    if (!validCode) {
      setError('Use de 8 a 32 caracteres, com pelo menos uma letra e um número.');
      return;
    }
    if (codigo !== confirmacao) {
      setError('A confirmação do novo código não confere.');
      return;
    }
    if (justificativa.trim().length < 5) {
      setError('Informe por que o código está sendo definido ou alterado.');
      return;
    }
    const key = JSON.stringify({ turmaId, codigo, justificativa: justificativa.trim() });
    const requestId = requestIds.current.get(key) || createFinanceiroRequestId();
    requestIds.current.set(key, requestId);
    try {
      await redefineMutation.mutateAsync({ turmaId, requestId, codigo, justificativa: justificativa.trim() });
      requestIds.current.delete(key);
      resetDraft();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'O servidor não confirmou a redefinição.');
    }
  };

  return (
    <section className="rounded-2xl border border-violet-100 bg-violet-50/60 p-5" aria-labelledby="condition-code-settings-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><ShieldCheck size={19} /></span>
          <div>
            <p id="condition-code-settings-title" className="text-xs font-black uppercase tracking-wide text-[#001a33]">Autorização de condição individual</p>
            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-600">Protege bolsa, incentivo, convênio ou valor especial. O código atual nunca é exibido; somente pode ser redefinido.</p>
          </div>
        </div>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} disabled={statusQuery.isLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-[10px] font-black uppercase text-violet-700 disabled:opacity-50">
            <RefreshCw size={14} /> {statusQuery.data?.configurado ? 'Redefinir código' : 'Definir código'}
          </button>
        ) : null}
      </div>

      {statusQuery.isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500"><Loader2 size={15} className="animate-spin" /> Consultando proteção...</p>
      ) : statusQuery.isError ? (
        <button type="button" onClick={() => { void statusQuery.refetch(); }} className="mt-4 text-xs font-black text-rose-700">Não foi possível consultar. Tentar novamente.</button>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${statusQuery.data?.configurado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
            {statusQuery.data?.configurado ? 'Código ativo' : 'Código não configurado'}
          </span>
          {statusQuery.data?.atualizadoEm ? <span className="text-[10px] font-semibold text-slate-500">Alterado em {new Date(statusQuery.data.atualizadoEm).toLocaleString('pt-BR')}</span> : null}
        </div>
      )}

      {editing ? (
        <div className="mt-5 rounded-2xl border border-violet-100 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase text-violet-700"><KeyRound size={14} /> Novo código</p>
            <button type="button" onClick={resetDraft} disabled={redefineMutation.isPending} aria-label="Cancelar redefinição" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"><X size={16} /></button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-slate-500">Código</span>
              <span className="relative block">
                <input type={showCode ? 'text' : 'password'} autoComplete="new-password" value={codigo} onChange={(event) => { setCodigo(event.target.value); setError(''); }} className="w-full rounded-xl border border-slate-200 px-3 py-3 pr-11 text-sm font-bold outline-none focus:border-violet-500" />
                <button type="button" onClick={() => setShowCode((current) => !current)} aria-label={showCode ? 'Ocultar código' : 'Mostrar código'} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showCode ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </span>
            </label>
            <label className="space-y-1.5">
              <span className="text-[9px] font-black uppercase text-slate-500">Confirmar código</span>
              <input type={showCode ? 'text' : 'password'} autoComplete="new-password" value={confirmacao} onChange={(event) => { setConfirmacao(event.target.value); setError(''); }} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-bold outline-none focus:border-violet-500" />
            </label>
          </div>
          <label className="mt-3 block space-y-1.5">
            <span className="text-[9px] font-black uppercase text-slate-500">Justificativa da alteração</span>
            <input value={justificativa} maxLength={300} onChange={(event) => { setJustificativa(event.target.value); setError(''); }} placeholder="Ex.: redefinição solicitada pela direção" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold outline-none focus:border-violet-500" />
          </label>
          {error ? <p role="alert" className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p> : null}
          <p className="mt-3 text-[10px] font-semibold text-amber-700">Ao salvar, o código anterior deixa de funcionar imediatamente.</p>
          <button type="button" onClick={() => { void save(); }} disabled={redefineMutation.isPending} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-[10px] font-black uppercase text-white disabled:opacity-50">
            {redefineMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Salvar novo código
          </button>
        </div>
      ) : null}
    </section>
  );
};

export default TechnicalConditionCodeSettings;
