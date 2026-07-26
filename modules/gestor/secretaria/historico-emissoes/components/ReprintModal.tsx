import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Award, ChevronLeft, ChevronRight, Download, Loader2, Printer, X } from 'lucide-react';
import { isCertificateDocument } from '../historico-emissoes.constants';
import type {
  AcademicPreviewData,
  EmissionLog,
} from '../historico-emissoes.types';
import type { CertificadoAcademico } from '../../certificados/certificados.types';
import EmissionDocumentPages from './EmissionDocumentPages';

interface Props {
  emission: EmissionLog;
  templateConfig: any;
  certificatePreview: CertificadoAcademico | null;
  watermark: any;
  poloInfo: any;
  academicPreviewData: AcademicPreviewData | null;
  error: string | null;
  isLoading: boolean;
  isDownloading: boolean;
  isReissuing: boolean;
  printContentRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  heading?: string;
  subtitle?: string;
  printLabel?: string;
  downloadLabel?: string;
  navigationLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  unavailableHeading?: string;
  unavailableNote?: string;
  fullscreenViewer?: boolean;
}

const ReprintModal: React.FC<Props> = ({
  emission,
  templateConfig,
  certificatePreview,
  watermark,
  poloInfo,
  academicPreviewData,
  error,
  isLoading,
  isDownloading,
  isReissuing,
  printContentRef,
  onClose,
  onDownload,
  onPrint,
  heading = 'Segunda Via de Documento',
  subtitle,
  printLabel = 'Imprimir (Registrar 2ª Via)',
  downloadLabel,
  navigationLabel,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  unavailableHeading = 'Documento indisponível para reemissão',
  unavailableNote = 'A impressão e o PDF foram bloqueados para evitar um documento acadêmico incompleto.',
  fullscreenViewer = false,
}) => {
  const isCertificate = isCertificateDocument(emission.documento);
  const isBlocked = Boolean(error) || (!isLoading && isCertificate && !certificatePreview);

  useEffect(() => {
    if (!fullscreenViewer) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDownloading && !isReissuing) onClose();
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [fullscreenViewer, isDownloading, isReissuing, onClose]);

  const modal = (
    <div
      className={fullscreenViewer
        ? 'fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen animate-fadeIn bg-slate-950'
        : 'fixed inset-0 z-[130] flex animate-fadeIn bg-slate-900/60 backdrop-blur-sm'}
      id="reprint-modal"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
    >
      <div className={`flex h-full min-h-0 w-full flex-col overflow-hidden shadow-2xl animate-slideUp ${fullscreenViewer ? 'bg-slate-950' : 'bg-white'}`}>
        <div className={`flex shrink-0 flex-col gap-3 px-4 py-3 print:hidden sm:flex-row sm:items-center sm:justify-between sm:px-6 ${fullscreenViewer ? 'border-b border-white/10 bg-slate-800 text-white shadow-md' : 'border-b border-slate-200 bg-slate-50 sm:py-4'}`}>
          <div>
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              {fullscreenViewer && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-700/50 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                  aria-label="Fechar visualizador"
                >
                  <ArrowLeft size={16} /> Voltar
                </button>
              )}
              <div className="min-w-0">
                <h4 className={`truncate text-sm font-black uppercase tracking-wide ${fullscreenViewer ? 'text-white' : 'text-[#001a33]'}`}>{heading}</h4>
                <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {subtitle || `Visualização do Código: ${emission.codigo}`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(onPrevious || onNext) && (
              <div className={`flex items-center gap-1 rounded-xl p-1 shadow-sm ${fullscreenViewer ? 'border border-white/15 bg-white/10' : 'border border-slate-200 bg-white'}`}>
                <button
                  type="button"
                  onClick={onPrevious}
                  disabled={!onPrevious || previousDisabled || isLoading}
                  aria-label="Documento anterior"
                  className={`rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${fullscreenViewer ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  <ChevronLeft size={14} />
                </button>
                {navigationLabel && (
                  <span className={`min-w-16 px-1 text-center text-[9px] font-black uppercase tracking-wider ${fullscreenViewer ? 'text-slate-300' : 'text-slate-500'}`}>
                    {navigationLabel}
                  </span>
                )}
                <button
                  type="button"
                  onClick={onNext}
                  disabled={!onNext || nextDisabled || isLoading}
                  aria-label="Próximo documento"
                  className={`rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${fullscreenViewer ? 'text-slate-300 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
            <button onClick={onDownload} disabled={isDownloading || isLoading || isBlocked} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-wider shadow-sm transition-colors disabled:opacity-50 ${fullscreenViewer ? 'border border-white/15 bg-white/10 text-white hover:bg-white/20 sm:px-5 sm:py-3 sm:text-xs' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
              {isDownloading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {downloadLabel || (fullscreenViewer ? 'Download PDF' : 'PDF')}
            </button>
            <button onClick={onPrint} disabled={isReissuing || isLoading || isBlocked} className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white shadow-md transition-colors disabled:opacity-50 ${fullscreenViewer ? 'bg-blue-600 hover:bg-blue-700 sm:px-6 sm:py-3 sm:text-xs' : 'bg-[#001a33] hover:bg-blue-900'}`}>
              {isReissuing ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />} {printLabel}
            </button>
            {!fullscreenViewer && (
              <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-sm transition-colors hover:text-rose-500"><X size={16} /></button>
            )}
          </div>
        </div>

        <div className={`flex min-h-0 flex-1 justify-center overflow-auto p-3 custom-scrollbar sm:p-6 lg:p-8 ${fullscreenViewer ? 'bg-slate-900' : 'bg-slate-100'}`}>
          <div ref={printContentRef} className="print-content-container">
            {isLoading && (
              <div className="flex h-[297mm] w-[210mm] max-w-full flex-col items-center justify-center bg-white text-slate-400">
                <Loader2 className="mb-4 animate-spin text-blue-600" size={36} />
                <span className="text-[10px] font-black uppercase tracking-widest">Carregando modelo oficial...</span>
              </div>
            )}
            {!isLoading && error && (
              <div className="flex min-h-[120mm] w-[210mm] max-w-full flex-col items-center justify-center rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-xl">
                <Award className="mb-4 text-rose-500" size={38} />
                <h5 className="text-sm font-black uppercase tracking-widest text-[#001a33]">{unavailableHeading}</h5>
                <p className="mt-3 max-w-md text-xs font-bold leading-relaxed text-slate-500">{error}</p>
                <p className="mt-2 max-w-md text-[10px] font-semibold text-rose-600">{unavailableNote}</p>
              </div>
            )}

            {!isLoading && !error && isCertificate && !certificatePreview && (
              <div className="min-h-[120mm] w-[210mm] max-w-full rounded-2xl border border-amber-100 bg-white p-8 text-center shadow-xl">
                <Award className="mx-auto mb-4 text-amber-500" size={38} />
                <h5 className="text-sm font-black uppercase tracking-widest text-[#001a33]">Certificado oficial não localizado</h5>
                <p className="mx-auto mt-3 max-w-md text-xs font-bold leading-relaxed text-slate-500">O histórico possui um código de certificado, mas não há um registro acadêmico finalizado correspondente para renderizar a segunda via oficial.</p>
              </div>
            )}
            {!isLoading && !error && (!isCertificate || certificatePreview) && (
              <EmissionDocumentPages
                emission={emission}
                templateConfig={templateConfig}
                certificatePreview={certificatePreview}
                watermark={watermark}
                poloInfo={poloInfo}
                academicPreviewData={academicPreviewData}
              />
            )}
          </div>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: buildPrintCss(isCertificate) }} />
    </div>
  );

  return fullscreenViewer && typeof document !== 'undefined'
    ? createPortal(modal, document.body)
    : modal;
};

const buildPrintCss = (landscape: boolean) => `
  @media print {
    body * { visibility: hidden; }
    #reprint-modal, #reprint-modal * { visibility: visible; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    #reprint-modal { position: absolute; left: 0; top: 0; width: ${landscape ? '297mm' : '210mm'} !important; height: auto !important; background: white !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; box-shadow: none !important; }
    .print-page { width: 210mm !important; height: 297mm !important; page-break-after: always !important; page-break-inside: avoid !important; margin: 0 !important; padding: 20mm !important; box-shadow: none !important; border: none !important; background: white !important; box-sizing: border-box !important; overflow: hidden !important; }
    .print-page.reprint-card-page { padding: 5mm !important; }
    [data-certificate-pdf-page="true"] { width: 297mm !important; height: 210mm !important; page-break-after: always !important; page-break-inside: avoid !important; margin: 0 !important; box-shadow: none !important; border-radius: 0 !important; overflow: hidden !important; }
    .reprint-card-page .print-fold-grid { display: grid !important; grid-template-rows: repeat(5, 54mm) !important; row-gap: 1.5mm !important; align-content: start !important; }
    .print-page img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .print\\:hidden { display: none !important; }
  }
  @page { size: ${landscape ? 'A4 landscape' : 'A4 portrait'}; margin: 0; }
`;

export default ReprintModal;
