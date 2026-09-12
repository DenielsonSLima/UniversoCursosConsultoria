import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Database, KeyRound, Loader2, Search, ShieldCheck } from 'lucide-react';
import ToastNotification, { useToast } from '../../components/ToastNotification';
import { proescKeys, proescService } from './proesc.service';
import type { ProescRun } from './proesc.service';
import { ProescResults, T42ImportedHistory } from './ProescResults';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-500';
const buttonClass = 'rounded-xl bg-[#001a33] px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40';

export default function ProescConfig() {
  const [listPage, setListPage] = useState(0);
  const status = useQuery({ queryKey: [...proescKeys.status, listPage], queryFn: () => proescService.status(listPage * 20), retry: false, gcTime: 0 });
  const { toasts, removeToast, toast } = useToast();
  const tokenRef = useRef<HTMLInputElement>(null);
  const stopRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [resource, setResource] = useState<ProescRun['resource']>('invoices');
  const [unitId, setUnitId] = useState('');
  const [start, setStart] = useState('2025-01');
  const [end, setEnd] = useState('2027-12');
  const [activeRun, setActiveRun] = useState<ProescRun | null>(null);
  const [failure, setFailure] = useState('');
  useEffect(() => () => { stopRef.current = true; }, []);

  const act = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setFailure('');
    try { await operation(); toast.success(success); await status.refetch(); }
    catch (error) { const message = error instanceof Error ? error.message : 'Não foi possível concluir.'; setFailure(message); toast.error('Proesc', message); }
    finally { setBusy(false); }
  };
  const collect = async (existing?: ProescRun) => {
    setBusy(true); setCollecting(true); setFailure(''); stopRef.current = false;
    try {
      let run = existing || await proescService.start(resource, { unitId, start, end });
      if (!existing) setListPage(0);
      setActiveRun(run);
      while (run.status === 'running' && !stopRef.current) {
        run = await proescService.advance(run.id);
        setActiveRun(run);
        if (run.status === 'running' && !stopRef.current) await new Promise((resolve) => setTimeout(resolve, 800));
      }
      if (run.status === 'complete') toast.success('Consulta registrada', 'Os dados estão disponíveis para conferência.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Consulta interrompida. Retome para continuar.';
      setFailure(message); toast.error('Consulta pendente', message);
    } finally { setBusy(false); setCollecting(false); await status.refetch(); }
  };

  if (status.isLoading) return <div role="status" className="flex items-center gap-3 py-12"><Loader2 className="animate-spin" />Carregando integração Proesc…</div>;
  if (status.isError) return <div role="alert" className="space-y-3 py-8">
    <h2 className="text-xl font-bold">Proesc indisponível</h2>
    <p className="text-sm text-slate-600">{status.error.message}</p>
    <button onClick={() => void status.refetch()} className={buttonClass}>Tentar novamente</button>
  </div>;

  return <div className="space-y-6">
    <ToastNotification toasts={toasts} onRemove={removeToast} />
    <header className="flex items-start gap-4">
      <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700"><Database size={28} /></div>
      <div><h2 className="text-2xl font-black text-[#001a33]">Proesc</h2>
        <p className="mt-1 text-sm text-slate-500">Conexão e conferência do histórico financeiro · Turma 42</p></div>
    </header>
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
      Consulte as cobranças existentes para comparar com o histórico da T42. Nesta etapa, os resultados ficam para conferência antes de qualquer ajuste financeiro.
    </div>
    {failure ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{failure}</p> : null}
    <section className="space-y-4 rounded-2xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold"><KeyRound size={18} />Conexão</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.data?.configured ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{status.data?.configured ? 'Token cadastrado' : 'Token não cadastrado'}</span></div>
      <p className="text-sm text-slate-500">Gere no Proesc um token com consulta a pessoas/matrículas e financeiro da unidade. <a href="https://proesc.readme.io/reference/autorizacao" target="_blank" rel="noreferrer" className="text-blue-700 underline">Como obter o token</a></p>
      <form onSubmit={(event) => {
        event.preventDefault();
        const token = tokenRef.current?.value || '';
        if (tokenRef.current) tokenRef.current.value = '';
        void act(() => proescService.saveToken(token), 'Token protegido no servidor');
      }} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-bold">{status.data?.configured ? 'Substituir token' : 'Token da API'}
          <input ref={tokenRef} type="password" autoComplete="new-password" required minLength={12} maxLength={8200} disabled={busy}
            placeholder="Cole o token do Proesc" className={`${inputClass} mt-2`} /></label>
        <button disabled={busy} className={buttonClass}>Salvar token</button>
      </form>
      <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} />O token fica protegido no servidor e não é exibido após salvar.</p>
      <div className="flex flex-wrap gap-3">
        <button disabled={busy || !status.data?.configured} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40" onClick={() => void act(async () => { const result = await proescService.test(); toast.info('Permissão consultada', result.message); }, 'Teste concluído')}>Testar conexão</button>
        <button disabled={busy || !status.data?.configured} onClick={() => setRemoveOpen(true)} className="text-sm text-red-700 disabled:opacity-40">Remover token</button>
      </div>
      {removeOpen ? <div className="rounded-xl bg-slate-50 p-4 text-sm">
        <p>Remover o token interrompe novas consultas. Os registros já consultados serão preservados.</p>
        <div className="mt-3 flex gap-4"><button disabled={busy} onClick={() => void act(async () => { await proescService.removeToken(); setRemoveOpen(false); }, 'Token removido')} className="font-bold text-red-700">Remover conexão</button><button disabled={busy} onClick={() => setRemoveOpen(false)}>Manter conexão</button></div>
      </div> : null}
    </section>
    <section className="space-y-4 rounded-2xl border border-slate-200 p-5">
      <h3 className="flex items-center gap-2 font-bold"><Search size={18} />Consultar dados para conferência</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-bold">Consultar<select value={resource} disabled={busy} onChange={(event) => setResource(event.target.value as ProescRun['resource'])} className={`${inputClass} mt-2`}><option value="invoices">Todas as cobranças do período</option><option value="people">Pessoas e matrículas</option></select></label>
        <label className="text-sm font-bold">Unidade Proesc (opcional)<input inputMode="numeric" value={unitId} disabled={busy} onChange={(event) => setUnitId(event.target.value)} placeholder="Unidades liberadas no token" className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-bold">Vencimentos de<input type="month" value={start} disabled={busy || resource === 'people'} onChange={(event) => setStart(event.target.value)} className={`${inputClass} mt-2`} /></label>
        <label className="text-sm font-bold">Vencimentos até<input type="month" value={end} disabled={busy || resource === 'people'} onChange={(event) => setEnd(event.target.value)} className={`${inputClass} mt-2`} /></label>
      </div>
      <p className="text-xs text-slate-500">A consulta inclui todas as situações e tipos de cobrança retornados pela API no período. Ajuste as datas para cobrir também parcelas antigas ou futuras.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy || !status.data?.configured} onClick={() => void collect()} className={buttonClass}>Consultar e registrar</button>
        {collecting ? <button className="rounded-xl border px-4 py-3 text-sm" onClick={() => { stopRef.current = true; }}>Pausar após esta página</button> : null}
        {collecting ? <span role="status" className="flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />{activeRun?.pages || 0} páginas registradas · {activeRun?.records || 0} registros</span> : null}
      </div>
      <p className="text-xs text-slate-500">Mantenha esta tela aberta durante a consulta. Se interromper, você poderá retomar pelas consultas recentes.</p>
    </section>
    <section className="space-y-3">
      <h3 className="font-bold">Consultas recentes</h3>
      {!status.data?.consultations.length ? <p className="text-sm text-slate-500">Nenhuma consulta registrada.</p> : null}
      {status.data?.consultations.map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
        <div className="text-sm"><p className="font-bold">{run.resource === 'invoices' ? 'Cobranças' : 'Pessoas e matrículas'} · {run.resource === 'invoices' ? `${run.filters.start} a ${run.filters.end}` : 'Todas as matrículas retornadas'}</p>
          <p className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString('pt-BR')} · {run.records} registros · {run.status === 'complete' ? 'Consulta concluída' : 'Consulta parcial — pode retomar'}</p></div>
        <div className="flex gap-3 text-sm font-bold"><button disabled={busy || !run.pages} onClick={() => setActiveRun(run)} className="text-blue-700 disabled:opacity-40">Ver registros</button>
          {run.status === 'running' ? <button disabled={busy || !status.data?.configured} onClick={() => void collect(run)} className="text-blue-700 disabled:opacity-40">Retomar</button> : null}</div>
      </div>)}
      <div className="flex items-center gap-3 text-sm">
        <button disabled={busy || listPage === 0} onClick={() => setListPage((value) => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Mais recentes</button>
        <span>Página {listPage + 1}</span>
        <button disabled={busy || (listPage + 1) * 20 >= (status.data?.totalConsultations || 0)} onClick={() => setListPage((value) => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Mais antigas</button>
      </div>
    </section>
    {activeRun && activeRun.pages > 0 ? <ProescResults key={activeRun.id} run={activeRun} /> : null}
    <T42ImportedHistory />
  </div>;
}
