import { FileWarning, QrCode } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../shared/document-validation/DocumentValidationQrCodeImage';
import {
  canonicalAsRecord,
  canonicalText,
} from '../../shared/canonical-document-render.utils';
import type { ContratoAlunoPreparedDocument } from '../types/contratos-aluno.types';

interface ContratoAlunoDocumentRendererProps {
  document: ContratoAlunoPreparedDocument;
}

export const isContratoAlunoRenderPayloadReady = (document: ContratoAlunoPreparedDocument) => {
  const rendered = document.renderPayload?.rendered;
  if (!rendered?.pages.length) return false;
  return !(rendered.qr?.enabled && !document.validationCode);
};

const ContractPayloadUnavailable = () => (
  <section
    data-render-error="O servidor não retornou as páginas canônicas do contrato."
    className="mx-auto flex min-h-[420px] w-[min(210mm,100%)] flex-col items-center justify-center rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-xl"
  >
    <FileWarning className="text-amber-500" size={38} />
    <h5 className="mt-4 text-sm font-black uppercase tracking-wide text-[#001a33]">Prévia canônica indisponível</h5>
    <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-slate-500">
      O contrato foi preparado, mas o serviço não enviou as páginas finais já resolvidas. A prévia, o PDF e a impressão permanecem bloqueados para não exibir cláusulas incompletas.
    </p>
  </section>
);

const ContratoAlunoDocumentRenderer = ({ document }: ContratoAlunoDocumentRendererProps) => {
  const payload = document.renderPayload;
  const rendered = payload?.rendered;

  if (!rendered?.pages.length) return <ContractPayloadUnavailable />;

  const snapshot = canonicalAsRecord(payload?.snapshot);
  const institution = canonicalAsRecord(snapshot.instituicao);
  const validation = canonicalAsRecord(snapshot.validacao);
  const watermark = rendered.watermark;
  const qr = rendered.qr;
  const watermarkLabel = canonicalText(watermark?.label, institution.nome, 'UNIVERSO');
  const watermarkOpacity = watermark?.opacity ?? 0.07;
  const requiresQr = qr?.enabled === true;
  const validityLabel = canonicalText(qr?.validityLabel, validation.validadeExibicao);

  if (requiresQr && !document.validationCode) return <ContractPayloadUnavailable />;

  return (
    <div className="space-y-6">
      {rendered.pages.map((page, pageIndex) => (
        <article
          key={`${document.emissionId}-pagina-${pageIndex + 1}`}
          className="print-page relative mx-auto h-[297mm] w-[210mm] overflow-hidden bg-white px-[18mm] pb-[16mm] pt-[15mm] text-black shadow-2xl box-border print:shadow-none"
          data-pdf-orientation="portrait"
          data-requires-qr-code={requiresQr ? 'true' : undefined}
        >
          {watermark?.enabled && (
            <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
              {watermark.imageUrl ? (
                <img
                  src={watermark.imageUrl}
                  alt="Marca d'água institucional"
                  className="max-h-[58%] max-w-[65%] object-contain"
                  style={{ opacity: watermarkOpacity }}
                />
              ) : (
                <span
                  className="-rotate-45 text-center text-5xl font-black uppercase tracking-[0.22em] text-[#001a33]"
                  style={{ opacity: watermarkOpacity }}
                >
                  {watermarkLabel}
                </span>
              )}
            </div>
          )}

          <header className="relative z-10 border-b-2 border-[#001a33]/10 pb-5 text-center">
            {page.header && <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#001a33]">{page.header}</p>}
            {page.title && <h1 className="mt-3 text-[17px] font-black uppercase leading-6 text-[#001a33]">{page.title}</h1>}
            <div className="mx-auto mt-3 h-0.5 w-20 bg-[#ed1c4e]" />
          </header>

          <div className="relative z-10 mt-7 whitespace-pre-wrap break-words text-justify font-serif text-[10.5px] leading-[1.7] text-slate-800">
            {page.body || ''}
          </div>

          <footer className="absolute bottom-[16mm] left-[18mm] right-[18mm] z-10 border-t border-slate-200 pt-3">
            <div className="flex items-end justify-between gap-5">
              <p className="whitespace-pre-wrap text-[8px] leading-4 text-slate-500">{page.footer || ''}</p>
              {requiresQr && document.validationCode && (
                <div className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-center shadow-sm">
                  <DocumentValidationQrCodeImage
                    code={document.validationCode}
                    size={240}
                    alt="QR Code de validação do contrato"
                    className="mx-auto h-[21mm] w-[21mm]"
                  />
                  <div className="mt-1 flex items-center justify-center gap-1 text-[6px] font-black uppercase tracking-wide text-slate-500"><QrCode size={8} /> {qr?.label || 'Validar documento'}</div>
                  <p className="mt-0.5 text-[6px] font-black tracking-wider text-blue-700">{document.validationCode}</p>
                  {validityLabel && <p className="mt-0.5 text-[6px] font-semibold text-slate-500">Validade: {validityLabel}</p>}
                </div>
              )}
            </div>
          </footer>
        </article>
      ))}
    </div>
  );
};

export default ContratoAlunoDocumentRenderer;
