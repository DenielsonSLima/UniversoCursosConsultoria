import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { logsEventosService, LogsEventosPage, LogsEventosPolo } from './logs-eventos.service';

const MODULOS = [
  'Sistema',
  'Configurações',
  'Parceiros',
  'Cadastros',
  'Gestão Acadêmica',
  'Financeiro',
  'Caixa',
  'Secretaria',
  'Biblioteca',
  'Comunicação',
];

const PAGE_SIZE = 25;

const TIPO_OPTIONS = [
  { value: '', label: 'Todos os tipos' },
  { value: 'Aluno', label: 'Aluno' },
  { value: 'Professor', label: 'Professor' },
  { value: 'Gestor', label: 'Gestor' },
  { value: 'Sistema', label: 'Sistema' },
];

const formatDateTime = (value: string) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
};

const actionStyles: Record<string, string> = {
  Criou: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Atualizou: 'bg-blue-50 text-blue-700 border-blue-100',
  Excluiu: 'bg-rose-50 text-rose-700 border-rose-100',
  Webhook: 'bg-amber-50 text-amber-700 border-amber-100',
  'Recebeu pagamento': 'bg-emerald-50 text-emerald-700 border-emerald-100',
  'Liberou sem receber': 'bg-red-50 text-red-700 border-red-100',
  'Alterou senha': 'bg-violet-50 text-violet-700 border-violet-100',
  'Cadastrou parceiro': 'bg-cyan-50 text-cyan-700 border-cyan-100',
};

const getActionClass = (acao: string) => (
  actionStyles[acao] || 'bg-slate-50 text-slate-600 border-slate-100'
);

const LogsEventosConfig: React.FC = () => {
  const [modulo, setModulo] = useState('');
  const [actorTipo, setActorTipo] = useState('');
  const [pessoaTipo, setPessoaTipo] = useState('');
  const [poloId, setPoloId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: polos = [] } = useQuery<LogsEventosPolo[]>({
    queryKey: ['sistema-eventos-polos'],
    queryFn: logsEventosService.getPolos,
  });

  const { data, isLoading, isFetching, refetch, isError } = useQuery<LogsEventosPage>({
    queryKey: ['sistema-eventos', modulo, actorTipo, pessoaTipo, poloId, search, page],
    queryFn: () => logsEventosService.getEventos({
      modulo,
      actorTipo,
      pessoaTipo,
      poloId,
      search,
      page,
      pageSize: PAGE_SIZE,
    }),
  });

  const eventos = data?.items || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const firstItem = totalCount === 0 ? 0 : ((page - 1) * PAGE_SIZE) + 1;
  const lastItem = Math.min(page * PAGE_SIZE, totalCount);

  useEffect(() => {
    setPage(1);
  }, [modulo, actorTipo, pessoaTipo, poloId, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const hasFilters = useMemo(
    () => Boolean(modulo || actorTipo || pessoaTipo || poloId || search.trim()),
    [modulo, actorTipo, pessoaTipo, poloId, search],
  );

  const clearFilters = () => {
    setModulo('');
    setActorTipo('');
    setPessoaTipo('');
    setPoloId('');
    setSearch('');
    setPage(1);
  };

  return (
    <div className="animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl">
            <Activity size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Logs e Eventos</h2>
            <p className="text-slate-500 font-bold text-sm mt-0.5">Auditoria de ações registradas no sistema.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#001a33] text-white text-xs font-black uppercase tracking-widest hover:bg-blue-800 transition-colors disabled:opacity-60"
          disabled={isFetching}
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_190px_190px_190px_220px] gap-3 mb-4">
        <label className="relative block">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pesquisar por usuário, ação, módulo ou descrição..."
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
          />
        </label>

        <label className="relative block">
          <Filter size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={modulo}
            onChange={(event) => setModulo(event.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none transition-all"
          >
            <option value="">Todos os módulos</option>
            {MODULOS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>

        <label className="relative block">
          <UserRound size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={actorTipo}
            onChange={(event) => setActorTipo(event.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none transition-all"
          >
            <option value="">Executor</option>
            {TIPO_OPTIONS.slice(1).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="relative block">
          <Database size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={pessoaTipo}
            onChange={(event) => setPessoaTipo(event.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none transition-all"
          >
            <option value="">Pessoa envolvida</option>
            {TIPO_OPTIONS.slice(1, 4).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="relative block">
          <MapPin size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={poloId}
            onChange={(event) => setPoloId(event.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none transition-all"
          >
            <option value="">Todos os polos</option>
            {polos.map((polo) => (
              <option key={polo.id} value={polo.id}>{polo.nome}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 text-xs font-bold text-slate-500">
        <span>
          {totalCount > 0 ? `Mostrando ${firstItem}-${lastItem} de ${totalCount} eventos` : 'Nenhum evento nos filtros atuais'}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="self-start sm:self-auto text-blue-600 hover:text-blue-800 font-black uppercase tracking-widest"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
        <div className="grid grid-cols-[170px_1fr_180px_180px_150px] gap-4 px-5 py-3 bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400 max-xl:hidden">
          <span>Data e Hora</span>
          <span>Evento</span>
          <span>Pessoa Envolvida</span>
          <span>Executor</span>
          <span>Módulo</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400 text-sm font-bold">
            <RefreshCw size={18} className="animate-spin" />
            Carregando auditoria...
          </div>
        ) : isError ? (
          <div className="py-16 text-center text-sm font-bold text-rose-500">
            Não foi possível carregar os logs do sistema.
          </div>
        ) : eventos.length === 0 ? (
          <div className="py-16 text-center text-sm font-bold text-slate-400">
            Nenhum evento encontrado para os filtros selecionados.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {eventos.map((evento) => (
              <div key={evento.id} className="grid grid-cols-1 xl:grid-cols-[170px_1fr_180px_180px_150px] gap-3 xl:gap-4 px-5 py-4 hover:bg-slate-50/70 transition-colors">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <Clock3 size={14} className="text-slate-400" />
                  {formatDateTime(evento.dataEvento)}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`px-2 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getActionClass(evento.acao)}`}>
                      {evento.acao}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <Database size={12} />
                      {evento.origem}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-[#001a33] leading-snug">{evento.descricao}</p>
                  {evento.entidadeId && (
                    <p className="text-[10px] font-mono text-slate-400 mt-1 truncate">{evento.entidadeId}</p>
                  )}
                  {evento.poloNome && (
                    <p className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 mt-1">
                      <MapPin size={11} />
                      {evento.poloNome}
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-700 truncate">{evento.pessoaNome || 'Sem pessoa vinculada'}</p>
                  <p className="text-[10px] text-slate-400 truncate">{evento.pessoaTipo || 'Sistema'}</p>
                </div>

                <div className="flex items-center gap-2 min-w-0">
                  <UserRound size={14} className="text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-700 truncate">{evento.usuarioNome}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {evento.usuarioTipo}{evento.usuarioEmail ? ` · ${evento.usuarioEmail}` : ''}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider">
                    {evento.modulo}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-5">
        <p className="text-xs font-bold text-slate-500">
          Página {Math.min(page, totalPages)} de {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            <ChevronLeft size={14} />
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            disabled={page >= totalPages || isFetching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            Próxima
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogsEventosConfig;
