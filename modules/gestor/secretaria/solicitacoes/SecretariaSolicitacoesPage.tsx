import React, { useState, useEffect, useMemo } from 'react';
import { secretariaService, DEFAULT_PRAZOS, type PrazoConfig, type Solicitacao } from '../secretaria.service';
import { 
  Inbox, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText, 
  AlertCircle, 
  Search,
  Filter,
  Check,
  X,
  MessageSquare,
  Settings,
  History,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';



const PAGE_SIZE = 8;

// ─── Pagination component ────────────────────────────────────────────────────
const Pagination: React.FC<{ page: number; total: number; onPage: (p: number) => void }> = ({ page, total, onPage }) => {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/30">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        Página {page} de {pages} · {total} registros
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(1)} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"><ChevronsLeft size={13} /></button>
        <button onClick={() => onPage(page - 1)} disabled={page === 1} className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"><ChevronLeft size={13} /></button>
        {Array.from({ length: Math.min(5, pages) }, (_, i) => {
          const start = Math.max(1, Math.min(page - 2, pages - 4));
          const p = start + i;
          if (p > pages) return null;
          return (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-7 h-7 rounded-lg font-black text-[10px] transition-colors ${p === page ? 'bg-[#001a33] text-white' : 'hover:bg-slate-200 text-slate-600'}`}
            >
              {p}
            </button>
          );
        })}
        <button onClick={() => onPage(page + 1)} disabled={page === pages} className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"><ChevronRight size={13} /></button>
        <button onClick={() => onPage(pages)} disabled={page === pages} className="p-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-30 transition-colors text-slate-500"><ChevronsRight size={13} /></button>
      </div>
    </div>
  );
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: Solicitacao['status'] }> = ({ status }) => {
  const map = {
    Pendente: { bg: 'bg-amber-50 text-amber-600 border-amber-100', icon: <Clock size={11} /> },
    Deferido: { bg: 'bg-emerald-50 text-emerald-600 border-emerald-100', icon: <CheckCircle size={11} /> },
    Indeferido: { bg: 'bg-rose-50 text-rose-600 border-rose-100', icon: <XCircle size={11} /> }
  };
  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${s.bg}`}>
      {s.icon} {status}
    </span>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SecretariaSolicitacoesPage: React.FC = () => {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [activeTab, setActiveTab] = useState<'pendentes' | 'historico' | 'config'>('pendentes');

  // Pending tab state
  const [searchPend, setSearchPend] = useState('');
  const [typeFilterPend, setTypeFilterPend] = useState('todos');
  const [sortPend, setSortPend] = useState<'asc' | 'desc'>('asc'); // oldest first default
  const [pagePend, setPagePend] = useState(1);

  // History tab state
  const [searchHist, setSearchHist] = useState('');
  const [typeFilterHist, setTypeFilterHist] = useState('todos');
  const [statusFilterHist, setStatusFilterHist] = useState('todos');
  const [sortHist, setSortHist] = useState<'asc' | 'desc'>('desc');
  const [pageHist, setPageHist] = useState(1);

  // Modal state
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<Solicitacao | null>(null);
  const [actionType, setActionType] = useState<'deferir' | 'indeferir' | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');

  // Prazos config
  const [prazos, setPrazos] = useState<Record<string, PrazoConfig>>(DEFAULT_PRAZOS);

  // ── Load data — NUNCA localStorage, sempre Supabase ──────────────────────
  useEffect(() => {
    const loadData = async () => {
      const [sols, prz] = await Promise.all([
        secretariaService.getSolicitacoes(),
        secretariaService.getPrazos()
      ]);
      setSolicitacoes(sols);
      setPrazos(prz);
    };
    loadData();
  }, []);

  const saveToStorage = (list: Solicitacao[]) => {
    // Atualiza estado local apenas (Supabase já atualizado individualmente)
    setSolicitacoes(list);
  };

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const total = solicitacoes.length;
  const pendentes = solicitacoes.filter(s => s.status === 'Pendente').length;
  const deferidas = solicitacoes.filter(s => s.status === 'Deferido').length;
  const indeferidas = solicitacoes.filter(s => s.status === 'Indeferido').length;

  // ── Derived lists ──────────────────────────────────────────────────────────
  const sortFn = (a: Solicitacao, b: Solicitacao, dir: 'asc' | 'desc') => {
    const diff = a.dataSolicitacao.localeCompare(b.dataSolicitacao);
    return dir === 'asc' ? diff : -diff;
  };

  const pendentesFiltered = useMemo(() => {
    return solicitacoes
      .filter(s => s.status === 'Pendente')
      .filter(s => {
        const q = searchPend.toLowerCase();
        const matchSearch = !q || s.alunoNome.toLowerCase().includes(q) || s.alunoMatricula.toLowerCase().includes(q);
        const matchType = typeFilterPend === 'todos' || s.tipo === typeFilterPend;
        return matchSearch && matchType;
      })
      .sort((a, b) => sortFn(a, b, sortPend));
  }, [solicitacoes, searchPend, typeFilterPend, sortPend]);

  const historicoFiltered = useMemo(() => {
    return solicitacoes
      .filter(s => s.status !== 'Pendente')
      .filter(s => {
        const q = searchHist.toLowerCase();
        const matchSearch = !q || s.alunoNome.toLowerCase().includes(q) || s.alunoMatricula.toLowerCase().includes(q);
        const matchType = typeFilterHist === 'todos' || s.tipo === typeFilterHist;
        const matchStatus = statusFilterHist === 'todos' || s.status === statusFilterHist;
        return matchSearch && matchType && matchStatus;
      })
      .sort((a, b) => sortFn(a, b, sortHist));
  }, [solicitacoes, searchHist, typeFilterHist, statusFilterHist, sortHist]);

  const pendentesPage = pendentesFiltered.slice((pagePend - 1) * PAGE_SIZE, pagePend * PAGE_SIZE);
  const historicoPage = historicoFiltered.slice((pageHist - 1) * PAGE_SIZE, pageHist * PAGE_SIZE);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSolicitacao || !actionType) return;

    const novoStatus = actionType === 'deferir' ? 'Deferido' : 'Indeferido';
    const novaResposta = actionType === 'deferir'
      ? (documentUrl.trim() || 'Solicitação atendida. O documento foi homologado pela secretaria.')
      : justificativa.trim();
    const novaRespostaData = new Date().toISOString().split('T')[0];

    // Salva no Supabase — NUNCA localStorage
    await secretariaService.updateSolicitacao(selectedSolicitacao.id, {
      status: novoStatus as any,
      resposta: novaResposta,
      respostaData: novaRespostaData
    });

    // Atualiza estado local
    const updated = solicitacoes.map(item =>
      item.id === selectedSolicitacao.id
        ? { ...item, status: novoStatus as any, resposta: novaResposta, respostaData: novaRespostaData }
        : item
    );
    saveToStorage(updated);
    setSelectedSolicitacao(null);
    setActionType(null);
    setJustificativa('');
    setDocumentUrl('');
  };

  const updatePrazo = (tipo: string, campo: 'prazo' | 'descricao', valor: string) => {
    setPrazos(prev => ({ ...prev, [tipo]: { ...prev[tipo], [campo]: valor } }));
  };

  const handleSavePrazos = async (e: React.FormEvent) => {
    e.preventDefault();
    // Salva no Supabase — NUNCA localStorage
    const ok = await secretariaService.savePrazos(prazos);
    if (ok) {
      alert('Configurações de prazos salvas com sucesso!');
    } else {
      alert('Erro ao salvar prazos. Tente novamente.');
    }
  };

  // ── Tab reset on filter change ─────────────────────────────────────────────
  const handleSearchPend = (v: string) => { setSearchPend(v); setPagePend(1); };
  const handleSearchHist = (v: string) => { setSearchHist(v); setPageHist(1); };

  // ─── Table rows ────────────────────────────────────────────────────────────
  const TableRow: React.FC<{ item: Solicitacao; showAction?: boolean }> = ({ item, showAction = true }) => (
    <tr className="hover:bg-slate-50/50 transition-colors group">
      <td className="px-5 py-3.5">
        <div>
          <span className="font-bold text-[#001a33] text-xs block leading-tight">{item.alunoNome}</span>
          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{item.curso}</span>
        </div>
      </td>
      <td className="px-5 py-3.5 font-mono font-bold text-slate-500 text-[11px]">{item.alunoMatricula}</td>
      <td className="px-5 py-3.5">
        <span className="font-bold text-slate-800 text-xs block">{item.tipo}</span>
        <span className="text-[10px] text-slate-400 font-bold">{item.dataSolicitacao.split('-').reverse().join('/')}</span>
      </td>
      <td className="px-5 py-3.5">
        <span className={`inline-block px-2 py-0.5 rounded font-black text-[9px] uppercase ${item.tipo === 'Transferência' ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
          {item.prazo}
        </span>
      </td>
      <td className="px-5 py-3.5">
        <StatusBadge status={item.status} />
      </td>
      {showAction && (
        <td className="px-5 py-3.5 text-right">
          {item.status === 'Pendente' ? (
            <button
              onClick={() => setSelectedSolicitacao(item)}
              className="px-3.5 py-1.5 bg-[#001a33] hover:bg-blue-600 text-white rounded-lg font-bold uppercase tracking-wider text-[10px] transition-colors"
            >
              Analisar
            </button>
          ) : (
            <button
              onClick={() => setSelectedSolicitacao(item)}
              className="p-2 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
              title="Ver Resposta"
            >
              <MessageSquare size={14} />
            </button>
          )}
        </td>
      )}
    </tr>
  );

  const TableHead: React.FC<{ withAction?: boolean; sort: 'asc' | 'desc'; onSort: () => void }> = ({ withAction = true, sort, onSort }) => (
    <thead>
      <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 uppercase font-black tracking-wider text-[9px]">
        <th className="px-5 py-3">Estudante / Curso</th>
        <th className="px-5 py-3">Matrícula</th>
        <th className="px-5 py-3">
          <button onClick={onSort} className="flex items-center gap-1 hover:text-slate-700 transition-colors">
            Solicitação / Data
            {sort === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
          </button>
        </th>
        <th className="px-5 py-3">Prazo</th>
        <th className="px-5 py-3">Status</th>
        {withAction && <th className="px-5 py-3 text-right">Ação</th>}
      </tr>
    </thead>
  );

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 text-xs font-sans animate-fadeIn">

      {/* ── Top Nav Tabs ── */}
      <div className="flex gap-1 bg-white border border-slate-100 shadow-sm rounded-2xl p-1.5">
        {([
          { key: 'pendentes', label: 'Pendentes', icon: <Clock size={13} />, count: pendentes },
          { key: 'historico', label: 'Histórico', icon: <History size={13} />, count: deferidas + indeferidas },
          { key: 'config', label: 'Configurar Prazos', icon: <Settings size={13} />, count: null }
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all ${
              activeTab === tab.key
                ? 'bg-[#001a33] text-white shadow-md'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
            }`}
          >
            {tab.icon} {tab.label}
            {tab.count !== null && (
              <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── KPIs ── */}
      {activeTab !== 'config' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total', value: total, icon: <Inbox size={18} />, bg: 'bg-blue-50', color: 'text-blue-600' },
            { label: 'Pendentes', value: pendentes, icon: <Clock size={18} />, bg: 'bg-amber-50', color: 'text-amber-600' },
            { label: 'Deferidas', value: deferidas, icon: <CheckCircle size={18} />, bg: 'bg-emerald-50', color: 'text-emerald-600' },
            { label: 'Indeferidas', value: indeferidas, icon: <XCircle size={18} />, bg: 'bg-rose-50', color: 'text-rose-600' },
          ].map(k => (
            <div key={k.label} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-3">
              <div className={`p-2.5 ${k.bg} ${k.color} rounded-xl shrink-0`}>{k.icon}</div>
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{k.label}</p>
                <p className="text-xl font-black text-[#001a33] leading-none mt-0.5">{k.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ══════════════ PENDENTES TAB ══════════════ */}
      {activeTab === 'pendentes' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Filter bar */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3 bg-slate-50/40">
            <div className="relative flex-1 w-full sm:max-w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Buscar por nome ou matrícula..."
                value={searchPend}
                onChange={e => handleSearchPend(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-400 text-xs font-medium text-slate-700"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 bg-white px-3 py-2 border border-slate-200 rounded-xl flex-1 sm:flex-initial">
                <Filter size={12} className="text-slate-400 shrink-0" />
                <select value={typeFilterPend} onChange={e => { setTypeFilterPend(e.target.value); setPagePend(1); }} className="outline-none font-bold text-slate-600 bg-transparent border-none text-[11px] cursor-pointer">
                  <option value="todos">Todos Tipos</option>
                  <option value="Histórico Escolar">Histórico Escolar</option>
                  <option value="Declaração IRPF">Declaração IRPF</option>
                  <option value="Transferência">Transferência</option>
                </select>
              </div>
              <button
                onClick={() => { setSortPend(s => s === 'asc' ? 'desc' : 'asc'); setPagePend(1); }}
                className="flex items-center gap-1.5 bg-white px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 text-[11px] hover:border-blue-300 transition-colors"
              >
                <ArrowUpDown size={12} />
                {sortPend === 'asc' ? 'Mais antigos' : 'Mais recentes'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <TableHead sort={sortPend} onSort={() => { setSortPend(s => s === 'asc' ? 'desc' : 'asc'); setPagePend(1); }} />
              <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                {pendentesPage.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-slate-400 font-bold uppercase text-[10px]">
                      Nenhuma solicitação pendente encontrada.
                    </td>
                  </tr>
                ) : (
                  pendentesPage.map(item => <TableRow key={item.id} item={item} />)
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pagePend} total={pendentesFiltered.length} onPage={setPagePend} />
        </div>
      )}

      {/* ══════════════ HISTÓRICO TAB ══════════════ */}
      {activeTab === 'historico' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          {/* Filter bar */}
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center gap-3 bg-slate-50/40">
            <div className="relative flex-1 w-full sm:max-w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                placeholder="Buscar por nome ou matrícula..."
                value={searchHist}
                onChange={e => handleSearchHist(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-400 text-xs font-medium text-slate-700"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="flex items-center gap-1.5 bg-white px-3 py-2 border border-slate-200 rounded-xl flex-1 sm:flex-initial">
                <Filter size={12} className="text-slate-400 shrink-0" />
                <select value={statusFilterHist} onChange={e => { setStatusFilterHist(e.target.value); setPageHist(1); }} className="outline-none font-bold text-slate-600 bg-transparent border-none text-[11px] cursor-pointer">
                  <option value="todos">Todos Status</option>
                  <option value="Deferido">Deferido</option>
                  <option value="Indeferido">Indeferido</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 bg-white px-3 py-2 border border-slate-200 rounded-xl flex-1 sm:flex-initial">
                <FileText size={12} className="text-slate-400 shrink-0" />
                <select value={typeFilterHist} onChange={e => { setTypeFilterHist(e.target.value); setPageHist(1); }} className="outline-none font-bold text-slate-600 bg-transparent border-none text-[11px] cursor-pointer">
                  <option value="todos">Todos Tipos</option>
                  <option value="Histórico Escolar">Histórico Escolar</option>
                  <option value="Declaração IRPF">Declaração IRPF</option>
                  <option value="Transferência">Transferência</option>
                </select>
              </div>
              <button
                onClick={() => { setSortHist(s => s === 'asc' ? 'desc' : 'asc'); setPageHist(1); }}
                className="flex items-center gap-1.5 bg-white px-3 py-2 border border-slate-200 rounded-xl font-bold text-slate-600 text-[11px] hover:border-blue-300 transition-colors"
              >
                <ArrowUpDown size={12} />
                {sortHist === 'desc' ? 'Mais recentes' : 'Mais antigos'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <TableHead sort={sortHist} onSort={() => { setSortHist(s => s === 'asc' ? 'desc' : 'asc'); setPageHist(1); }} />
              <tbody className="divide-y divide-slate-50 font-medium text-slate-700">
                {historicoPage.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center text-slate-400 font-bold uppercase text-[10px]">
                      Nenhum registro no histórico encontrado.
                    </td>
                  </tr>
                ) : (
                  historicoPage.map(item => <TableRow key={item.id} item={item} />)
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={pageHist} total={historicoFiltered.length} onPage={setPageHist} />
        </div>
      )}

      {/* ══════════════ CONFIG TAB ══════════════ */}
      {activeTab === 'config' && (
        <form onSubmit={handleSavePrazos} className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-100 shadow-sm space-y-6 animate-fadeIn">
          <div>
            <h3 className="font-black text-[#001a33] text-sm uppercase tracking-tight">Configuração de Prazos de Documentos</h3>
            <p className="text-slate-500 font-medium mt-0.5">Defina os prazos e textos regulamentares exibidos no portal do aluno.</p>
          </div>

          <div className="space-y-4">
            {Object.keys(prazos).map(tipo => (
              <div key={tipo} className="p-5 bg-slate-50 border border-slate-150 rounded-2xl space-y-3">
                <h4 className="font-black text-[#001a33] text-xs uppercase tracking-wide flex items-center gap-2 pb-2 border-b border-slate-150">
                  <FileText size={13} className="text-blue-600" /> {tipo}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Prazo de Entrega</label>
                    <input
                      type="text"
                      value={prazos[tipo].prazo}
                      onChange={e => updatePrazo(tipo, 'prazo', e.target.value)}
                      placeholder="Ex: 48 horas"
                      required
                      className="w-full p-2.5 bg-white border border-slate-200 outline-none rounded-xl focus:border-blue-400 font-bold text-slate-700 text-xs"
                    />
                  </div>
                  <div className="md:col-span-3 space-y-1">
                    <label className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Descrição Regulamentar</label>
                    <textarea
                      rows={2}
                      value={prazos[tipo].descricao}
                      onChange={e => updatePrazo(tipo, 'descricao', e.target.value)}
                      required
                      className="w-full p-2.5 bg-white border border-slate-200 outline-none rounded-xl focus:border-blue-400 font-medium text-slate-700 text-xs resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button type="submit" className="px-6 py-3 bg-[#001a33] hover:bg-blue-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] transition-all shadow-md flex items-center gap-2">
              <Check size={14} /> Salvar Configurações
            </button>
          </div>
        </form>
      )}

      {/* ══════════════ ANALYSIS MODAL ══════════════ */}
      {selectedSolicitacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl relative overflow-hidden animate-slideUp">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
              <div>
                <h4 className="font-black text-[#001a33] text-sm uppercase tracking-wide">
                  {selectedSolicitacao.status === 'Pendente' ? 'Análise de Solicitação' : 'Detalhe da Solicitação'}
                </h4>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Protocolo #{selectedSolicitacao.id}</p>
              </div>
              <button
                onClick={() => { setSelectedSolicitacao(null); setActionType(null); }}
                className="p-1.5 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 rounded-xl transition-colors shadow-sm"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl grid grid-cols-2 gap-4">
                {[
                  { label: 'Aluno', value: selectedSolicitacao.alunoNome },
                  { label: 'Matrícula', value: selectedSolicitacao.alunoMatricula },
                  { label: 'Documento', value: selectedSolicitacao.tipo },
                  { label: 'Prazo Regulamentar', value: selectedSolicitacao.prazo },
                ].map(f => (
                  <div key={f.label}>
                    <span className="text-[9px] text-slate-400 font-black uppercase tracking-wider block">{f.label}</span>
                    <span className="font-bold text-[#001a33] text-xs">{f.value}</span>
                  </div>
                ))}
              </div>

              {selectedSolicitacao.status !== 'Pendente' ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selectedSolicitacao.status} />
                    <span className="text-[10px] font-bold text-slate-400">
                      Processado em {selectedSolicitacao.respostaData?.split('-').reverse().join('/')}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Retorno da Secretaria:</span>
                    <p className="text-slate-700 text-xs leading-relaxed font-semibold italic">"{selectedSolicitacao.resposta}"</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleActionSubmit} className="space-y-4">
                  {!actionType ? (
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setActionType('deferir')} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md flex items-center justify-center gap-2 transition-colors">
                        <Check size={15} /> Deferir
                      </button>
                      <button type="button" onClick={() => setActionType('indeferir')} className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold uppercase tracking-wider text-xs shadow-md flex items-center justify-center gap-2 transition-colors">
                        <X size={15} /> Indeferir
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 animate-fadeIn">
                      {actionType === 'deferir' ? (
                        <div className="space-y-2">
                          <label className="text-slate-400 font-black uppercase tracking-wider text-[9px]">Mensagem ou Link do Documento</label>
                          <input
                            type="text" value={documentUrl} onChange={e => setDocumentUrl(e.target.value)}
                            placeholder="Ex: Documento enviado para o e-mail / link do drive..."
                            required
                            className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-emerald-500 font-semibold text-slate-700 text-xs"
                          />
                          <p className="text-[10px] text-slate-400 flex items-start gap-1 font-medium bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                            <AlertCircle size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                            Ao deferir, o documento ficará disponível para o aluno com o retorno informado acima.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <label className="text-slate-400 font-black uppercase tracking-wider text-[9px]">Justificativa do Indeferimento</label>
                          <textarea
                            rows={3} value={justificativa} onChange={e => setJustificativa(e.target.value)}
                            placeholder="Motivo detalhado para a rejeição..."
                            required
                            className="w-full p-3 bg-slate-50 border border-slate-200 outline-none rounded-xl focus:border-rose-500 font-medium text-slate-700 text-xs resize-none leading-relaxed"
                          />
                        </div>
                      )}
                      <div className="flex gap-2 justify-end pt-2 border-t border-slate-100">
                        <button type="button" onClick={() => setActionType(null)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px] rounded-lg transition-colors">
                          Voltar
                        </button>
                        <button type="submit" className={`px-5 py-2.5 text-white font-bold uppercase tracking-wider text-[10px] rounded-lg shadow-md transition-colors ${actionType === 'deferir' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                          Confirmar
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SecretariaSolicitacoesPage;
