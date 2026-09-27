import React, { type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import SecretariaDeclaracaoDocumentPages from './SecretariaDeclaracaoDocumentPages';
import type { DeclaracaoAluno } from './declaracao-matricula.types';

interface SecretariaDeclaracaoPrintViewerProps {
  alunos: DeclaracaoAluno[];
  documentTitle: string;
  frequenciesByStudent: Record<string, number>;
  isDownloading: boolean;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  poloInfo: any;
  printContentRef: RefObject<HTMLDivElement>;
  templateConfig: any;
  validationCodes: Record<string, string>;
  validationExpirations: Record<string, string | null>;
  validationPublicByStudent: Record<string, boolean>;
  watermark: any;
}

const SecretariaDeclaracaoPrintViewer = ({
  alunos,
  documentTitle,
  frequenciesByStudent,
  isDownloading,
  onClose,
  onDownload,
  onPrint,
  poloInfo,
  printContentRef,
  templateConfig,
  validationCodes,
  validationExpirations,
  validationPublicByStudent,
  watermark,
}: SecretariaDeclaracaoPrintViewerProps) => createPortal(
  <div
    className="fixed inset-0 z-[2147483000] flex h-screen h-[100dvh] w-screen flex-col overflow-hidden bg-slate-950"
    id="print-layout"
    role="dialog"
    aria-modal="true"
    aria-label={`Visualizador: ${documentTitle}`}
  >
    <div className="z-10 flex shrink-0 flex-col gap-3 border-b border-white/10 bg-slate-800 px-4 py-3 text-white shadow-md sm:flex-row sm:items-center sm:justify-between sm:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <button
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-slate-700/50 p-2 text-xs font-bold uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          aria-label="Fechar visualizador"
        >
          <ArrowLeft size={16} /> Voltar
        </button>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black uppercase tracking-widest text-white">Visualizador de Documentos</h3>
          <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Emissão: {documentTitle} ({alunos.length} pág.)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
        <button
          onClick={onDownload}
          disabled={isDownloading}
          className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 disabled:opacity-60 sm:px-5 sm:py-3 sm:text-xs"
        >
          {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          <span>{isDownloading ? 'Gerando...' : 'Download PDF'}</span>
        </button>
        <button
          onClick={onPrint}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:bg-blue-700 sm:px-6 sm:py-3 sm:text-xs"
        >
          <Printer size={16} /> <span>Imprimir</span>
        </button>
      </div>
    </div>

    <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-slate-900 p-3 custom-scrollbar sm:p-8">
      <div ref={printContentRef} className="print-content flex min-w-max flex-col items-center">
        <SecretariaDeclaracaoDocumentPages
          alunos={alunos}
          documentTitle={documentTitle}
          frequenciesByStudent={frequenciesByStudent}
          poloInfo={poloInfo}
          templateConfig={templateConfig}
          validationCodes={validationCodes}
          validationExpirations={validationExpirations}
          validationPublicByStudent={validationPublicByStudent}
          watermark={watermark}
        />
      </div>
    </div>

    <style dangerouslySetInnerHTML={{ __html: `
      @media print {
        body * { visibility: hidden; }
        #print-layout, #print-layout * {
          visibility: visible;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        #print-layout {
          position: absolute; left: 0; top: 0; width: 210mm !important;
          height: auto !important; background: white !important; margin: 0 !important;
          padding: 0 !important; overflow: visible !important; box-shadow: none !important;
        }
        .print-page {
          width: 210mm !important; height: 297mm !important;
          page-break-after: always !important; page-break-inside: avoid !important;
          margin: 0 !important; padding: 20mm !important; box-shadow: none !important;
          border: none !important; background: white !important;
          box-sizing: border-box !important; overflow: hidden !important;
        }
        .print-page img {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
      @page { size: A4 portrait; margin: 0; }
    ` }} />
  </div>,
  document.body,
);

export default SecretariaDeclaracaoPrintViewer;
