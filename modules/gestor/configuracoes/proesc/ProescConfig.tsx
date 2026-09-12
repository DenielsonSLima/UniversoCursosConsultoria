import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Database, ExternalLink, History, KeyRound, Loader2, Save, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { proescKeys, proescService, type ProescTokenTest } from './proesc.service';
import ProescClassHistory from './ProescResults';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-[#001a33] outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:opacity-50';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';
const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

export default function ProescConfig() {
  const [tab, setTab] = useState<'token' | 'history'>('token');
  const status = useQuery({ queryKey: proescKeys.status, queryFn: proescService.status, retry: false, gcTime: 0 });
  const { toasts, removeToast, toast } = useToast();
  const tokenRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(false);
  const [operation, setOperation] = useState<'save' | 'remove' | 'test' | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [failure, setFailure] = useState('');
  const [testResult, setTestResult] = useState<ProescTokenTest | null>(null);
  const busy = operation !== null;
  const configUnavailable = busy || status.isLoading || status.isError;
  const configured = status.data?.configured === true;

  const act = async (kind: 'save' | 'remove', action: () => Promise<unknown>, success: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setOperation(kind);
    setFailure('');
    setTestResult(null);
    try { await action(); toast.success(success); await status.refetch(); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível concluir.';
      setFailure(message); toast.error('Proesc', message);
    } finally { inFlightRef.current = false; setOperation(null); }
  };

  const testToken = async () => {
    if (inFlightRef.current || configUnavailable || !configured) return;
    inFlightRef.current = true;
    setOperation('test');
    setFailure('');
    setTestResult(null);
    try {
      const result = await proescService.testToken();
      setTestResult(result);
      if (result.ok) toast.success('Token validado', result.message);
      else toast.error('Verifique o acesso ao Proesc', result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível testar o token. Tente novamente.';
      setFailure(message);
      toast.error('Teste não concluído', message);
    } finally { inFlightRef.current = false; setOperation(null); }
  };

  return <div className="space-y-6">
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="flex items-start gap-4 overflow-hidden rounded-[2rem] bg-[#001a33] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
      <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-blue-200"><Database size={26} /></div>
      <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-200">Integração de sistemas</p>
        <h2 className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-3xl">Proesc</h2>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-300">Gerencie o acesso e acompanhe o histórico das turmas.</p></div>
    </header>
    <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Proesc">
      {([{ id: 'token', label: 'Configuração do token', Icon: KeyRound }, { id: 'history', label: 'Histórico por turma', Icon: History }] as const).map(({ id, label, Icon }) => (
        <button key={id} type="button" id={`proesc-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`proesc-panel-${id}`}
          disabled={busy} onClick={() => setTab(id)} className={`${buttonClass} shrink-0 ${tab === id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/15' : 'border border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'}`}>
          <Icon size={16} />{label}
        </button>
      ))}
    </div>
    <div role="tabpanel" id={`proesc-panel-${tab}`} aria-labelledby={`proesc-tab-${tab}`}>
      {tab === 'history' ? <ProescClassHistory /> : <div className="space-y-5">
        {failure ? <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-800">{failure}</p> : null}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-5 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Token de acesso</h3>
          {!status.isError && !status.isLoading ? <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{configured ? 'Token cadastrado' : 'Token não cadastrado'}</span> : null}
        </div>
        {status.isLoading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Carregando configuração…</p> : null}
        {status.isError ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar a configuração. <button onClick={() => void status.refetch()} className="underline">Tentar novamente</button></p> : null}
        <p className="text-xs font-semibold leading-relaxed text-slate-500">Cadastre a chave disponibilizada pelo Proesc para conectar a integração.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (inFlightRef.current || configUnavailable) return;
          const token = tokenRef.current?.value || '';
          if (tokenRef.current) tokenRef.current.value = '';
          void act('save', () => proescService.saveToken(token), 'Token salvo');
        }} className="space-y-4">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{configured ? 'Substituir token' : 'Token da API'}
            <input ref={tokenRef} type="password" autoComplete="new-password" required minLength={12} maxLength={8200}
              disabled={configUnavailable} placeholder="Cole o token do Proesc" className={`${inputClass} mt-2 normal-case tracking-normal`} /></label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a href="https://proesc.readme.io/reference/autorizacao" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800">Como obter o token <ExternalLink size={13} /></a>
            <button type="submit" disabled={configUnavailable} className={`${buttonClass} bg-blue-600 text-white shadow-md shadow-blue-600/15 hover:bg-blue-700`}>
              {operation === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{operation === 'save' ? 'Salvando…' : 'Salvar token'}
            </button>
          </div>
        </form>
        <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <div><p className="text-xs font-bold text-slate-600">O token fica protegido e não é exibido após salvar.</p>
            {status.data?.updatedAt ? <p className="mt-1 text-[10px] font-semibold text-slate-400">Atualizado em {formatDate(status.data.updatedAt)}.</p> : null}</div>
        </div>
        {configured ? <button type="button" disabled={busy} onClick={() => setRemoveOpen(true)} className="inline-flex min-h-9 items-center gap-2 text-[10px] font-black uppercase tracking-wider text-red-600 hover:text-red-800 disabled:opacity-40"><Trash2 size={14} />Remover token</button> : null}
        {removeOpen ? <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs font-semibold leading-relaxed text-red-900">
          <p>Remover o token desativa o acesso ao Proesc. O histórico registrado será preservado.</p>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void act('remove', async () => { await proescService.removeToken(); setRemoveOpen(false); }, 'Token removido')} className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}>{operation === 'remove' ? 'Removendo…' : 'Confirmar remoção'}</button><button type="button" disabled={busy} onClick={() => setRemoveOpen(false)} className={`${buttonClass} border border-red-200 bg-white text-red-700`}>Cancelar</button></div>
        </div> : null}
        </section>
        <section className="min-w-0 space-y-5 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-8" aria-busy={operation === 'test'}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><Wifi size={20} /></div>
            <div><h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Testar conexão</h3>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">Verifique se o token salvo permite acessar pessoas e parcelas no Proesc.</p></div>
          </div>
          <button type="button" disabled={configUnavailable || !configured} onClick={() => void testToken()} className={`${buttonClass} w-full bg-[#001a33] text-white hover:bg-blue-950`}>
            {operation === 'test' ? <Loader2 size={16} className="animate-spin" /> : <Wifi size={16} />}{operation === 'test' ? 'Testando token…' : 'Testar token'}
          </button>
          <p className="text-[11px] font-semibold leading-relaxed text-slate-500">{configured ? 'O teste verifica o acesso. Nenhum cadastro ou lançamento financeiro é alterado.' : 'Salve um token para testar a conexão.'}</p>
          {testResult ? <div role="status" aria-live="polite" className="space-y-3 border-t border-slate-100 pt-5">
            <div className={`flex items-start gap-2 rounded-xl p-3 ${testResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
              {testResult.ok ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
              <div><p className="text-xs font-black">{testResult.ok ? 'Conexão validada' : 'Acesso precisa de atenção'}</p><p className="mt-1 break-words text-xs font-semibold leading-relaxed">{testResult.message}</p></div>
            </div>
            {testResult.checks.map((check) => <div key={check.resource} className="rounded-xl border border-slate-100 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black text-[#001a33]">{check.resource === 'people' ? 'Pessoas' : 'Parcelas'}</p>
                <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${check.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{check.ok ? 'Acesso confirmado' : 'Verificar acesso'}</span></div>
              <p className="mt-2 break-words text-xs font-semibold leading-relaxed text-slate-500">{check.message}</p>
            </div>)}
            <p className="text-[10px] font-semibold text-slate-400">Teste realizado em {formatDate(testResult.checkedAt)}.</p>
          </div> : null}
        </section>
        </div>
      </div>}
    </div>
  </div>;
}
