import React from 'react';
import { BarChart3, BookOpenCheck, MonitorPlay, Plus, Users } from 'lucide-react';

interface CursosEadOverviewProps {
  readOnly: boolean;
  handleCreateNew: () => void;
  dashboard: { totalCursos: number; totalAlunos: number; cursosAtivos: number };
  monthlyTrend: any[];
}

const formatMonthLabelPtBr = (item: any) => {
  const rawLabel = String(item?.label || item?.month || '').trim();
  const normalizedLabel = rawLabel.toUpperCase().replace('.', '');
  const englishToPtBr: Record<string, string> = {
    JAN: 'JAN',
    FEB: 'FEV',
    MAR: 'MAR',
    APR: 'ABR',
    MAY: 'MAI',
    JUN: 'JUN',
    JUL: 'JUL',
    AUG: 'AGO',
    SEP: 'SET',
    OCT: 'OUT',
    NOV: 'NOV',
    DEC: 'DEZ'
  };

  if (englishToPtBr[normalizedLabel]) return englishToPtBr[normalizedLabel];

  const rawMonth = String(item?.month || '').trim();
  const numericMonth = rawMonth.match(/^\d{4}-(\d{1,2})/)?.[1] || rawMonth.match(/^(\d{1,2})$/)?.[1];
  if (numericMonth) {
    const ptBrMonths = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    return ptBrMonths[Number(numericMonth) - 1] || rawLabel.toUpperCase();
  }

  return rawLabel.toUpperCase();
};

const CursosEadOverview: React.FC<CursosEadOverviewProps> = ({ readOnly, handleCreateNew, dashboard, monthlyTrend }) => (
  <>
      {/* Header */}
      <div className="formacao-recursos-header flex flex-col md:flex-row justify-between items-start md:items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="formacao-recursos-title text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Cursos EAD
          </h2>
          <p className="formacao-recursos-subtitle text-slate-500 font-medium mt-1">
            Gestão de cursos na modalidade de Educação a Distância (online).
          </p>
        </div>
        
        {!readOnly && <button
          onClick={handleCreateNew}
          className="formacao-recursos-primary flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-purple-700 hover:shadow-lg hover:shadow-purple-600/20 transition-all shadow-md"
        >
          <Plus size={16} /> Novo Curso EAD
        </button>}
      </div>

      {readOnly && (
        <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800">
          Modo de visualização do polo: cadastros e alterações são exclusivos da Matriz.
        </div>
      )}

      {/* KPIs e gráfico calculados pelo Supabase */}
      <div className="formacao-recursos-stats grid grid-cols-1 lg:grid-cols-12 items-start gap-4 mb-6">
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 items-start gap-4">
          <div className="formacao-recursos-stat min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
            <div className="formacao-recursos-stat-icon w-9 h-9 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
              <BookOpenCheck size={18} />
            </div>
            <p className="formacao-recursos-stat-label text-[10px] font-black uppercase tracking-widest text-slate-400">Total de cursos EAD</p>
            <p className="formacao-recursos-stat-value text-2xl font-black text-[#001a33] mt-1">{dashboard.totalCursos}</p>
          </div>

          <div className="formacao-recursos-stat min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
            <div className="formacao-recursos-stat-icon w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
              <Users size={18} />
            </div>
            <p className="formacao-recursos-stat-label text-[10px] font-black uppercase tracking-widest text-slate-400">Alunos em EAD</p>
            <p className="formacao-recursos-stat-value text-2xl font-black text-[#001a33] mt-1">{dashboard.totalAlunos}</p>
          </div>

          <div className="formacao-recursos-stat min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
            <div className="formacao-recursos-stat-icon w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <MonitorPlay size={18} />
            </div>
            <p className="formacao-recursos-stat-label text-[10px] font-black uppercase tracking-widest text-slate-400">Cursos publicados</p>
            <p className="formacao-recursos-stat-value text-2xl font-black text-[#001a33] mt-1">{dashboard.cursosAtivos}</p>
          </div>
        </div>

        <div className="formacao-recursos-trend lg:col-span-4 min-h-[132px] bg-white border border-slate-200 rounded-3xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="formacao-recursos-stat-label text-[10px] font-black uppercase tracking-widest text-slate-400">Inscrições EAD</p>
              <h3 className="text-sm font-black text-[#001a33] uppercase tracking-tight">Últimos 3 meses</h3>
            </div>
            <BarChart3 size={18} className="text-purple-600" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {monthlyTrend.map((item: any) => (
              <div key={item.month} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-center">
                <p className="text-xl font-black text-[#001a33] leading-none">{item.total}</p>
                <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{formatMonthLabelPtBr(item)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

  </>
);

export default CursosEadOverview;
