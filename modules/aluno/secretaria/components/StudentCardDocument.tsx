import React, { useRef, useState } from 'react';
import { CreditCard, Download, Loader2, Printer, RefreshCw } from 'lucide-react';
import CarteirinhaPreview from '../../../gestor/cadastros/modelos-documentos/carteirinha/components/CarteirinhaPreview';
import { formatCarteirinhaDate } from '../../../gestor/cadastros/modelos-documentos/carteirinha/carteirinha-date-formatters';
import PdfPagePreview from '../../../shared/pdf/PdfPagePreview';
import { downloadPdfBlob } from '../../../shared/pdf/download-pdf-blob';
import { useStudentCardPdf } from '../useStudentCardPdf';
import StudentCardPrintDialog from './StudentCardPrintDialog';

interface Props {
  template: any;
  aluno: any;
  code?: string;
  expiresAt?: string | null;
}

const StudentCardDocument: React.FC<Props> = ({ template, aluno, code, expiresAt }) => {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [printOpen, setPrintOpen] = useState(false);
  const student = { ...aluno, validationCode: code,
    validade: expiresAt ? formatCarteirinhaDate(expiresAt) : 'Sem vencimento' };
  const renderKey = JSON.stringify([template, student]);
  const pdf = useStudentCardPdf(sourceRef, renderKey, Boolean(code));
  const pages = template.hasVerso === false ? ['frente'] as const : ['frente', 'verso'] as const;
  const fileName = `carteirinha-estudantil-${String(aluno.nome || 'aluno').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.pdf`;
  const openPrint = () => { setPrintOpen(true); void pdf.prepareA4(); };

  return (
    <>
      <header className="flex flex-col justify-between gap-4 border-b border-slate-100 px-4 py-5 md:flex-row md:items-center md:px-6">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-[#001a33]"><CreditCard size={15} className="text-blue-600" /> Carteirinha de Estudante</h3>
          <p className="mt-0.5 text-xs font-medium text-slate-500">Modelo oficial configurado pela instituição.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <button type="button" disabled={!pdf.blob || pdf.preparing} onClick={() => pdf.blob && downloadPdfBlob(pdf.blob, fileName)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white disabled:bg-slate-300"><Download size={13} /> Baixar PDF</button>
          <button type="button" disabled={!pdf.blob || pdf.preparing} onClick={openPrint} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#001a33] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white disabled:bg-slate-300"><Printer size={13} /> Imprimir</button>
        </div>
      </header>
      <div key={pdf.revision} ref={sourceRef} aria-hidden="true" style={{ position: 'fixed', left: '-20000px', top: 0, width: '85.6mm', pointerEvents: 'none' }}>
        {pages.map(page => <CarteirinhaPreview key={page} formData={template} page={page} zoomLevel={100} transformOrigin="top left" aluno={student} isEditable={false} />)}
      </div>
      {pdf.error ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center" role="alert">
          <p className="text-sm font-bold text-rose-600">{pdf.error}</p>
          <button type="button" onClick={pdf.retry} className="flex items-center gap-2 rounded-xl bg-[#001a33] px-4 py-3 text-xs font-bold text-white"><RefreshCw size={14} /> Tentar novamente</button>
        </div>
      ) : pdf.blob ? (
        <div className="flex flex-wrap items-start justify-center gap-6 bg-slate-50 px-4 py-8">
          {pages.map((page, index) => (
            <div key={page} className="w-full max-w-[360px]">
              <p className="mb-2 text-center text-[9px] font-black uppercase tracking-widest text-slate-400">{page}</p>
              <PdfPagePreview blob={pdf.blob!} pageNumber={index + 1} title={`carteirinha — ${page}`} aspectRatio="85.6 / 54" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center" role="status">
          <Loader2 className="animate-spin text-blue-600 motion-reduce:animate-none" size={28} />
          <p className="text-xs font-bold text-slate-600">Preparando a carteirinha oficial…</p>
        </div>
      )}
      <StudentCardPrintDialog error={pdf.a4Error} onClose={() => setPrintOpen(false)} onRetry={() => void pdf.prepareA4()}
        open={printOpen} pdfBlob={pdf.a4Blob} preparing={pdf.a4Preparing} fileName={fileName.replace('.pdf', '-a4.pdf')} />
    </>
  );
};

export default StudentCardDocument;
