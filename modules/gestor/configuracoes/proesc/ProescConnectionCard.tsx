import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Save, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { useToast } from '../../components/ToastNotification';
import { proescKeys, proescService, type ProescTokenTest, type ProescVersion } from './proesc.service';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-[#001a33] outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100 disabled:opacity-50';
const buttonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-[10px] font-black uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';
const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR');

interface Props {
  version: ProescVersion;
  toast: ReturnType<typeof useToast>['toast'];
  onBusyChange: (version: ProescVersion, busy: boolean) => void;
}

export default function ProescConnectionCard({ version, toast, onBusyChange }: Props) {
  const status = useQuery({
    queryKey: proescKeys.connection(version), queryFn: () => proescService.connectionStatus(version),
    retry: false, gcTime: 0,
  });
  const label = version.toUpperCase();
  const wafRef = useRef<HTMLInputElement>(null);
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
    onBusyChange(version, true);
    setFailure('');
    setTestResult(null);
    try { await action(); toast.success(success); await status.refetch(); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível concluir.';
      setFailure(message); toast.error('Proesc', message);
    } finally { inFlightRef.current = false; setOperation(null); onBusyChange(version, false); }
  };

  const testToken = async () => {
    if (inFlightRef.current || configUnavailable || !configured) return;
    inFlightRef.current = true;
    setOperation('test');
    onBusyChange(version, true);
    setFailure('');
    setTestResult(null);
    try {
      const result = await proescService.testConnection(version);
      setTestResult(result);
      if (result.ok) toast.success('Token validado', result.message);
      else toast.error('Verifique o acesso ao Proesc', result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível testar o token. Tente novamente.';
      setFailure(message);
      toast.error('Teste não concluído', message);
    } finally { inFlightRef.current = false; setOperation(null); onBusyChange(version, false); }
  };

  return <section aria-label={`Conexão Proesc ${label}`} className="space-y-4">
    <div className="px-1">
      <h3 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Proesc {label}</h3>
      <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{version === 'v1'
        ? 'Legado e conciliação: conexão com a chave geral da instituição.'
        : 'Consulta de dados e pessoas: conexão com token e liberação de acesso da API V2.'}</p>
    </div>
        {failure ? <p role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-800">{failure}</p> : null}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="min-w-0 space-y-5 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Acesso {label}</h4>
          {!status.isError && !status.isLoading ? <span className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{configured ? 'Token cadastrado' : 'Token não cadastrado'}</span> : null}
        </div>
        {status.isLoading ? <p role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Carregando configuração…</p> : null}
        {status.isError ? <p role="alert" className="text-sm text-red-700">Não foi possível carregar a configuração. <button onClick={() => void status.refetch()} className="underline">Tentar novamente</button></p> : null}
        <p className="text-xs font-semibold leading-relaxed text-slate-500">Cadastre a chave disponibilizada pelo Proesc para conectar a integração.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          if (inFlightRef.current || configUnavailable) return;
          const token = tokenRef.current?.value || '';
          const wafHeader = version === 'v2' ? wafRef.current?.value : undefined;
          if (tokenRef.current) tokenRef.current.value = '';
          if (wafRef.current) wafRef.current.value = '';
          void act('save', () => proescService.saveConnection(version, token, wafHeader), `Conexão ${label} salva`);
        }} className="space-y-4">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">{configured ? 'Substituir token' : 'Token da API'}
            <input ref={tokenRef} type="password" autoComplete="new-password" required minLength={12} maxLength={8200}
              disabled={configUnavailable} aria-label={`Token Proesc ${label}`} placeholder={`Cole o token Proesc ${label}`} className={`${inputClass} mt-2 normal-case tracking-normal`} /></label>
          {version === 'v2' ? <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Chave WAF V2 (opcional)
            <input ref={wafRef} type="password" autoComplete="new-password" maxLength={8200}
              aria-label="Chave WAF Proesc V2" disabled={configUnavailable} placeholder={status.data?.wafConfigured ? 'Chave já salva; preencha somente para substituir' : 'Cole a chave WAF fornecida pelo Proesc'}
              className={`${inputClass} mt-2 normal-case tracking-normal`} />
            <span className="mt-2 block text-[11px] font-semibold normal-case tracking-normal text-slate-500">{status.data?.wafConfigured
              ? 'Chave WAF cadastrada. Deixar vazio mantém a chave salva.'
              : 'Informe se o Proesc forneceu uma chave WAF para esta conexão.'}</span>
          </label> : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <a href={version === 'v1' ? 'https://proesc.readme.io/v1.0/reference/autorizacao' : 'https://proesc.readme.io/reference/autorizacao'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800">Como obter o token <ExternalLink size={13} /></a>
            <button type="submit" disabled={configUnavailable} className={`${buttonClass} bg-blue-600 text-white shadow-md shadow-blue-600/15 hover:bg-blue-700`}>
              {operation === 'save' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{operation === 'save' ? 'Salvando…' : 'Salvar token'}
            </button>
          </div>
        </form>
        <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <div><p className="text-xs font-bold text-slate-600">As credenciais ficam protegidas e não são exibidas após salvar.</p>
            {status.data?.updatedAt ? <p className="mt-1 text-[10px] font-semibold text-slate-400">Atualizado em {formatDate(status.data.updatedAt)}.</p> : null}</div>
        </div>
        {configured ? <button type="button" disabled={busy} onClick={() => setRemoveOpen(true)} className="inline-flex min-h-9 items-center gap-2 text-[10px] font-black uppercase tracking-wider text-red-600 hover:text-red-800 disabled:opacity-40"><Trash2 size={14} />Remover conexão {label}</button> : null}
        {removeOpen ? <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-xs font-semibold leading-relaxed text-red-900">
          <p>Remover a conexão {label} apaga suas credenciais e desativa esse acesso. A outra versão e o histórico registrado serão preservados.</p>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void act('remove', async () => { await proescService.removeConnection(version); setRemoveOpen(false); }, `Conexão ${label} removida`)} className={`${buttonClass} bg-red-600 text-white hover:bg-red-700`}>{operation === 'remove' ? 'Removendo…' : 'Confirmar remoção'}</button><button type="button" disabled={busy} onClick={() => setRemoveOpen(false)} className={`${buttonClass} border border-red-200 bg-white text-red-700`}>Cancelar</button></div>
        </div> : null}
        </section>
        <section className="min-w-0 space-y-5 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-8" aria-busy={operation === 'test'}>
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><Wifi size={20} /></div>
            <div><h4 className="text-lg font-black uppercase tracking-tight text-[#001a33]">Testar conexão {label}</h4>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">Verifique os acessos disponíveis para o token salvo no Proesc.</p></div>
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
  </section>;
}
