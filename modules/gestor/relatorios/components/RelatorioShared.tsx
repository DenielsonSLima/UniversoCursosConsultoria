import React from 'react';
import { Printer } from 'lucide-react';
import DocumentHeader from '../../components/DocumentHeader';

export const MODALIDADE_LABELS: Record<string, string> = {
  todos: 'Todas',
  TECNICO: 'Cursos Técnicos',
  EAD: 'EAD',
  LIVRE: 'Cursos Livres',
  ESPECIALIZACAO: 'Especialização',
};

export const STATUS_LABELS: Record<string, string> = {
  todos: 'Todos',
  ATIVO: 'Cursando',
  CONCLUIDO: 'Concluído',
  TRANCADO: 'Trancado',
  CANCELADO: 'Cancelado',
  DESISTENTE: 'Desistente',
  TRANSFERIDO: 'Transferido',
  PAGO: 'Pago',
  PENDENTE: 'Pendente',
  VENCIDO: 'Vencido',
};

export const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const formatDate = (value?: string | null) => {
  if (!value) return '-';
  const clean = String(value).split('T')[0];
  const [year, month, day] = clean.split('-');
  return year && month && day ? `${day}/${month}/${year}` : clean;
};

export const formatCompetencia = (value: string) => {
  const [year, month] = value.split('-');
  return `${month}/${year}`;
};

export const printReport = () => window.print();

export const ReportFilterPanel: React.FC<{
  title?: string;
  children: React.ReactNode;
  summary?: React.ReactNode;
}> = ({ title = 'Filtros do Relatório', children, summary }) => (
  <div className="w-full lg:w-80 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">{title}</h3>
        <div className="space-y-3">{children}</div>
      </div>
      {summary && <div className="border-t border-slate-100 pt-4 space-y-3">{summary}</div>}
    </div>

    <button
      onClick={printReport}
      className="w-full mt-6 py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg flex items-center justify-center gap-2"
    >
      <Printer size={15} /> Imprimir / PDF
    </button>
  </div>
);

export const FilterField: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{label}</span>
    {children}
  </div>
);

export const FilterSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select
    {...props}
    className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none cursor-pointer ${props.className || ''}`}
  />
);

export const FilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none ${props.className || ''}`}
  />
);

export const SummaryCard: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: 'blue' | 'emerald' | 'red' | 'amber' | 'slate';
}> = ({ label, value, tone = 'slate' }) => {
  const colors = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    red: 'text-red-500',
    amber: 'text-amber-600',
    slate: 'text-[#001a33]',
  };

  return (
    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
      <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-black mt-0.5 ${colors[tone]}`}>{value}</p>
    </div>
  );
};

export const A4ReportShell: React.FC<{
  company: any;
  polo: any;
  loading: boolean;
  title: string;
  description: string;
  rightTitle: string;
  rightType: string;
  meta?: React.ReactNode;
  kpis?: React.ReactNode;
  children: React.ReactNode;
}> = ({ company, polo, loading, title, description, rightTitle, rightType, meta, kpis, children }) => (
  <div className="flex-1 bg-slate-200/40 rounded-3xl p-4 sm:p-8 flex justify-center overflow-auto custom-scrollbar">
    {loading ? (
      <div className="flex items-center justify-center py-20 w-full">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    ) : (
      <div
        className="bg-white w-[210mm] min-w-[210mm] min-h-[297mm] shadow-lg p-10 relative flex flex-col print:shadow-none print:p-0 print:w-auto print:max-w-none print:min-h-0 text-slate-800 shrink-0"
        id="print-area"
      >
        {polo?.watermark_url ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden">
            <img
              src={polo.watermark_url}
              alt="Watermark"
              style={{
                opacity: polo.watermark_opacity ?? 0.1,
                width: `${polo.watermark_scale ?? 50}%`,
                transform: 'rotate(-45deg)',
              }}
            />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden select-none opacity-[0.03]">
            <h1 className="text-6xl font-black rotate-[-45deg] tracking-widest text-slate-900 text-center">
              UNIVERSO CURSOS E CONSULTORIA
            </h1>
          </div>
        )}

        <DocumentHeader
          company={company}
          polo={polo}
          orientation="portrait"
          rightContent={
            <div className="text-right">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">{rightTitle}</h2>
              <div className="px-2.5 py-1 bg-slate-100 rounded-lg inline-block mt-2">
                <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Tipo</p>
                <p className="text-[10px] font-bold text-[#001a33] uppercase">{rightType}</p>
              </div>
            </div>
          }
        />

        <div className="mb-6 relative z-10 border-b pb-4">
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{title}</h3>
          <p className="text-xs text-slate-500 font-medium mt-1">{description}</p>
        </div>

        {meta && <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">{meta}</div>}
        {kpis && <div className="grid grid-cols-3 gap-4 mb-6 relative z-10 text-center">{kpis}</div>}

        <div className="relative z-10 flex-1">{children}</div>
      </div>
    )}
  </div>
);

export const ReportMetaCard: React.FC<{
  label: string;
  value: React.ReactNode;
}> = ({ label, value }) => (
  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
    <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider">{label}</span>
    <p className="text-[10px] font-bold text-slate-800 uppercase mt-0.5">{value}</p>
  </div>
);

export const ReportKpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: 'blue' | 'emerald' | 'red' | 'amber' | 'slate';
}> = ({ label, value, tone = 'slate' }) => {
  const colors = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    red: 'text-red-500',
    amber: 'text-amber-600',
    slate: 'text-[#001a33]',
  };
  return (
    <div className="border border-slate-250 p-2.5 rounded-xl bg-white/95">
      <span className="text-[8px] font-black text-slate-450 uppercase tracking-widest">{label}</span>
      <p className={`text-xs font-black mt-0.5 ${colors[tone]}`}>{value}</p>
    </div>
  );
};

export const EmptyReportState: React.FC<{ message?: string }> = ({ message = 'Nenhum registro encontrado para os filtros selecionados.' }) => (
  <div className="border border-dashed border-slate-300 rounded-2xl p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
    {message}
  </div>
);
