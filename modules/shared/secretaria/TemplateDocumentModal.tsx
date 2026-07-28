import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Printer, X } from 'lucide-react';
import DocumentHeader from '../../gestor/components/DocumentHeader';
import { sanitizedHtml } from '../../../lib/htmlSanitizer';
import { LocalQrCodeImage } from '../qrcode/LocalQrCodeImage';
import { waitForQrCodeAssets } from '../qrcode/qr-code-assets';

interface TemplateDocumentModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  documentTitle: string;
  printAreaId: string;
  code?: string;
  validationUrl: string;
  template: any;
  polo: any;
  watermark: any;
  replaceVariables: (value: string) => string;
  accent?: 'blue' | 'emerald';
  beforeDocument?: React.ReactNode;
  printDisabled?: boolean;
  onPrint: () => void;
  showFooter?: boolean;
}

const TemplateDocumentModal: React.FC<TemplateDocumentModalProps> = ({
  open,
  onClose,
  title,
  documentTitle,
  printAreaId,
  code,
  validationUrl,
  template,
  polo,
  watermark,
  replaceVariables,
  accent = 'blue',
  beforeDocument,
  printDisabled,
  onPrint,
  showFooter = false,
}) => {
  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const handlePrint = async () => {
    const printArea = document.getElementById(printAreaId);
    if (!printArea) return;
    try {
      await waitForQrCodeAssets(printArea);
      onPrint();
    } catch (error) {
      console.error('[TemplateDocumentModal] QR Code indisponível:', error);
      window.alert(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar o QR Code para impressão.',
      );
    }
  };

  if (!open) return null;
  const accentClass = accent === 'emerald' ? 'text-emerald-600' : 'text-blue-600';
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-white">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 print:hidden sm:px-6 sm:py-4">
          <div className="flex items-center gap-2">
            <FileText className={accentClass} size={20} />
            <h4 className="text-base font-black uppercase tracking-tight text-[#001a33]">{title}</h4>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void handlePrint()} disabled={printDisabled} className="flex items-center gap-1.5 rounded-xl bg-[#001a33] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-900 disabled:cursor-not-allowed disabled:bg-slate-300"><Printer size={13} /> Imprimir</button>
            <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-sm transition-colors hover:text-rose-500"><X size={16} /></button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-auto bg-slate-100 p-3 custom-scrollbar sm:p-8">
          {beforeDocument}
          <div id={printAreaId} className="relative shrink-0 bg-white text-justify text-black shadow-md" style={{ width: 794, height: 1123, minHeight: 1123, padding: '60px 80px' }}>
            {watermark?.watermarkUrl ? <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden"><img src={watermark.watermarkUrl} alt="Marca d'água" style={{ opacity: watermark.watermarkOpacity || 0.1, width: `${watermark.watermarkScale || 50}%`, transform: watermark.watermarkRotate !== false ? 'rotate(-45deg)' : 'none' }} /></div> : null}
            {polo ? <DocumentHeader polo={polo} orientation="portrait" /> : null}
            <div className="relative z-10 mb-12 text-center"><h2 className={`text-xl font-bold uppercase tracking-wider underline decoration-2 underline-offset-4 ${accentClass}`}>{documentTitle}</h2></div>
            <div className="relative z-20 mb-20 text-justify text-base leading-loose text-black" style={{ fontFamily: '"Times New Roman", Times, serif' }}><div dangerouslySetInnerHTML={sanitizedHtml(replaceVariables(template?.textContent || ''))} /></div>
            {(template?.absoluteFields || []).map((field: any) => (
              <div key={field.id} className="absolute z-30 flex items-center justify-center" style={{ left: field.x, top: field.y, color: '#000', width: field.width ? `${field.width}px` : 'auto', height: field.height ? `${field.height}px` : 'auto', overflow: field.height ? 'hidden' : 'visible', ...field.style }}>
                {field.type === 'qrcode' ? <div className="flex w-full flex-col items-center justify-center rounded-xl border border-slate-100 bg-white p-1.5 text-center shadow-sm"><div className="mb-1 flex aspect-square w-full items-center justify-center bg-white"><LocalQrCodeImage value={validationUrl} size={150} alt="QR Code" className="pointer-events-none h-full w-full" /></div><div className="mt-0.5 flex w-full flex-col gap-0.5 border-t border-slate-100 pt-1"><p className="text-[7px] font-bold uppercase tracking-widest text-slate-400">CÓD. VALIDAÇÃO</p><p className={`mt-1 font-mono text-[9px] font-black tracking-wider ${accentClass}`}>{code || 'Registrando...'}</p></div></div> : null}
                {field.type === 'image' ? <img src={field.value} alt="Elemento visual" className="pointer-events-none w-full" style={{ height: field.height ? '100%' : 'auto', objectFit: field.style?.objectFit || 'contain', objectPosition: field.style?.objectPosition || 'center' }} /> : null}
                {field.type === 'text' ? <span className="whitespace-pre-line" dangerouslySetInnerHTML={sanitizedHtml(replaceVariables(field.value))} /> : null}
              </div>
            ))}
          </div>
        </div>
        {showFooter ? <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4 print:hidden"><button onClick={onClose} className="rounded-xl bg-slate-100 px-5 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-200">Fechar</button><button onClick={() => void handlePrint()} disabled={printDisabled} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg hover:bg-blue-900 disabled:bg-slate-300"><Printer size={14} /> Imprimir</button></div> : null}
      </div>
    </div>,
    document.body
  );
};

export default TemplateDocumentModal;
