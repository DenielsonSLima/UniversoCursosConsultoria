import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Printer,
  Table,
  X,
} from 'lucide-react';
import { empresasService } from '../../../configuracoes/empresas/empresas.service';
import { polosService } from '../../../configuracoes/polos/polos.service';
import type { ParceirosTabType } from '../../hooks/useParceirosFilters';
import PdfTemplate from './templates/PdfTemplate';
import {
  buildParceirosCsv,
  buildParceirosReportFileName,
  downloadBlob,
  normalizeParceirosForExport,
} from './parceiros-export.utils';
import {
  buildSelectablePdfBlobFromElements,
  downloadPdfBlob,
} from '../../../../shared/pdf/dom-to-selectable-pdf';

interface ParceirosExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: any[];
  activeTab: ParceirosTabType;
  poloId?: string | null;
  filtrosAtuais?: {
    searchTerm?: string;
    statusFilter?: string;
    alunoModalidadeFilter?: string[];
    turmaFilter?: string;
    turmaFilterLabel?: string;
  };
}

const buildPdfFromElement = async (element: HTMLElement, fileName: string) => {
  const pages = Array.from(element.querySelectorAll<HTMLElement>('.partners-report-page'));
  if (pages.length === 0) throw new Error('Nenhuma página foi encontrada para exportação.');
  const blob = await buildSelectablePdfBlobFromElements(pages, {
    orientation: 'portrait',
    artworkFormat: 'PNG',
    artworkScale: 2,
    title: 'Relatório de parceiros',
    subject: 'Registros e filtros do cadastro de parceiros',
  });
  downloadPdfBlob(blob, `${fileName}.pdf`);
};

const ParceirosExportModal: React.FC<ParceirosExportModalProps> = ({
  isOpen,
  onClose,
  items,
  activeTab,
  poloId,
  filtrosAtuais,
}) => {
  const [activeView, setActiveView] = useState<'opcoes' | 'preview-pdf'>('opcoes');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [exportError, setExportError] = useState('');
  const reportRef = useRef<HTMLDivElement>(null);
  const resolvedPoloId = poloId
    || (typeof window !== 'undefined'
      ? sessionStorage.getItem('current_polo_id') || sessionStorage.getItem('active_polo_id')
      : null);
  const reportFileName = useMemo(buildParceirosReportFileName, []);
  const normalizedRows = useMemo(() => normalizeParceirosForExport(items), [items]);

  const companyQuery = useQuery({
    queryKey: ['parceiros-export-company-principal'],
    queryFn: () => empresasService.getCompanyPrincipal(),
    enabled: isOpen,
    staleTime: 60_000,
  });

  const poloQuery = useQuery({
    queryKey: ['parceiros-export-polo', resolvedPoloId],
    queryFn: () => resolvedPoloId ? polosService.getById(resolvedPoloId) : Promise.resolve(null),
    enabled: isOpen && Boolean(resolvedPoloId),
    staleTime: 60_000,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (isOpen) return;
    setActiveView('opcoes');
    setIsGeneratingPdf(false);
    setExportError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const isReportLoading = companyQuery.isLoading
    || (Boolean(resolvedPoloId) && poloQuery.isLoading);
  const reportLoadError = companyQuery.error || poloQuery.error;

  const handleDownloadCsv = () => {
    const csv = buildParceirosCsv(normalizedRows);
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `${reportFileName}.csv`,
    );
    onClose();
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current || isReportLoading || reportLoadError) return;
    setIsGeneratingPdf(true);
    setExportError('');
    try {
      await buildPdfFromElement(reportRef.current, reportFileName);
    } catch (error) {
      console.error('Não foi possível gerar o relatório de parceiros:', error);
      setExportError('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className={`flex max-h-[94vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl transition-all duration-300 ${
        activeView === 'preview-pdf' ? 'max-w-6xl' : 'max-w-md'
      }`}>
        <div className="flex items-center justify-between border-b border-slate-100 p-6">
          <div>
            <h2 className="text-xl font-black tracking-tighter text-[#001a33]">
              {activeView === 'opcoes' ? 'Exportar Parceiros' : 'Visualização do PDF'}
            </h2>
            <p className="mt-1 text-xs font-bold text-slate-400">
              {items.length} registro(s) filtrado(s)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar exportação"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-6">
          {activeView === 'opcoes' ? (
            <div className="space-y-4">
              <p className="mb-6 text-sm font-medium text-slate-500">
                Escolha o formato para exportar exatamente os registros e filtros exibidos na tela.
              </p>

              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setExportError('');
                    setActiveView('preview-pdf');
                  }}
                  className="group flex items-start gap-4 rounded-2xl border border-slate-200 p-4 text-left transition-all hover:border-red-200 hover:bg-red-50"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 transition-transform group-hover:scale-110">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#001a33] group-hover:text-red-700">Exportar como PDF</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">Documento A4 com marca d’água e paginação</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="group flex items-start gap-4 rounded-2xl border border-slate-200 p-4 text-left transition-all hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 transition-transform group-hover:scale-110">
                    <Table size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#001a33] group-hover:text-emerald-700">Exportar para Excel</h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">Arquivo .csv compatível com Excel</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="h-[70vh] overflow-auto rounded-2xl border border-slate-300 bg-slate-200 p-4 shadow-inner">
              {isReportLoading ? (
                <div className="flex h-full min-h-[420px] items-center justify-center">
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <Loader2 className="animate-spin text-blue-600" size={32} />
                    <p className="text-xs font-black uppercase tracking-widest">Preparando relatório</p>
                  </div>
                </div>
              ) : reportLoadError ? (
                <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center">
                  <p className="max-w-md text-sm font-bold text-rose-600">
                    Não foi possível carregar os dados institucionais e a marca d’água do polo.
                  </p>
                </div>
              ) : (
                <div
                  ref={reportRef}
                  id="parceiros-report-print-area"
                  className="mx-auto flex w-[210mm] min-w-[210mm] flex-col gap-4"
                >
                  <PdfTemplate
                    items={items}
                    activeTab={activeTab}
                    company={companyQuery.data}
                    polo={poloQuery.data}
                    filtrosAtuais={filtrosAtuais}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 p-6">
          {activeView === 'preview-pdf' ? (
            <>
              <button
                type="button"
                onClick={() => setActiveView('opcoes')}
                disabled={isGeneratingPdf}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                <ArrowLeft size={16} /> Voltar
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={isReportLoading || Boolean(reportLoadError) || isGeneratingPdf}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-widest text-slate-700 transition-colors hover:bg-white disabled:opacity-50"
              >
                <Printer size={16} /> Imprimir
              </button>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isReportLoading || Boolean(reportLoadError) || isGeneratingPdf}
                className="flex min-w-40 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-red-600/20 transition-colors hover:bg-red-700 disabled:opacity-60"
              >
                {isGeneratingPdf ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                {isGeneratingPdf ? 'Gerando...' : 'Baixar PDF'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-6 py-3 text-xs font-bold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancelar
            </button>
          )}
        </div>

        {exportError && (
          <div className="border-t border-rose-100 bg-rose-50 px-6 py-3 text-center text-xs font-bold text-rose-600">
            {exportError}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          #parceiros-report-print-area,
          #parceiros-report-print-area * { visibility: visible !important; }
          #parceiros-report-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            display: block !important;
            width: auto !important;
            min-width: 0 !important;
            margin: 0 !important;
          }
          #parceiros-report-print-area .partners-report-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
            break-after: page;
            page-break-after: always;
          }
          #parceiros-report-print-area .partners-report-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
          #parceiros-report-print-area .partners-report-row {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          @page { size: A4 portrait; margin: 0; }
        }
      `}</style>
    </div>
  );
};

export default ParceirosExportModal;
