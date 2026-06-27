import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Users, 
  GraduationCap, 
  DollarSign, 
  TrendingUp, 
  UserPlus, 
  FileText, 
  Bell, 
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { dashboardService, DashboardKpis, ChartDataPoint, RecentActivityItem } from './dashboard.service';

interface DashboardPageProps {
  poloId?: string | null;
  onNavigate?: (moduleId: string) => void;
}

const ChangeBadge: React.FC<{ value: number; invertColors?: boolean }> = ({ value, invertColors = false }) => {
  const isPositive = value > 0;
  const isZero = value === 0;
  
  if (isZero) {
    return (
      <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide text-slate-500 bg-slate-50 border border-slate-150">
        Estável
      </span>
    );
  }
  
  let colorClass: string;
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  
  if (isPositive) {
    colorClass = invertColors ? 'text-rose-600 bg-rose-50 border-rose-100' : 'text-emerald-600 bg-emerald-50 border-emerald-100';
  } else {
    colorClass = invertColors ? 'text-emerald-600 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100';
  }
  
  return (
    <span className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border ${colorClass}`}>
      <Icon size={11} />
      {isPositive ? '+' : ''}{value}%
    </span>
  );
};

const DashboardPage: React.FC<DashboardPageProps> = ({ poloId, onNavigate }) => {
  
  // 1. Fetch KPIs
  const { data: kpis, isLoading: loadingKpis } = useQuery<DashboardKpis>({
    queryKey: ['dashboard_kpis', poloId],
    queryFn: () => dashboardService.getKpis(poloId),
  });

  // 2. Fetch Chart Data
  const { data: chartData = [], isLoading: loadingChart } = useQuery<ChartDataPoint[]>({
    queryKey: ['dashboard_chart', poloId],
    queryFn: () => dashboardService.getChartData(poloId, 6),
  });

  // 3. Fetch Recent Activity
  const { data: recentActivity = [], isLoading: loadingActivity } = useQuery<RecentActivityItem[]>({
    queryKey: ['dashboard_activity', poloId],
    queryFn: () => dashboardService.getRecentActivity(poloId, 5),
  });

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  };

  const formatTimeAgo = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Agora';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays === 1) return 'Ontem';
    return `${diffDays}d`;
  };

  // Determine dynamic scale for chart
  const maxVal = Math.max(...chartData.map(d => Math.max(d.receitas, d.despesas)), 1000);

  return (
    <div className="space-y-8 animate-fadeIn select-none">
      
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            Visão Geral <Sparkles className="text-yellow-500 animate-pulse" size={20} />
          </h1>
          <p className="text-slate-400 text-xs font-semibold">
            {poloId ? 'Acompanhe os principais indicadores da unidade selecionada.' : 'Acompanhe os principais indicadores consolidados de todas as unidades.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => onNavigate?.('comunicacao')}
            className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Bell size={16} />
            <span className="hidden sm:inline">Central Atendimento</span>
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-pulse">Ativo</span>
          </button>
          <button 
            onClick={() => onNavigate?.('relatorios')}
            className="flex items-center gap-2 bg-[#4169E1] text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-all hover:scale-[1.02] shadow-lg shadow-blue-900/20"
          >
            <FileText size={16} />
            <span>Novo Relatório</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Alunos Ativos */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between h-40">
          <div className="flex justify-between items-start mb-2">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-sm">
              <Users size={20} />
            </div>
            {loadingKpis ? (
              <div className="w-12 h-5 bg-slate-100 rounded animate-pulse" />
            ) : (
              <ChangeBadge value={kpis?.alunosAtivosMudanca || 0} />
            )}
          </div>
          <div>
            <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-0.5">Alunos Ativos</h3>
            {loadingKpis ? (
              <div className="w-24 h-8 bg-slate-100 rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-[#001a33] tracking-tight">
                {kpis?.alunosAtivos.toLocaleString('pt-BR') || 0}
              </p>
            )}
          </div>
        </div>

        {/* Card 2: Receita Mensal */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between h-40">
          <div className="flex justify-between items-start mb-2">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors shadow-sm">
              <DollarSign size={20} />
            </div>
            {loadingKpis ? (
              <div className="w-12 h-5 bg-slate-100 rounded animate-pulse" />
            ) : (
              <ChangeBadge value={kpis?.receitaMesMudanca || 0} />
            )}
          </div>
          <div>
            <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-0.5">Receita (Mês)</h3>
            {loadingKpis ? (
              <div className="w-28 h-8 bg-slate-100 rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-[#001a33] tracking-tight">
                {formatCurrency(kpis?.receitaMes || 0)}
              </p>
            )}
          </div>
        </div>

        {/* Card 3: Inadimplência */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between h-40">
          <div className="flex justify-between items-start mb-2">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl group-hover:bg-rose-600 group-hover:text-white transition-colors shadow-sm">
              <AlertTriangle size={20} />
            </div>
            {loadingKpis ? (
              <div className="w-12 h-5 bg-slate-100 rounded animate-pulse" />
            ) : (
              <ChangeBadge value={kpis?.taxaInadimplenciaMudanca || 0} invertColors={true} />
            )}
          </div>
          <div>
            <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-0.5">Inadimplência Geral</h3>
            {loadingKpis ? (
              <div className="w-16 h-8 bg-slate-100 rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-rose-500 tracking-tight">
                {kpis?.taxaInadimplencia || 0}%
              </p>
            )}
          </div>
        </div>

        {/* Card 4: Novas Matrículas */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group flex flex-col justify-between h-40">
          <div className="flex justify-between items-start mb-2">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors shadow-sm">
              <GraduationCap size={20} />
            </div>
            {loadingKpis ? (
              <div className="w-12 h-5 bg-slate-100 rounded animate-pulse" />
            ) : (
              <ChangeBadge value={kpis?.novasMatriculasMudanca || 0} />
            )}
          </div>
          <div>
            <h3 className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-0.5">Matrículas (Mês)</h3>
            {loadingKpis ? (
              <div className="w-16 h-8 bg-slate-100 rounded animate-pulse" />
            ) : (
              <p className="text-3xl font-black text-[#001a33] tracking-tight">
                {kpis?.novasMatriculas || 0}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Chart Area (Left - 2 Cols) */}
        <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col h-[28rem]">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider">Desempenho de Caixa</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Fluxo de Entradas vs Saídas Liquidadas</p>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-500 rounded" /> Recebido</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-450 rounded" /> Pago</span>
            </div>
          </div>
          
          {/* Chart Bars */}
          {loadingChart ? (
            <div className="flex-1 w-full bg-slate-50/50 rounded-2xl animate-pulse flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex-1 flex items-end justify-between gap-4 px-2 pb-2 border-b border-slate-100 relative h-full">
              {chartData.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs font-bold uppercase">
                  Sem movimentação financeira recente registrada.
                </div>
              ) : (
                chartData.map((point) => {
                  const heightReceitas = `${(point.receitas / maxVal) * 85}%`;
                  const heightDespesas = `${(point.despesas / maxVal) * 85}%`;

                  return (
                    <div 
                      key={`${point.mesNum}-${point.anoNum}`} 
                      className="flex flex-col items-center flex-1 h-full justify-end"
                    >
                      <div className="flex items-end gap-1 w-full justify-center h-full pb-1">
                        {/* Receitas */}
                        <div 
                          style={{ height: heightReceitas }} 
                          className="w-4 bg-blue-500 hover:bg-blue-600 rounded-t transition-all relative group cursor-pointer"
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[9px] py-1 px-1.5 rounded font-black whitespace-nowrap transition-opacity shadow-md z-30">
                            Rec: {formatCurrency(point.receitas)}
                          </div>
                        </div>
                        {/* Despesas */}
                        <div 
                          style={{ height: heightDespesas }} 
                          className="w-4 bg-rose-450 hover:bg-rose-500 rounded-t transition-all relative group cursor-pointer"
                        >
                          <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[9px] py-1 px-1.5 rounded font-black whitespace-nowrap transition-opacity shadow-md z-30">
                            Desp: {formatCurrency(point.despesas)}
                          </div>
                        </div>
                      </div>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-2">{point.mesNome}</span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Right Column: Quick Actions & Recent Activity */}
        <div className="space-y-6 flex flex-col lg:h-[28rem]">
          
          {/* Quick Actions */}
          <div className="bg-[#001a33] p-5 rounded-3xl text-white shadow-xl relative overflow-hidden flex-none flex flex-col min-h-[14rem]">
            <div className="relative z-10">
              <h3 className="text-sm font-black uppercase tracking-wider mb-4">Ações Rápidas</h3>
              <div className="space-y-2.5">
                <button 
                  onClick={() => onNavigate?.('parceiros')}
                  className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-all hover:scale-[1.02] border border-white/5 group text-left"
                >
                  <div className="p-2 bg-blue-500 text-white rounded-lg group-hover:scale-110 transition-transform">
                    <UserPlus size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Matricular / Criar Parceiro</span>
                    <span className="text-[9px] text-white/50 block">Novo cadastro de aluno ou docente</span>
                  </div>
                </button>
                <button 
                  onClick={() => onNavigate?.('caixa')}
                  className="w-full flex items-center gap-3 bg-white/5 hover:bg-white/10 p-3 rounded-xl transition-all hover:scale-[1.02] border border-white/5 group text-left"
                >
                  <div className="p-2 bg-emerald-500 text-white rounded-lg group-hover:scale-110 transition-transform">
                    <DollarSign size={16} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block">Frente de Caixa</span>
                    <span className="text-[9px] text-white/50 block">Registrar recebimento ou sangria</span>
                  </div>
                </button>
              </div>
            </div>
            {/* Background decoration */}
            <div className="absolute top-0 right-0 p-8 opacity-5 transform translate-x-1/4 -translate-y-1/4 pointer-events-none">
               <TrendingUp size={150} />
            </div>
          </div>

          {/* Recent Activity List */}
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex-1 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest mb-3">Atividade Recente</h3>
              
              {loadingActivity ? (
                <div className="space-y-3 py-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="flex gap-3 items-center animate-pulse">
                      <div className="w-8 h-8 bg-slate-100 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <div className="h-3 bg-slate-100 rounded w-1/3" />
                        <div className="h-2 bg-slate-100 rounded w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.slice(0, 3).map((activity, i) => (
                    <div key={i} className="flex items-start gap-2.5 pb-2.5 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                        activity.tipoAtividade === 'matricula' ? 'bg-blue-50 text-blue-600' :
                        activity.tipoAtividade === 'pagamento' ? 'bg-emerald-50 text-emerald-600' :
                        'bg-purple-50 text-purple-600'
                      }`}>
                        {activity.tipoAtividade === 'matricula' ? <GraduationCap size={13} /> :
                         activity.tipoAtividade === 'pagamento' ? <DollarSign size={13} /> :
                         <FileText size={13} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-[#001a33] truncate">{activity.titulo}</p>
                        <p className="text-[9px] text-slate-450 mt-0.5 truncate leading-tight">{activity.descricao}</p>
                      </div>
                      <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap mt-0.5">
                        {formatTimeAgo(activity.dataEvento)}
                      </span>
                    </div>
                  ))}
                  {recentActivity.length === 0 && (
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center py-4">
                      Sem atividades registradas.
                    </p>
                  )}
                </div>
              )}
            </div>
            
            <button 
              onClick={() => onNavigate?.('parceiros')}
              className="w-full text-center text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest pt-3 border-t border-slate-50"
            >
              Visualizar Alunos
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
