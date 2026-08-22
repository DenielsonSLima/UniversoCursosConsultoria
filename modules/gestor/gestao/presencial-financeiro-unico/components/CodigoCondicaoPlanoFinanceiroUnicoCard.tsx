import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileKey2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  useCodigoCondicaoPlanoFinanceiroUnico,
  useRedefinirCodigoCondicaoPlanoFinanceiroUnico,
} from '../hooks/useCondicaoPlanoFinanceiroUnico';
import { createPlanoFinanceiroUnicoRequestId } from '../presencial-financeiro-unico.service';

interface CodigoCondicaoPlanoFinanceiroUnicoCardProps {
  turmaId: string;
  canManageFinanceiro: boolean;
}

const CodigoCondicaoPlanoFinanceiroUnicoCard: React.FC<CodigoCondicaoPlanoFinanceiroUnicoCardProps> = ({
  turmaId,
  canManageFinanceiro,
}) => {
  const statusQuery = useCodigoCondicaoPlanoFinanceiroUnico(turmaId, canManageFinanceiro);
  const resetMutation = useRedefinirCodigoCondicaoPlanoFinanceiroUnico();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [justification, setJustification] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null);
  const inFlightRef = useRef(false);
  const requestRef = useRef<{ signature: string; requestId: string } | null>(null);

  if (!canManageFinanceiro) {
    return <section className="rounded-2xl border border-amber-100 bg-amber-50 p-5 text-sm font-semibold text-amber-800"><AlertCircle size={19} className="mr-2 inline" />A configuração do código de condições individuais exige acesso financeiro e à aba Configurações.</section>;
  }

  const save = async () => {
    if (inFlightRef.current) return;
    setFeedback(null);
    if (code.length < 8 || code.length > 32 || !/[A-Za-z]/.test(code) || !/[0-9]/.test(code)) {
      setFeedback({ tone: 'error', message: 'Use de 8 a 32 caracteres, com pelo menos uma letra e um número.' });
      return;
    }
    if (code !== confirmation) {
      setFeedback({ tone: 'error', message: 'A confirmação não corresponde ao novo código.' });
      return;
    }
    const normalizedJustification = justification.trim();
    if (normalizedJustification.length < 5) {
      setFeedback({ tone: 'error', message: 'Informe uma justificativa com pelo menos 5 caracteres.' });
      return;
    }
    const signature = JSON.stringify([turmaId, code, normalizedJustification]);
    const activeRequest = requestRef.current?.signature === signature
      ? requestRef.current
      : { signature, requestId: createPlanoFinanceiroUnicoRequestId() };
    requestRef.current = activeRequest;
    inFlightRef.current = true;
    try {
      await resetMutation.mutateAsync({
        turmaId,
        requestId: activeRequest.requestId,
        novoCodigo: code,
        justificativa: normalizedJustification,
      });
      requestRef.current = null;
      setCode('');
      setConfirmation('');
      setJustification('');
      setEditing(false);
      setFeedback({ tone: 'success', message: 'Código financeiro redefinido com auditoria.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'O servidor não confirmou o novo código.' });
    } finally {
      inFlightRef.current = false;
    }
  };

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-violet-600"><FileKey2 size={14} /> Condições comerciais individuais</p><h3 className="mt-2 text-lg font-black text-[#001a33]">Código de autorização financeira</h3><p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-500">Protege descontos e parcelamentos diferentes da turma. O código nunca é exibido e cada uso registra aluno, motivo e operador.</p></div>
        {statusQuery.data ? <span className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-black uppercase ${statusQuery.data.configurado ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><ShieldCheck size={14} />{statusQuery.data.configurado ? `Configurado · rev. ${statusQuery.data.revisao}` : 'Não configurado'}</span> : null}
      </div>

      {statusQuery.isLoading ? <div className="mt-5 flex items-center text-xs font-bold text-slate-500"><Loader2 size={15} className="mr-2 animate-spin" /> Consultando status...</div> : null}
      {statusQuery.isError ? <div className="mt-5 flex flex-col gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-xs font-semibold text-rose-700 sm:flex-row sm:items-center sm:justify-between"><span>O status do código não foi carregado.</span><button type="button" onClick={() => { void statusQuery.refetch(); }} className="inline-flex items-center gap-2 font-black uppercase"><RefreshCw size={13} /> Recarregar</button></div> : null}

      {!editing ? <button type="button" onClick={() => { setEditing(true); setFeedback(null); }} disabled={statusQuery.isLoading || statusQuery.isError} className="mt-5 rounded-xl bg-[#001a33] px-5 py-3 text-[10px] font-black uppercase tracking-wider text-white disabled:opacity-40">{statusQuery.data?.configurado ? 'Redefinir código' : 'Configurar código'}</button> : (
        <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
          <div className="grid gap-4 sm:grid-cols-2"><label><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Novo código</span><input type="password" autoComplete="new-password" value={code} onChange={(event) => setCode(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-500" /></label><label><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Confirmar código</span><input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-500" /></label></div>
          <label className="mt-4 block"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Justificativa da alteração</span><textarea rows={2} maxLength={300} value={justification} onChange={(event) => setJustification(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold outline-none focus:border-violet-500" /></label>
          <div className="mt-4 flex gap-3"><button type="button" onClick={() => { requestRef.current = null; setEditing(false); setFeedback(null); }} disabled={resetMutation.isPending} className="rounded-xl border border-slate-200 px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Cancelar</button><button type="button" onClick={() => { void save(); }} disabled={resetMutation.isPending} className="rounded-xl bg-violet-600 px-5 py-2.5 text-[10px] font-black uppercase text-white disabled:opacity-50">{resetMutation.isPending ? 'Salvando...' : 'Salvar novo código'}</button></div>
        </div>
      )}

      {feedback ? <p className={`mt-4 rounded-xl border p-3 text-xs font-semibold ${feedback.tone === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : 'border-rose-100 bg-rose-50 text-rose-700'}`}>{feedback.tone === 'success' ? <CheckCircle2 size={15} className="mr-2 inline" /> : <AlertCircle size={15} className="mr-2 inline" />}{feedback.message}</p> : null}
    </section>
  );
};

export default CodigoCondicaoPlanoFinanceiroUnicoCard;
