import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, History, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { proescKeys, proescService } from './proesc.service';
import ProescClassHistory from './ProescResults';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-500';
const buttonClass = 'rounded-xl bg-[#001a33] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40';

export default function ProescConfig() {
  const [tab, setTab] = useState<'token' | 'history'>('token');
  const status = useQuery({ queryKey: proescKeys.status, queryFn: proescService.status, retry: false, gcTime: 0 });
  const { toasts, removeToast, toast } = useToast();
  const tokenRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [failure, setFailure] = useState('');

  const act = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setFailure('');
    try { await operation(); toast.success(success); await status.refetch(); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível concluir.';
      setFailure(message); toast.error('Proesc', message);
    } finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="flex items-start gap-4">
      <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700"><Database size={28} /></div>
      <div><h2 className="text-2xl font-black text-[#001a33]">Proesc</h2>
        <p className="mt-1 text-sm text-slate-500">Configuração da integração e histórico por turma.</p></div>
    </header>
    <div className="flex flex-wrap gap-2 border-b border-slate-200" role="tablist" aria-label="Proesc">
      {([{ id: 'token', label: 'Configuração do token', Icon: KeyRound }, { id: 'history', label: 'Histórico por turma', Icon: History }] as const).map(({ id, label, Icon }) => (
        <button key={id} id={`proesc-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`proesc-panel-${id}`}
          disabled={busy} onClick={() => setTab(id)} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50 ${tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-blue-700'}`}>
          <Icon size={18} />{label}
        </button>
      ))}
    </div>
    <div role="tabpanel" id={`proesc-panel-${tab}`} aria-labelledby={`proesc-tab-${tab}`}>
      {tab === 'history' ? <ProescClassHistory /> : <section className="space-y-5 rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-[#001a33]">Token de acesso</h3>
          {!status.isError && !status.isLoading ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.data?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{status.data?.configured ? 'Token cadastrado' : 'Token não cadastrado'}</span> : null}
        </div>
        {status.isLoading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Carregando configuração…</p> : null}
        {status.isError ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar a configuração. <button onClick={() => void status.refetch()} className="underline">Tentar novamente</button></p> : null}
        <p className="text-sm text-slate-500">Cadastre a chave disponibilizada pelo Proesc para conectar a integração. <a href="https://proesc.readme.io/reference/autorizacao" target="_blank" rel="noreferrer" className="text-blue-700 underline">Como obter o token</a></p>
        {failure ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{failure}</p> : null}
        <form onSubmit={(event) => {
          event.preventDefault();
          const token = tokenRef.current?.value || '';
          if (tokenRef.current) tokenRef.current.value = '';
          void act(() => proescService.saveToken(token), 'Token salvo');
        }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm font-bold">{status.data?.configured ? 'Substituir token' : 'Token da API'}
            <input ref={tokenRef} type="password" autoComplete="new-password" required minLength={12} maxLength={8200}
              disabled={busy || status.isLoading || status.isError} placeholder="Cole o token do Proesc" className={`${inputClass} mt-2`} /></label>
          <button disabled={busy || status.isLoading || status.isError} className={buttonClass}>{busy ? 'Salvando…' : 'Salvar token'}</button>
        </form>
        <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} />O token fica protegido e não é exibido após salvar.</p>
        {status.data?.updatedAt ? <p className="text-xs text-slate-500">Atualizado em {new Date(status.data.updatedAt).toLocaleString('pt-BR')}.</p> : null}
        {status.data?.configured ? <button disabled={busy} onClick={() => setRemoveOpen(true)} className="text-sm text-red-700 disabled:opacity-40">Remover token</button> : null}
        {removeOpen ? <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <p>Remover o token desativa o acesso ao Proesc. O histórico registrado será preservado.</p>
          <div className="mt-3 flex gap-4"><button disabled={busy} onClick={() => void act(async () => { await proescService.removeToken(); setRemoveOpen(false); }, 'Token removido')} className="font-bold text-red-700">Remover token</button><button disabled={busy} onClick={() => setRemoveOpen(false)}>Cancelar</button></div>
        </div> : null}
      </section>}
    </div>
  </div>;
}
