import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2, Printer, X } from 'lucide-react';
import DocumentHeader from '../../components/DocumentHeader';
import { empresasService } from '../../configuracoes/empresas/empresas.service';
import { polosService } from '../../configuracoes/polos/polos.service';
import {
  buildSelectablePdfBlobFromElements,
  downloadPdfBlob,
} from '../../../shared/pdf/dom-to-selectable-pdf';

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
  recordLabel?: string;
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
  onBeforeOpen?: () => Promise<void>;
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

const FIRST_PAGE_ROW_LIMIT = 17;
const CONTINUATION_PAGE_ROW_LIMIT = 19;

const paginateRows = (rows: FinancialReportRow[]) => {
  if (rows.length === 0) return [[]];

  const pages: FinancialReportRow[][] = [rows.slice(0, FIRST_PAGE_ROW_LIMIT)];
  for (let index = FIRST_PAGE_ROW_LIMIT; index < rows.length; index += CONTINUATION_PAGE_ROW_LIMIT) {
    pages.push(rows.slice(index, index + CONTINUATION_PAGE_ROW_LIMIT));
  }
  return pages;
};

const buildPdfFromElement = async (element: HTMLElement, fileName: string) => {
  const pageElements = Array.from(
    element.querySelectorAll<HTMLElement>('.financeiro-report-page'),
  );
  const pages = pageElements.length > 0 ? pageElements : [element];
  const blob = await buildSelectablePdfBlobFromElements(pages, {
    orientation: 'portrait',
    artworkFormat: 'PNG',
    artworkScale: 2,
    title: fileName,
    subject: 'Relatório financeiro institucional',
  });
  downloadPdfBlob(blob, `${safeFileName(fileName)}.pdf`);
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
  recordLabel = 'registro(s)',
  poloId,
  polo,
  company,
  tone = 'slate',
  onClose,
}) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const emittedAt = useMemo(formatDateTime, []);
  const resolvedPoloId = poloId || currentSessionPoloId();
  const toneStyle = toneStyles[tone];

  const {
    data: fetchedCompany,
    error: companyLoadError,
    isLoading: isCompanyLoading,
  } = useQuery({
    queryKey: ['financeiro-report-company-principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
    staleTime: 60_000,
    enabled: !company,
  });

  const {
    data: fetchedPolo,
    error: poloLoadError,
    isLoading: isPoloLoading,
  } = useQuery({
    queryKey: ['financeiro-report-polo', resolvedPoloId],
    queryFn: () => resolvedPoloId ? polosService.getById(resolvedPoloId) : Promise.resolve(null),
    staleTime: 60_000,
    refetchOnMount: 'always',
    enabled: !polo && Boolean(resolvedPoloId),
  });

  const reportCompany = company || fetchedCompany;
  const reportPolo = polo || fetchedPolo;
  const reportAssetsLoading = (!company && isCompanyLoading)
    || (!polo && Boolean(resolvedPoloId) && isPoloLoading);
  const reportAssetsError = (!company && companyLoadError)
    || (!polo && Boolean(resolvedPoloId) && poloLoadError);
  const reportErrorMessage = reportAssetsError
    ? 'Não foi possível carregar a identidade visual do relatório. Atualize a página e tente novamente.'
    : downloadError;
  const paginatedRows = useMemo(() => paginateRows(rows), [rows]);

  const handleDownload = async () => {
    const element = reportRef.current;
    if (!element || reportAssetsLoading) return;
    if (reportAssetsError) {
      setDownloadError('Não foi possível carregar a identidade visual do relatório. Atualize a página e tente novamente.');
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      await buildPdfFromElement(element, fileName);
    } catch (error) {
      console.error('Erro ao exportar relatório financeiro:', error);
      setDownloadError(
        error instanceof Error
          ? error.message
          : 'Não foi possível gerar o PDF. Confira os dados do relatório e tente novamente.',
      );
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
            display: block !important;
            width: auto !important;
            min-width: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
          #financeiro-report-print-area .financeiro-report-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }
          #financeiro-report-print-area .financeiro-report-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
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
            <p className="text-xs font-bold text-slate-400">
              {rows.length} {recordLabel} em {paginatedRows.length} página(s)
            </p>
            {reportAssetsLoading && (
              <p className="mt-1 text-xs font-bold text-blue-600">Carregando identidade visual...</p>
            )}
            {reportErrorMessage && (
              <p className="mt-1 max-w-2xl text-xs font-bold text-rose-600" role="alert">
                {reportErrorMessage}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={reportAssetsLoading || Boolean(reportAssetsError)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={15} />
              Imprimir
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading || reportAssetsLoading || Boolean(reportAssetsError)}
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
              className="flex w-[210mm] min-w-[210mm] flex-col gap-4 text-slate-800"
            >
              {paginatedRows.map((pageRows, pageIndex) => {
                const isFirstPage = pageIndex === 0;
                const rowOffset = isFirstPage
                  ? 0
                  : FIRST_PAGE_ROW_LIMIT + ((pageIndex - 1) * CONTINUATION_PAGE_ROW_LIMIT);

                return (
                  <section
                    key={`page-${pageIndex + 1}`}
                    className="financeiro-report-page relative box-border flex h-[297mm] min-h-[297mm] w-[210mm] flex-col overflow-hidden bg-white p-[12mm] shadow-xl"
                  >
                    {reportPolo?.watermark_url ? (
                      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                        <img
                          src={reportPolo.watermark_url}
                          alt=""
                          aria-hidden="true"
                          style={{
                            opacity: reportPolo.watermark_opacity ?? 0.1,
                            width: `${reportPolo.watermark_scale ?? 50}%`,
                            transform: reportPolo.watermark_rotate !== false ? 'rotate(-45deg)' : 'none',
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        data-pdf-raster-text="true"
                        className="pointer-events-none absolute inset-0 z-0 flex select-none items-center justify-center overflow-hidden opacity-[0.03]"
                      >
                        <h1 className="rotate-[-45deg] text-center text-6xl font-black tracking-widest text-slate-900">
                          UNIVERSO CURSOS E CONSULTORIA
                        </h1>
                      </div>
                    )}

                    <div className="relative z-10 flex h-full flex-col pb-8">
                      <DocumentHeader
                        company={reportCompany}
                        polo={reportPolo}
                        orientation="portrait"
                        meta={{ title: rightTitle, label: 'Tipo', value: rightType }}
                      />

                      {isFirstPage ? (
                        <>
                          <section className="mb-4 border-b border-slate-200 pb-3">
                            <h4 className={`text-lg font-black uppercase tracking-tight ${toneStyle.text}`}>{title}</h4>
                            {subtitle && <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>}
                          </section>

                          {filters.length > 0 && (
                            <section className="mb-4 grid gap-2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                              {filters.map((filter) => (
                                <div key={filter.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                  <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">{filter.label}</p>
                                  <div className="mt-0.5 text-[10px] font-bold uppercase leading-snug text-slate-700">{filter.value}</div>
                                </div>
                              ))}
                            </section>
                          )}

                          {summaryCards.length > 0 && (
                            <section className="mb-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(summaryCards.length, 4)}, minmax(0, 1fr))` }}>
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
                        </>
                      ) : (
                        <section className="mb-4 flex items-end justify-between border-b border-slate-200 pb-3">
                          <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-400">Continuação</p>
                            <h4 className={`mt-1 text-base font-black uppercase tracking-tight ${toneStyle.text}`}>{title}</h4>
                          </div>
                          <p className="text-[9px] font-bold uppercase text-slate-400">
                            Registros {rowOffset + 1} a {rowOffset + pageRows.length}
                          </p>
                        </section>
                      )}

                      <table className="w-full border-collapse text-left text-[9px]">
                        <thead>
                          <tr className={`${toneStyle.bg} border-y border-slate-200`}>
                            {columns.map((column) => (
                              <th
                                key={column.label}
                                className={`px-2 py-1.5 font-black uppercase tracking-widest text-slate-500 ${alignClass[column.align || 'left']} ${column.className || ''}`}
                              >
                                {column.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.length === 0 ? (
                            <tr>
                              <td colSpan={columns.length} className="px-3 py-10 text-center text-xs font-bold uppercase tracking-wider text-slate-400">
                                Nenhum registro encontrado.
                              </td>
                            </tr>
                          ) : pageRows.map((row, index) => (
                            <tr
                              key={row.id}
                              className={`financeiro-report-row border-b border-slate-100 ${(rowOffset + index) % 2 === 0 ? 'bg-white/90' : 'bg-slate-50/80'} ${row.className || ''}`}
                            >
                              {columns.map((column, cellIndex) => (
                                <td
                                  key={`${row.id}-${column.label}`}
                                  className={`px-2 py-[3px] align-top leading-snug ${alignClass[column.align || 'left']} ${column.className || ''}`}
                                >
                                  {row.cells[cellIndex] ?? null}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      <footer className="absolute inset-x-0 bottom-0 grid min-h-7 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 border-t border-slate-200 bg-white/95 pt-2 text-[8px] font-bold uppercase tracking-wider text-slate-400">
                        <span className="truncate">{footerNote || 'Documento emitido pelo Portal de Gestão Universo Cursos e Consultoria.'}</span>
                        <span className="whitespace-nowrap font-medium normal-case tracking-normal text-slate-300">
                          Emitido em {emittedAt}
                        </span>
                        <span className="whitespace-nowrap">Página {pageIndex + 1} de {paginatedRows.length} · {rows.length} {recordLabel}</span>
                      </footer>
                    </div>
                  </section>
                );
              })}
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
  onBeforeOpen,
  tone = 'slate',
  ...modalProps
}) => {
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const toneStyle = toneStyles[tone];

  const handleOpen = async () => {
    if (preparing) return;
    try {
      setPreparing(true);
      await onBeforeOpen?.();
      setOpen(true);
    } catch {
      // A tela chamadora apresenta a mensagem específica de erro.
    } finally {
      setPreparing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={disabled || preparing}
        className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneStyle.button} ${buttonClassName}`}
        title="Abrir preview do extrato em PDF"
      >
        {preparing ? <Loader2 className="animate-spin" size={14} /> : <FileText size={14} />}
        {preparing ? 'Preparando...' : buttonLabel}
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
