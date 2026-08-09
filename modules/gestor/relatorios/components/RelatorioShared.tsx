import React from 'react';
import { Printer } from 'lucide-react';
import DocumentHeader from '../../components/DocumentHeader';
import ReportWatermark from './ReportWatermark';

export const MODALIDADE_LABELS: Record<string, string> = {
  todos: 'Todas',
  TECNICO: 'Cursos Técnicos',
  EAD: 'EAD',
  LIVRE: 'Cursos Livres',
  ESPECIALIZACAO: 'Especialização',
  SUPERIOR: 'Ensino Superior',
};

export const STATUS_LABELS: Record<string, string> = {
  todos: 'Todos',
  ATIVO: 'Cursando',
  CONCLUIDO: 'Concluído',
  TRANCADO: 'Trancado',
  CANCELADO: 'Cancelado',
  DESISTENTE: 'Desistente',
  TRANSFERIDO: 'Transferido',
  REPROVADO: 'Reprovado',
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
  onPrint?: () => void;
  printDisabled?: boolean;
  printLabel?: string;
}> = ({
  title = 'Filtros do Relatório',
  children,
  summary,
  onPrint = printReport,
  printDisabled = false,
  printLabel = 'Imprimir / PDF',
}) => (
  <div className="w-full lg:w-80 bg-white rounded-3xl p-5 border border-slate-100 shadow-sm shrink-0 flex flex-col justify-between">
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-black text-[#001a33] uppercase tracking-wider mb-3">{title}</h3>
        <div className="space-y-3">{children}</div>
      </div>
      {summary && <div className="border-t border-slate-100 pt-4 space-y-3">{summary}</div>}
    </div>

    <button
      type="button"
      onClick={onPrint}
      disabled={printDisabled}
      className="w-full mt-6 py-3 bg-[#001a33] hover:bg-blue-900 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
    >
      <Printer size={15} /> {printLabel}
    </button>
  </div>
);

export const FilterField: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{label}</span>
    {children}
  </label>
);

export const FilterSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
  <select
    {...props}
    className={`w-full cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${props.className || ''}`}
  />
);

export const FilterInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className={`w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-200 ${props.className || ''}`}
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

export const A4ReportPrintStyles: React.FC<{ printAreaId?: string }> = ({
  printAreaId = 'print-area',
}) => (
  <style>{`
    @media print {
      body * {
        visibility: hidden !important;
      }

      #${printAreaId},
      #${printAreaId} * {
        visibility: visible !important;
      }

      #${printAreaId} {
        position: absolute !important;
        inset: 0 auto auto 0 !important;
        display: block !important;
        width: 210mm !important;
        min-width: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
      }

      #${printAreaId}.a4-report-page,
      #${printAreaId} .a4-report-page {
        display: flex !important;
        flex-direction: column !important;
        box-sizing: border-box !important;
        width: 210mm !important;
        min-width: 210mm !important;
        height: 297mm !important;
        min-height: 297mm !important;
        margin: 0 !important;
        padding: 10mm !important;
        box-shadow: none !important;
        break-after: page;
        page-break-after: always;
      }

      #${printAreaId}.a4-report-page:last-child,
      #${printAreaId} .a4-report-page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      @page {
        size: A4 portrait;
        margin: 0;
      }
    }
  `}</style>
);

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
  printAreaId?: string;
  pages?: React.ReactNode[];
  children?: React.ReactNode;
}> = ({
  company,
  polo,
  loading,
  title,
  description,
  rightTitle,
  rightType,
  meta,
  kpis,
  printAreaId = 'print-area',
  pages,
  children,
}) => {
  const reportPages = pages?.length ? pages : [children];
  const generatedAt = new Date().toLocaleString('pt-BR');

  return (
    <div className="min-h-[70vh] flex-1 overflow-auto rounded-3xl bg-slate-200/40 p-4 custom-scrollbar sm:p-8 lg:min-h-0">
      <A4ReportPrintStyles printAreaId={printAreaId} />
      {loading ? (
        <div className="flex w-full items-center justify-center py-20" role="status" aria-label="Carregando relatório">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div id={printAreaId} className="flex min-w-max flex-col items-center gap-4 print:block">
          {reportPages.map((pageContent, pageIndex) => (
            <section
              key={`report-page-${pageIndex + 1}`}
              className="a4-report-page relative box-border flex h-[297mm] min-h-[297mm] w-[210mm] min-w-[210mm] shrink-0 flex-col overflow-hidden bg-white p-10 text-slate-800 shadow-lg"
              aria-label={`Página ${pageIndex + 1} de ${reportPages.length}`}
            >
              <ReportWatermark polo={polo} orientation="portrait" />

              <DocumentHeader
                company={company}
                polo={polo}
                orientation="portrait"
                meta={{ title: rightTitle, label: 'Tipo', value: rightType }}
              />

              {pageIndex === 0 ? (
                <>
                  <div className="relative z-10 mb-6 border-b pb-4">
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">{title}</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">{description}</p>
                  </div>

                  {meta && <div className="relative z-10 mb-6 grid grid-cols-3 gap-4">{meta}</div>}
                  {kpis && <div className="relative z-10 mb-6 grid grid-cols-3 gap-4 text-center">{kpis}</div>}
                </>
              ) : (
                <div className="relative z-10 mb-4 flex items-center justify-between border-b pb-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">{title}</h3>
                    <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">Continuação</p>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                    Página {pageIndex + 1} de {reportPages.length}
                  </span>
                </div>
              )}

              <div className="relative z-10 min-h-0 flex-1 overflow-hidden">{pageContent}</div>
              <footer className="relative z-10 mt-3 grid shrink-0 grid-cols-3 items-center border-t border-slate-100 pt-2 text-[8px] font-bold uppercase tracking-widest text-slate-400">
                <span>Universo Cursos e Consultoria</span>
                <span className="text-center">Gerado em {generatedAt}</span>
                <span className="text-right">Página {pageIndex + 1} de {reportPages.length}</span>
              </footer>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

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
