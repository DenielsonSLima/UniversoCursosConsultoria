import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Download,
  Loader2,
  MonitorCheck,
  Search,
  Smartphone,
  Wifi,
} from 'lucide-react';
import type { AppDeviceStatusFilter, AppDeviceUser } from './dispositivos-app.types';
import { useDispositivosApp } from './useDispositivosApp';
import AlunoAppDeviceDetail from './AlunoAppDeviceDetail';

const PAGE_SIZE = 25;

const statusOptions: Array<{ value: AppDeviceStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'installed', label: 'App instalado' },
  { value: 'not_installed', label: 'Sem aplicativo' },
  { value: 'online', label: 'Online agora' },
  { value: 'offline', label: 'Offline' },
  { value: 'notifications', label: 'Notificações ativas' },
  { value: 'no_notifications', label: 'Notificações inativas' },
];

const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : 'Nunca acessou';

const UserStatus = ({ user }: { user: AppDeviceUser }) => {
  if (!user.appInstalled) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">Sem app</span>;
  if (user.onlineNow) return <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-emerald-700"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Online</span>;
  return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] text-blue-700">App instalado</span>;
};

const DispositivosAppConfig = () => {
  const [selectedAlunoId, setSelectedAlunoId] = useState<string | null>(null);
  const [poloId, setPoloId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [status, setStatus] = useState<AppDeviceStatusFilter>('all');
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ poloId, search: deferredSearch, status, page, pageSize: PAGE_SIZE }), [poloId, deferredSearch, status, page]);
  const { polosQuery, summaryQuery, usersQuery } = useDispositivosApp(params);
  const total = usersQuery.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => setPage(1), [poloId, deferredSearch, status]);

  const refresh = () => {
    void summaryQuery.refetch();
    void usersQuery.refetch();
  };

  const summaryCards = [
    { label: 'Alunos ativos', value: summaryQuery.data?.totalAlunos || 0, icon: CircleUserRound, tone: 'bg-slate-100 text-slate-700' },
    { label: 'App instalado', value: summaryQuery.data?.appInstalado || 0, icon: Download, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Online agora', value: summaryQuery.data?.onlineAgora || 0, icon: Wifi, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Notificações ativas', value: summaryQuery.data?.notificacoesAtivas || 0, icon: BellRing, tone: 'bg-violet-50 text-violet-700' },
  ];

  if (selectedAlunoId) return <AlunoAppDeviceDetail alunoId={selectedAlunoId} onBack={() => setSelectedAlunoId(null)} />;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="relative overflow-hidden rounded-[2rem] bg-[#001a33] p-6 text-white shadow-xl shadow-blue-950/10 sm:p-8">
        <div aria-hidden="true" className="absolute -right-12 -top-12 h-44 w-44 rounded-full border-[28px] border-blue-500/15" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-blue-300"><Smartphone size={16} /> Aplicativo do aluno</div>
            <h2 className="text-3xl font-extrabold tracking-tight">Dispositivos do app</h2>
            <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-slate-300">Acompanhe instalações, sessões recentes e consentimento de notificações por polo. Tokens do aparelho permanecem protegidos e não aparecem neste painel.</p>
          </div>
          <div className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl bg-emerald-400/10 px-4 text-xs font-bold uppercase tracking-[0.06em] text-emerald-200 ring-1 ring-emerald-300/20 sm:self-auto">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-50" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" /></span>
            Atualização em tempo real
          </div>
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ label, value, icon: Icon, tone }) => (
          <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></div>
            <p className="text-2xl font-extrabold text-[#001a33]">{summaryQuery.isLoading ? '—' : new Intl.NumberFormat('pt-BR').format(value)}</p>
            <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
          </article>
        ))}
      </div>

      <section className="mt-6 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-3 border-b border-slate-200 p-4 lg:grid-cols-[minmax(260px,1fr)_240px_240px]">
          <label className="relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar aluno, matrícula ou e-mail" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-50" />
          </label>
          <select value={poloId || ''} onChange={(event) => setPoloId(event.target.value || null)} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
            <option value="">Todos os polos</option>
            {(polosQuery.data || []).map((polo) => <option key={polo.id} value={polo.id}>{polo.nome}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value as AppDeviceStatusFilter)} className="min-h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50">
            {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        {usersQuery.isLoading ? (
          <div className="flex min-h-72 items-center justify-center" role="status"><Loader2 size={28} className="animate-spin text-blue-600" /><span className="sr-only">Carregando dispositivos</span></div>
        ) : usersQuery.isError ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><MonitorCheck size={34} className="text-rose-500" /><h3 className="mt-3 font-bold text-[#001a33]">Não foi possível carregar os dispositivos</h3><button type="button" onClick={refresh} className="mt-4 rounded-xl bg-[#001a33] px-4 py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-white">Tentar novamente</button></div>
        ) : !usersQuery.data?.rows.length ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><Smartphone size={36} className="text-slate-300" /><h3 className="mt-3 font-bold text-[#001a33]">Nenhum aluno encontrado</h3><p className="mt-1 text-sm font-medium text-slate-500">Ajuste os filtros para consultar outros usuários.</p></div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[980px] text-left">
                <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-5 py-3">Aluno</th><th className="px-5 py-3">Polo</th><th className="px-5 py-3">Aplicativo</th><th className="px-5 py-3">Sessão</th><th className="px-5 py-3">Notificação</th><th className="px-5 py-3">Último acesso</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {usersQuery.data.rows.map((user) => (
                    <tr key={user.alunoId} role="button" tabIndex={0} onClick={() => setSelectedAlunoId(user.alunoId)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedAlunoId(user.alunoId); }} className="cursor-pointer transition hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none">
                      <td className="px-5 py-4"><button type="button" onClick={(event) => { event.stopPropagation(); setSelectedAlunoId(user.alunoId); }} className="block max-w-[250px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><span className="block truncate text-sm font-bold text-[#001a33]">{user.nome}</span><span className="mt-1 block truncate text-xs font-medium text-slate-500">{user.matricula || user.email || 'Sem matrícula'}</span></button></td>
                      <td className="px-5 py-4"><p className="text-xs font-semibold text-slate-600">{user.poloNome || 'Sem polo'}</p>{user.poloCidade || user.poloUf ? <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{[user.poloCidade, user.poloUf].filter(Boolean).join(' · ')}</p> : null}</td>
                      <td className="px-5 py-4"><div className="flex items-center gap-2"><UserStatus user={user} />{user.plataformas.map((platform) => <span key={platform} className="text-[11px] font-semibold uppercase text-slate-400">{platform}</span>)}</div>{user.deviceCount > 1 ? <p className="mt-1 text-[11px] font-medium text-slate-400">{user.deviceCount} dispositivos</p> : null}</td>
                      <td className="px-5 py-4 text-xs font-bold text-slate-600">{user.sessionActive ? 'Logado' : user.appInstalled ? 'Sessão encerrada' : '—'}</td>
                      <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${user.notificationActive ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>{user.notificationActive ? 'Ativa' : user.appInstalled ? 'Inativa' : '—'}</span></td>
                      <td className="px-5 py-4"><p className="text-xs font-semibold text-slate-600">{formatDate(user.lastSeenAt)}</p>{user.appVersion ? <p className="mt-1 text-[11px] font-medium text-slate-400">Versão {user.appVersion}</p> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="divide-y divide-slate-100 lg:hidden">
              {usersQuery.data.rows.map((user) => (
                <button type="button" key={user.alunoId} onClick={() => setSelectedAlunoId(user.alunoId)} className="block w-full p-4 text-left transition hover:bg-blue-50/50"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-bold text-[#001a33]">{user.nome}</h3><p className="mt-1 truncate text-xs font-medium text-slate-500">{user.poloNome || 'Sem polo'} · {user.matricula || user.email || 'Sem matrícula'}</p>{user.poloCidade || user.poloUf ? <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">{[user.poloCidade, user.poloUf].filter(Boolean).join(' · ')}</p> : null}</div><UserStatus user={user} /></div><div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-xs"><div><p className="font-semibold text-slate-400">Notificação</p><p className="mt-1 font-semibold text-slate-700">{user.notificationActive ? 'Ativa' : 'Inativa'}</p></div><div><p className="font-semibold text-slate-400">Último acesso</p><p className="mt-1 font-semibold text-slate-700">{formatDate(user.lastSeenAt)}</p></div></div></button>
              ))}
            </div>
          </>
        )}

        <footer className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold text-slate-500">{total ? `${total} aluno${total === 1 ? '' : 's'} encontrado${total === 1 ? '' : 's'}` : 'Nenhum resultado'}</p>
          <div className="flex items-center gap-2"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><ChevronLeft size={17} /></button><span className="min-w-24 text-center text-xs font-bold text-slate-600">{page} de {totalPages}</span><button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 disabled:opacity-40"><ChevronRight size={17} /></button></div>
        </footer>
      </section>
    </div>
  );
};

export default DispositivosAppConfig;
