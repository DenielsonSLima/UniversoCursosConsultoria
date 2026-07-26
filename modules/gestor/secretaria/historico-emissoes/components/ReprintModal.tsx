import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { ArrowLeft, Award, ChevronLeft, ChevronRight, Download, Loader2, Printer, X } from 'lucide-react';
import { sanitizedHtml } from '../../../../../lib/htmlSanitizer';
import DocumentHeader from '../../../components/DocumentHeader';
import CertificadoPreview from '../../certificados/components/CertificadoPreview';
import CarteirinhaPreview from '../../../cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import CrachaPreview from '../../../cadastros/modelos-documentos/cracha/components/CrachaPreview';
import { DOCUMENT_TABS, isCertificateDocument } from '../historico-emissoes.constants';
import { getPreviewStudent } from '../preview-utils';
import { parseEmissionTemplate } from '../template-parser';
import type {
  AcademicPreviewData,
  EmissionLog,
} from '../historico-emissoes.types';
import type { CertificadoAcademico } from '../../certificados/certificados.types';

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
  navigationLabel,
  onPrevious,
  onNext,
  previousDisabled = false,
  nextDisabled = false,
  unavailableHeading = 'Documento indisponível para reemissão',
  unavailableNote = 'A impressão e o PDF foram bloqueados para evitar um documento acadêmico incompleto.',
  fullscreenViewer = false,
}) => {
  const parseTemplate = (text: string) => parseEmissionTemplate(text, emission, {
    academicData: academicPreviewData,
    poloInfo,
    templateConfig,
  });
  const cardStudent = getPreviewStudent(emission, poloInfo);
  const isCertificate = isCertificateDocument(emission.documento);
  const isBlocked = Boolean(error) || (!isLoading && isCertificate && !certificatePreview);
  const parsedTemplateBody = templateConfig
    ? parseTemplate(templateConfig.textContent || templateConfig.textoFrente || '')
    : null;
  const standardPages = parsedTemplateBody
    ? splitTemplatePages(parsedTemplateBody)
    : [null];
  const hasConfiguredQrCode = Boolean(
    templateConfig?.absoluteFields?.some((field: any) => field.type === 'qrcode')
  );
  const absoluteFieldsForPage = (pageIndex: number) => (
    (templateConfig?.absoluteFields || []).filter((field: any) => {
      const fieldPage = Math.max(0, Math.floor(Number(field.y || 0) / 1123));
      return Math.min(standardPages.length - 1, fieldPage) === pageIndex;
    })
  );

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
              {fullscreenViewer ? 'Download PDF' : 'PDF'}
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

            {!isLoading && !error && emission.documento === 'carteirinha' && templateConfig && (
              <div className="print-page reprint-card-page mx-auto h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[5mm] text-black shadow-xl box-border">
                <div className="print-fold-grid grid grid-rows-5 gap-y-[1.5mm]">
                  <div className="relative flex w-full items-center justify-center">
                    <div className="relative flex overflow-hidden rounded-[2.5mm] border border-slate-300 shadow-sm">
                      <div className="relative h-[54mm] w-[85.6mm] border-r border-dashed border-slate-400"><CarteirinhaPreview formData={templateConfig} page="frente" zoomLevel={100} aluno={cardStudent} /></div>
                      <div className="relative h-[54mm] w-[85.6mm]"><CarteirinhaPreview formData={templateConfig} page="verso" zoomLevel={100} aluno={cardStudent} /></div>
                    </div>
                  </div>
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="mx-auto flex h-[54mm] w-[171.2mm] items-center justify-center rounded-[2.5mm] border-2 border-dashed border-slate-100 bg-slate-50/30 text-[10px] font-bold uppercase tracking-widest text-slate-300 print:hidden">Espaço disponível</div>
                  ))}
                </div>
              </div>
            )}

            {!isLoading && !error && emission.documento === 'cracha_estagio' && templateConfig && (
              <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm print:shadow-none">
                {(['frente', 'verso'] as const).map((page) => (
                  <div key={page} className="print-page mt-4 rounded-2xl border border-slate-150 bg-white p-2 first:mt-0">
                    <h5 className="mb-2 text-center text-[10px] font-bold uppercase text-slate-400 print:hidden">{page}</h5>
                    <CrachaPreview
                      formData={templateConfig}
                      page={page}
                      zoomLevel={100}
                      aluno={{
                        nome: emission.dados_emissao?.studentName || emission.aluno?.nome || '',
                        cpf: emission.dados_emissao?.studentCpf || emission.aluno?.cpf_cnpj || '',
                        rg: emission.aluno?.rg || '',
                        matricula: emission.dados_emissao?.studentMatricula || '',
                        cargo: 'ESTUDANTE',
                        polo: emission.dados_emissao?.unitName || '',
                        curso: emission.dados_emissao?.courseName || '',
                        fotoUrl: emission.dados_emissao?.studentPhotoUrl || emission.aluno?.foto_url || null,
                        validationCode: emission.codigo,
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {!isLoading && !error && isCertificate && certificatePreview && (
              <div id="certificate-reprint-pages" className="space-y-6">
                <CertificadoPreview certificado={certificatePreview} modelo={templateConfig} pdfMode />
              </div>
            )}
            {!isLoading && !error && isCertificate && !certificatePreview && (
              <div className="min-h-[120mm] w-[210mm] max-w-full rounded-2xl border border-amber-100 bg-white p-8 text-center shadow-xl">
                <Award className="mx-auto mb-4 text-amber-500" size={38} />
                <h5 className="text-sm font-black uppercase tracking-widest text-[#001a33]">Certificado oficial não localizado</h5>
                <p className="mx-auto mt-3 max-w-md text-xs font-bold leading-relaxed text-slate-500">O histórico possui um código de certificado, mas não há um registro acadêmico finalizado correspondente para renderizar a segunda via oficial.</p>
              </div>
            )}

            {!isLoading && !error && emission.documento !== 'carteirinha' && emission.documento !== 'cracha_estagio' && !isCertificate && (
              <div className="space-y-6">
                {standardPages.map((pageBody, pageIndex) => (
                  <div key={pageIndex} className="print-page relative mx-auto min-h-[297mm] w-[210mm] overflow-hidden border border-slate-200 bg-white p-[20mm] text-left text-black shadow-xl box-border" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    {watermark?.watermarkUrl && (
                      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
                        <img src={watermark.watermarkUrl} alt="Watermark" style={{ opacity: watermark.watermarkOpacity || 0.1, width: `${watermark.watermarkScale || 50}%`, transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none' }} />
                      </div>
                    )}
                    <DocumentHeader polo={poloInfo} orientation="portrait" />
                    {pageIndex === 0 && (
                      <div className="relative z-10 mb-12 mt-6 text-center">
                        <h2 className="text-2xl font-bold uppercase text-[#001a33] underline decoration-2 decoration-blue-600 underline-offset-4">
                          {DOCUMENT_TABS.find((tab) => tab.key === emission.documento)?.label || 'DOCUMENTO'}
                        </h2>
                      </div>
                    )}
                    {pageBody !== null ? (
                      <div className="relative z-20 mb-20 text-justify text-lg leading-loose text-black" dangerouslySetInnerHTML={sanitizedHtml(pageBody)} />
                    ) : (
                      <div className="relative z-20 mb-20 text-justify text-sm leading-relaxed text-black"><p>Declaramos para os devidos fins que o(a) aluno(a) <b>{(emission.dados_emissao?.studentName || emission.aluno?.nome || '').toUpperCase()}</b>, portador(a) do CPF nº <b>{emission.dados_emissao?.studentCpf || emission.aluno?.cpf_cnpj || 'Não informado'}</b>, regularmente matriculado(a) no curso de <b>{emission.dados_emissao?.courseName || ''}</b>, na turma <b>{emission.dados_emissao?.className || ''}</b>, encontra-se regular com suas obrigações acadêmicas.</p></div>
                    )}
                    {absoluteFieldsForPage(pageIndex).map((field: any) => (
                      <div
                        key={field.id}
                        className="absolute z-30"
                        style={{
                          left: field.x,
                          top: Number(field.y || 0) - (pageIndex * 1123),
                          color: '#000',
                          width: field.width ? `${field.width}px` : 'auto',
                          height: field.height ? `${field.height}px` : 'auto',
                          ...field.style,
                        }}
                      >
                        {field.type === 'qrcode' && <QrCodeField code={emission.codigo} width={field.width} />}
                        {field.type === 'image' && <img src={parseTemplate(field.value)} alt="Elemento visual" className="h-full w-full object-contain" />}
                        {field.type === 'text' && <span dangerouslySetInnerHTML={sanitizedHtml(parseTemplate(field.value))} className="w-full break-words" />}
                      </div>
                    ))}
                    {pageIndex === standardPages.length - 1 && !hasConfiguredQrCode && (
                      <div className="absolute bottom-[16mm] right-[18mm] z-30 w-[24mm]">
                        <QrCodeField code={emission.codigo} width={76} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
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

const QrCodeField: React.FC<{ code: string; width?: number }> = ({ code, width }) => {
  const [src, setSrc] = useState('');
  const validationUrl = `https://www.universocc.com.br/validador?q=${code}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(validationUrl, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setSrc('');
      });
    return () => {
      active = false;
    };
  }, [validationUrl]);

  return (
    <div className="flex w-full flex-col items-center justify-center rounded border border-slate-100 bg-white p-1 text-center">
      <div className="mb-0.5 flex aspect-square w-full items-center justify-center bg-white" style={{ width: width ? `${width}px` : '80px' }}>
        {src
          ? <img src={src} alt="QR Code" className="h-full w-full object-contain" />
          : <span className="text-[6px] font-black uppercase text-slate-300">Gerando QR</span>}
      </div>
      <p className="text-[6px] font-bold uppercase leading-none tracking-wide text-slate-400">CÓD. VALIDAÇÃO</p>
      <p className="mt-0.5 text-[8px] font-black leading-none tracking-wider text-blue-600">{code}</p>
    </div>
  );
};

const splitTemplatePages = (html: string) => {
  const pages = html
    .split(/<div[^>]*data-page-break=["']true["'][\s\S]*?<\/div>/gi)
    .map((page) => page.trim())
    .filter(Boolean);
  return pages.length ? pages : [html];
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
