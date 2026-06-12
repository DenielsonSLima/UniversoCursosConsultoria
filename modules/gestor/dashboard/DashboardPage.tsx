
import React from 'react';
import { 
  Users, 
  GraduationCap, 
  DollarSign, 
  TrendingUp, 
  UserPlus, 
  FileText, 
  Bell, 
  MoreHorizontal,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-8 animate-fadeIn">
      
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Visão Geral</h1>
          <p className="text-slate-500 text-sm">Acompanhe os principais indicadores da instituição em tempo real.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm">
            <Bell size={16} />
            <span className="hidden sm:inline">Notificações</span>
            <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">3</span>
          </button>
          <button className="flex items-center gap-2 bg-[#4169E1] text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors shadow-lg shadow-blue-900/20">
            <FileText size={16} />
            <span>Novo Relatório</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Alunos Ativos */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Users size={24} />
            </div>
            <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide">
              <ArrowUpRight size={12} /> +12%
            </span>
          </div>
          <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Alunos Ativos</h3>
          <p className="text-3xl font-black text-[#001a33]">1.245</p>
        </div>

        {/* Card 2: Receita Mensal */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <DollarSign size={24} />
            </div>
            <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide">
              <ArrowUpRight size={12} /> +5.4%
            </span>
          </div>
          <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Receita (Mês)</h3>
          <p className="text-3xl font-black text-[#001a33]">R$ 125k</p>
        </div>

        {/* Card 3: Inadimplência */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl group-hover:bg-rose-600 group-hover:text-white transition-colors">
              <TrendingUp size={24} />
            </div>
            <span className="flex items-center gap-1 text-rose-600 bg-rose-50 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide">
              <ArrowDownRight size={12} /> -0.8%
            </span>
          </div>
          <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Inadimplência</h3>
          <p className="text-3xl font-black text-[#001a33]">2.4%</p>
        </div>

        {/* Card 4: Novas Matrículas */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <GraduationCap size={24} />
            </div>
            <span className="flex items-center gap-1 text-slate-500 bg-slate-50 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide">
              Estável
            </span>
          </div>
          <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Novas Matrículas</h3>
          <p className="text-3xl font-black text-[#001a33]">48</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart Area (Left - 2 Cols) */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-lg font-bold text-[#001a33] uppercase tracking-tight">Desempenho Financeiro</h3>
            <select className="bg-slate-50 border border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 outline-none">
              <option>Últimos 6 meses</option>
              <option>Este Ano</option>
            </select>
          </div>
          
          {/* Placeholder for Chart */}
          <div className="flex-1 flex items-end justify-between gap-4 h-64 px-4 pb-4 border-b border-slate-100 relative">
            {/* Barras do Gráfico (Simuladas com CSS) */}
            <div className="w-full bg-blue-100 rounded-t-xl hover:bg-blue-600 transition-colors relative group h-[40%]">
              <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity">R$ 45k</div>
            </div>
            <div className="w-full bg-blue-100 rounded-t-xl hover:bg-blue-600 transition-colors relative group h-[55%]">
               <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity">R$ 62k</div>
            </div>
            <div className="w-full bg-blue-100 rounded-t-xl hover:bg-blue-600 transition-colors relative group h-[45%]">
               <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity">R$ 51k</div>
            </div>
            <div className="w-full bg-blue-100 rounded-t-xl hover:bg-blue-600 transition-colors relative group h-[70%]">
               <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity">R$ 88k</div>
            </div>
            <div className="w-full bg-blue-100 rounded-t-xl hover:bg-blue-600 transition-colors relative group h-[60%]">
               <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity">R$ 75k</div>
            </div>
            <div className="w-full bg-[#4169E1] rounded-t-xl relative group h-[85%] shadow-lg shadow-blue-500/30">
               <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-[#001a33] text-white text-[10px] py-1 px-2 rounded font-bold transition-opacity">R$ 125k</div>
            </div>
          </div>
          <div className="flex justify-between mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest px-2">
            <span>Jan</span><span>Fev</span><span>Mar</span><span>Abr</span><span>Mai</span><span>Jun</span>
          </div>
        </div>

        {/* Right Column: Quick Actions & Recent Activity */}
        <div className="space-y-6">
          
          {/* Quick Actions */}
          <div className="bg-[#001a33] p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-6 uppercase tracking-tight">Ações Rápidas</h3>
              <div className="space-y-3">
                <button className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors backdrop-blur-sm border border-white/5 group">
                  <div className="p-2 bg-blue-500 rounded-lg group-hover:scale-110 transition-transform"><UserPlus size={16} /></div>
                  <span className="text-sm font-medium">Matricular Aluno</span>
                </button>
                <button className="w-full flex items-center gap-3 bg-white/10 hover:bg-white/20 p-3 rounded-xl transition-colors backdrop-blur-sm border border-white/5 group">
                  <div className="p-2 bg-emerald-500 rounded-lg group-hover:scale-110 transition-transform"><DollarSign size={16} /></div>
                  <span className="text-sm font-medium">Registrar Pagamento</span>
                </button>
              </div>
            </div>
            {/* Background decoration */}
            <div className="absolute top-0 right-0 p-8 opacity-5 transform translate-x-1/4 -translate-y-1/4">
               <TrendingUp size={150} />
            </div>
          </div>

          {/* Recent Activity List */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="text-sm font-bold text-[#001a33] uppercase tracking-widest mb-4">Atividade Recente</h3>
            <div className="space-y-4">
              {[1, 2, 3].map((_, i) => (
                <div key={i} className="flex items-start gap-3 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-xs font-bold">
                    {i === 0 ? 'MA' : i === 1 ? 'JP' : 'TR'}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-[#001a33]">
                      {i === 0 ? 'Maria Silva' : i === 1 ? 'João Paulo' : 'Thiago Rocha'}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {i === 0 ? 'Realizou matrícula em Enfermagem' : i === 1 ? 'Efetuou pagamento da mensalidade' : 'Solicitou histórico escolar'}
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {i === 0 ? '2min' : i === 1 ? '15min' : '1h'}
                  </span>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 text-center text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-widest py-2">
              Ver tudo
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
