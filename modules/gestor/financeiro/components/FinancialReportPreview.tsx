import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2, Printer, X } from 'lucide-react';
import DocumentHeader from '../../components/DocumentHeader';
import { empresasService } from '../../configuracoes/empresas/empresas.service';
import { polosService } from '../../configuracoes/polos/polos.service';

export type FinancialReportTone = 'emerald' | 'rose' | 'blue' | 'slate' | 'amber';

export interface FinancialReportColumn {
  label: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface FinancialReportRow {
  id: string;
  cells: React.ReactNode[];
  className?: string;
}

export interface FinancialReportSummaryCard {
  label: string;
  value: React.ReactNode;
  tone?: FinancialReportTone;
}

export interface FinancialReportFilter {
  label: string;
  value: React.ReactNode;
}

interface FinancialReportPreviewModalProps {
  title: string;
  subtitle?: string;
  rightTitle?: string;
  rightType?: string;
  fileName: string;
  columns: FinancialReportColumn[];
  rows: FinancialReportRow[];
  summaryCards?: FinancialReportSummaryCard[];
  filters?: FinancialReportFilter[];
  footerNote?: string;
  poloId?: string | null;
  polo?: any;
  company?: any;
  tone?: FinancialReportTone;
  onClose: () => void;
}

interface FinancialReportExportButtonProps extends Omit<FinancialReportPreviewModalProps, 'onClose'> {
  buttonLabel?: string;
  buttonClassName?: string;
  disabled?: boolean;
}

const toneStyles: Record<FinancialReportTone, { button: string; text: string; bg: string; border: string }> = {
  emerald: {
    button: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
  },
  rose: {
    button: 'border-rose-200 text-rose-700 hover:bg-rose-50',
    text: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-100',
  },
  blue: {
    button: 'border-blue-200 text-blue-700 hover:bg-blue-50',
    text: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
  },
  slate: {
    button: 'border-slate-200 text-slate-700 hover:bg-slate-50',
    text: 'text-[#001a33]',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
  },
  amber: {
    button: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
  },
};

const statusStyles: Record<string, string> = {
  PAGO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  RECEBIDO: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PENDENTE: 'bg-amber-50 text-amber-700 border-amber-200',
  VENCIDO: 'bg-rose-50 text-rose-700 border-rose-200',
  SUSPENSO: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELADO: 'bg-slate-100 text-slate-500 border-slate-200',
  ESTORNADO: 'bg-slate-100 text-slate-500 border-slate-200',
  DEVOLVIDO: 'bg-slate-100 text-slate-500 border-slate-200',
};

const alignClass = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const formatDateTime = () =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

const safeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const currentSessionPoloId = () => {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id') || '';
};

const buildPdfFromElement = async (element: HTMLElement, fileName: string) => {
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ]);
  const html2canvas = html2canvasModule.default;
  const previousBoxShadow = element.style.boxShadow;

  let canvas: any;
  try {
    element.style.boxShadow = 'none';
    canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
    });
  } finally {
    element.style.boxShadow = previousBoxShadow;
  }

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const pageCanvasHeight = Math.floor((canvas.width * pageHeightMm) / pageWidthMm);

  for (let position = 0, pageIndex = 0; position < canvas.height; position += pageCanvasHeight, pageIndex += 1) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - position);
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;
    const context = sliceCanvas.getContext('2d');
    if (!context) continue;

    context.drawImage(
      canvas,
      0,
      position,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );

    if (pageIndex > 0) pdf.addPage('a4', 'portrait');
    const sliceHeightMm = (sliceHeight * pageWidthMm) / canvas.width;
    pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.94), 'JPEG', 0, 0, pageWidthMm, sliceHeightMm);
  }

  pdf.save(`${safeFileName(fileName)}.pdf`);
};

export const FinancialReportStatusBadge: React.FC<{ status: string; label?: string }> = ({ status, label }) => {
  const normalized = String(status || 'PENDENTE').toUpperCase();
  return (
    <span className={`inline-flex items-center rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${statusStyles[normalized] || statusStyles.PENDENTE}`}>
      {label || normalized}
    </span>
  );
};

const FinancialReportPreviewModal: React.FC<FinancialReportPreviewModalProps> = ({
  title,
  subtitle,
  rightTitle = 'Extrato Financeiro',
  rightType = 'Financeiro',
  fileName,
  columns,
  rows,
  summaryCards = [],
  filters = [],
  footerNote,
  poloId,
  polo,
  company,
  tone = 'slate',
  onClose,
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const emittedAt = useMemo(formatDateTime, []);
  const resolvedPoloId = poloId || currentSessionPoloId();
  const toneStyle = toneStyles[tone];

  const { data: fetchedCompany } = useQuery({
    queryKey: ['financeiro-report-company-principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
    staleTime: 60_000,
    enabled: !company,
  });

  const { data: fetchedPolo } = useQuery({
    queryKey: ['financeiro-report-polo', resolvedPoloId],
    queryFn: () => resolvedPoloId ? polosService.getById(resolvedPoloId) : Promise.resolve(null),
    staleTime: 60_000,
    enabled: !polo && Boolean(resolvedPoloId),
  });

  const reportCompany = company || fetchedCompany;
  const reportPolo = polo || fetchedPolo;

  const handleDownload = async () => {
    const element = reportRef.current;
    if (!element) return;
    setDownloading(true);
    try {
      await buildPdfFromElement(element, fileName);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5">
      <style>{`
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #financeiro-report-print-area, #financeiro-report-print-area * { visibility: visible !important; }
          #financeiro-report-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 210mm !important;
            min-width: 210mm !important;
            min-height: auto !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          #financeiro-report-print-area thead { display: table-header-group; }
          #financeiro-report-print-area .financeiro-report-row {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .financeiro-report-no-print { display: none !important; }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>

      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
        <div className="financeiro-report-no-print flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="truncate text-base font-black uppercase tracking-tight text-[#001a33]">{title}</h3>
            <p className="text-xs font-bold text-slate-400">{rows.length} lançamento(s) no extrato</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50"
            >
              <Printer size={15} />
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wider disabled:opacity-60 ${toneStyle.button}`}
            >
              {downloading ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
              {downloading ? 'Gerando...' : 'Baixar PDF'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-200/70 p-4">
          <div className="flex min-w-max justify-center">
            <div
              ref={reportRef}
              id="financeiro-report-print-area"
              className="relative box-border min-h-[297mm] w-[210mm] min-w-[210mm] bg-white p-[12mm] text-slate-800 shadow-xl"
            >
              {reportPolo?.watermark_url ? (
                <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none">
                  <img
                    src={reportPolo.watermark_url}
                    alt="Marca d'água"
                    style={{
                      opacity: reportPolo.watermark_opacity ?? 0.1,
                      width: `${reportPolo.watermark_scale ?? 50}%`,
                      transform: reportPolo.watermark_rotate !== false ? 'rotate(-45deg)' : 'none',
                    }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 z-0 flex items-center justify-center overflow-hidden pointer-events-none select-none opacity-[0.03]">
                  <h1 className="rotate-[-45deg] text-center text-6xl font-black tracking-widest text-slate-900">
                    UNIVERSO CURSOS E CONSULTORIA
                  </h1>
                </div>
              )}

              <div className="relative z-10">
                <DocumentHeader
                  company={reportCompany}
                  polo={reportPolo}
                  orientation="portrait"
                  rightContent={
                    <div className="text-right">
                      <h2 className="text-sm font-black uppercase tracking-tight text-slate-800">{rightTitle}</h2>
                      <p className="mt-2 text-[9px] font-black uppercase tracking-widest text-slate-400">Emissão</p>
                      <p className="text-xs font-bold text-[#001a33]">{emittedAt}</p>
                      <div className="mt-2 inline-block rounded-lg bg-slate-100 px-2.5 py-1">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">Tipo</p>
                        <p className="text-[10px] font-black uppercase text-[#001a33]">{rightType}</p>
                      </div>
                    </div>
                  }
                />

                <section className="mb-5 border-b border-slate-200 pb-4">
                  <h4 className={`text-lg font-black uppercase tracking-tight ${toneStyle.text}`}>{title}</h4>
                  {subtitle && <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>}
                </section>

                {filters.length > 0 && (
                  <section className="mb-5 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    {filters.map((filter) => (
                      <div key={filter.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{filter.label}</p>
                        <div className="mt-0.5 text-[10px] font-bold uppercase leading-snug text-slate-700">{filter.value}</div>
                      </div>
                    ))}
                  </section>
                )}

                {summaryCards.length > 0 && (
                  <section className="mb-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 4)}, minmax(0, 1fr))` }}>
                    {summaryCards.map((card) => {
                      const cardTone = toneStyles[card.tone || 'slate'];
                      return (
                        <div key={card.label} className={`rounded-xl border px-3 py-2 text-center ${cardTone.bg} ${cardTone.border}`}>
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">{card.label}</p>
                          <div className={`mt-1 text-xs font-black ${cardTone.text}`}>{card.value}</div>
                        </div>
                      );
                    })}
                  </section>
                )}

                <table className="w-full border-collapse text-left text-[10px]">
                  <thead>
                    <tr className={`${toneStyle.bg} border-y border-slate-200`}>
                      {columns.map((column) => (
                        <th
                          key={column.label}
                          className={`px-2 py-2 font-black uppercase tracking-widest text-slate-500 ${alignClass[column.align || 'left']} ${column.className || ''}`}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={columns.length} className="px-3 py-10 text-center text-xs font-bold uppercase tracking-wider text-slate-400">
                          Nenhum lançamento encontrado.
                        </td>
                      </tr>
                    ) : rows.map((row, index) => (
                      <tr
                        key={row.id}
                        className={`financeiro-report-row border-b border-slate-100 ${index % 2 === 0 ? 'bg-white/90' : 'bg-slate-50/80'} ${row.className || ''}`}
                      >
                        {columns.map((column, cellIndex) => (
                          <td
                            key={`${row.id}-${column.label}`}
                            className={`px-2 py-2 align-top leading-snug ${alignClass[column.align || 'left']} ${column.className || ''}`}
                          >
                            {row.cells[cellIndex] ?? null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <footer className="mt-8 flex items-center justify-between border-t border-slate-200 pt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  <span>{footerNote || 'Documento emitido pelo Portal de Gestão Universo Cursos e Consultoria.'}</span>
                  <span>{rows.length} registro(s)</span>
                </footer>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const FinancialReportExportButton: React.FC<FinancialReportExportButtonProps> = ({
  buttonLabel = 'Extrato PDF',
  buttonClassName = '',
  disabled,
  tone = 'slate',
  ...modalProps
}) => {
  const [open, setOpen] = useState(false);
  const toneStyle = toneStyles[tone];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneStyle.button} ${buttonClassName}`}
        title="Abrir preview do extrato em PDF"
      >
        <FileText size={14} />
        {buttonLabel}
      </button>
      {open && (
        <FinancialReportPreviewModal
          {...modalProps}
          tone={tone}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

export default FinancialReportExportButton;
