import React from 'react';
import { Users, GraduationCap, Landmark, DollarSign, ChevronRight } from 'lucide-react';

export type ReportType = 'nfse-emitidas' | 'turmas' | 'polos' | 'cursos' | 'extrato-financeiro-conta' | 'financeiro-entradas' | 'financeiro-saidas' | 'financeiro-receitas' | 'financeiro-despesas' | 'financeiro-resumo-categorias' | 'financeiro-resumo-entradas' | 'financeiro-fluxo-caixa' | 'dre' | 'inadimplencia' | 'estagios' | 'financeiro-turma-mensal' | 'financeiro-pre-estagio' | 'alunos-cursando' | 'alunos-finalizados' | 'matriculas' | 'matricula-inicial' | 'situacao-aluno' | 'lucro-turma';

export interface ReportMenuItem {
  id: ReportType;
  label: string;
  description: string;
  icon: React.ReactNode;
  category: 'operacional' | 'financeiro' | 'academico' | 'oficial';
}

interface RelatoriosCatalogProps {
  operacionais: ReportMenuItem[];
  academicos: ReportMenuItem[];
  oficiais: ReportMenuItem[];
  financeiros: ReportMenuItem[];
  onSelectReport: (reportId: ReportType) => void;
}

const RelatoriosCatalog: React.FC<RelatoriosCatalogProps> = ({
  operacionais,
  academicos,
  oficiais,
  financeiros,
  onSelectReport,
}: RelatoriosCatalogProps) => (
  <div className="relatorios-catalog h-full overflow-y-auto custom-scrollbar p-6 space-y-8 select-none">
    
    {/* Category: Administrativo & Operacional */}
    <div className="relatorios-catalog-group space-y-4">
      <div className="relatorios-catalog-group-title flex items-center gap-2 border-b border-slate-200 pb-2">
        <Users size={16} className="text-blue-600" />
        <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest">
          Relatórios Administrativos e Operacionais
        </h3>
      </div>
      <div className="relatorios-catalog-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {operacionais.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectReport(item.id)}
            className="relatorios-catalog-card group bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all text-left flex flex-col justify-between h-52 relative overflow-hidden"
          >
            <div>
              <div className="relatorios-catalog-icon w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 transition-colors group-hover:bg-blue-600 group-hover:text-white shadow-sm">
                {item.icon}
              </div>
              <h4 className="text-sm font-black text-[#001a33] group-hover:text-blue-900 transition-colors uppercase tracking-tight">
                {item.label}
              </h4>
              <p className="text-xs text-slate-450 font-medium leading-relaxed mt-2 line-clamp-3">
                {item.description}
              </p>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-widest mt-4">
              Gerar Relatório <ChevronRight size={12} className="transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>
    </div>

    {/* Category: Academico */}
    <div className="relatorios-catalog-group space-y-4">
      <div className="relatorios-catalog-group-title flex items-center gap-2 border-b border-slate-200 pb-2">
        <GraduationCap size={16} className="text-cyan-700" />
        <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest">
          Relatórios Acadêmicos
        </h3>
      </div>
      <div className="relatorios-catalog-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {academicos.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectReport(item.id)}
            className="relatorios-catalog-card group bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-lg hover:border-cyan-200 transition-all text-left flex flex-col justify-between h-52 relative overflow-hidden"
          >
            <div>
              <div className="relatorios-catalog-icon w-12 h-12 bg-cyan-50 text-cyan-700 rounded-2xl flex items-center justify-center mb-4 transition-colors group-hover:bg-cyan-700 group-hover:text-white shadow-sm">
                {item.icon}
              </div>
              <h4 className="text-sm font-black text-[#001a33] group-hover:text-cyan-800 transition-colors uppercase tracking-tight">
                {item.label}
              </h4>
              <p className="text-xs text-slate-450 font-medium leading-relaxed mt-2 line-clamp-3">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-black text-cyan-700 uppercase tracking-widest mt-4">
              Gerar Relatório <ChevronRight size={12} className="transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>
    </div>

    {/* Category: Oficial */}
    <div className="relatorios-catalog-group space-y-4">
      <div className="relatorios-catalog-group-title flex items-center gap-2 border-b border-slate-200 pb-2">
        <Landmark size={16} className="text-orange-700" />
        <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest">
          Relatórios Oficiais / Censo Escolar
        </h3>
      </div>
      <div className="relatorios-catalog-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {oficiais.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectReport(item.id)}
            className="relatorios-catalog-card group bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-lg hover:border-orange-200 transition-all text-left flex flex-col justify-between h-52 relative overflow-hidden"
          >
            <div>
              <div className="relatorios-catalog-icon w-12 h-12 bg-orange-50 text-orange-700 rounded-2xl flex items-center justify-center mb-4 transition-colors group-hover:bg-orange-700 group-hover:text-white shadow-sm">
                {item.icon}
              </div>
              <h4 className="text-sm font-black text-[#001a33] group-hover:text-orange-800 transition-colors uppercase tracking-tight">
                {item.label}
              </h4>
              <p className="text-xs text-slate-450 font-medium leading-relaxed mt-2 line-clamp-3">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-black text-orange-700 uppercase tracking-widest mt-4">
              Gerar Relatório <ChevronRight size={12} className="transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>
    </div>

    {/* Category: Financeiro */}
    <div className="relatorios-catalog-group space-y-4">
      <div className="relatorios-catalog-group-title flex items-center gap-2 border-b border-slate-200 pb-2">
        <DollarSign size={16} className="text-emerald-600" />
        <h3 className="text-xs font-black text-[#001a33] uppercase tracking-widest">
          Relatórios Financeiros e Fiscais
        </h3>
      </div>
      <div className="relatorios-catalog-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {financeiros.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectReport(item.id)}
            className="relatorios-catalog-card group bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-lg hover:border-emerald-250 transition-all text-left flex flex-col justify-between h-52 relative overflow-hidden"
          >
            <div>
              <div className="relatorios-catalog-icon w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 transition-colors group-hover:bg-emerald-600 group-hover:text-white shadow-sm">
                {item.icon}
              </div>
              <h4 className="text-sm font-black text-[#001a33] group-hover:text-emerald-700 transition-colors uppercase tracking-tight">
                {item.label}
              </h4>
              <p className="text-xs text-slate-450 font-medium leading-relaxed mt-2 line-clamp-3">
                {item.description}
              </p>
            </div>

            <div className="flex items-center gap-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-4">
              Gerar Relatório <ChevronRight size={12} className="transition-transform group-hover:translate-x-1" />
            </div>
          </button>
        ))}
      </div>
    </div>

  </div>
);

export default RelatoriosCatalog;
