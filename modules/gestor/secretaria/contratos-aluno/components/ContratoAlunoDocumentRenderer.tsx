import { FileWarning, QrCode } from 'lucide-react';
import { DocumentValidationQrCodeImage } from '../../../../shared/document-validation/DocumentValidationQrCodeImage';
import { parseContratoAlunoClosingLayout } from '../../../../shared/contrato-aluno/closing-layout';
import {
  canonicalAsRecord,
  canonicalText,
} from '../../shared/canonical-document-render.utils';
import type { ContratoAlunoPreparedDocument } from '../types/contratos-aluno.types';

interface ContratoAlunoDocumentRendererProps {
  document: ContratoAlunoPreparedDocument;
}

const toVisibleMultilineText = (value: string | null | undefined) => String(value || '')
  .replace(/\\r\\n/g, '\n')
  .replace(/\\n/g, '\n');

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
      {rendered.pages.map((page, pageIndex) => {
        const isFinalPage = pageIndex === rendered.pages.length - 1;
        const footerText = toVisibleMultilineText(page.footer);
        const showClosing = isFinalPage && Boolean(footerText || requiresQr);
        const closingLayout = parseContratoAlunoClosingLayout(footerText);

        return (
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

          {showClosing && (
            <footer className="absolute bottom-[46mm] left-[18mm] right-[18mm] z-10 border-t border-slate-200 pt-3">
              <div className="grid grid-cols-[minmax(0,1fr)_31mm] items-start gap-5">
                <div className="min-w-0">
                  {closingLayout.fallbackText ? (
                    <p className="whitespace-pre-wrap text-[8px] leading-4 text-slate-500">{closingLayout.fallbackText}</p>
                  ) : (
                    <div className="space-y-3 text-slate-600">
                      {closingLayout.location && <p className="text-[8px] leading-4">{closingLayout.location}</p>}

                      {closingLayout.parties.length > 0 && (
                        <div className="grid grid-cols-2 gap-6">
                          {closingLayout.parties.map((party) => (
                            <div key={party.label} className="min-w-0 text-center">
                              <div className="flex h-[10mm] items-end justify-center border-b border-slate-500 px-2 text-[8px] text-slate-700">
                                {party.value}
                              </div>
                              <p className="mt-1 text-[6px] font-black uppercase tracking-wider text-slate-500">{party.label}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {closingLayout.witnesses.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[6px] font-black uppercase tracking-wider text-slate-500">Testemunhas</p>
                          <div className="grid grid-cols-2 gap-6">
                            {closingLayout.witnesses.map((witness) => (
                              <div key={witness.label} className="min-w-0 text-center">
                                <div className="flex h-[8mm] items-end justify-center border-b border-slate-400 px-2 text-[7px] text-slate-700">
                                  {witness.value}
                                </div>
                                <p className="mt-1 text-[5.5px] font-bold uppercase tracking-wider text-slate-400">{witness.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {closingLayout.additionalLines.length > 0 && (
                        <p className="whitespace-pre-wrap text-[7px] leading-3 text-slate-500">{closingLayout.additionalLines.join('\n')}</p>
                      )}
                    </div>
                  )}
                </div>
                {requiresQr && document.validationCode && (
                  <div className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5 text-center shadow-sm">
                    <DocumentValidationQrCodeImage
                      code={document.validationCode}
                      size={200}
                      alt="QR Code de validação do contrato"
                      className="mx-auto h-[17mm] w-[17mm]"
                    />
                    <div className="mt-1 flex items-center justify-center gap-1 text-[6px] font-black uppercase tracking-wide text-slate-500"><QrCode size={8} /> {qr?.label || 'Validar documento'}</div>
                    <p className="mt-0.5 text-[6px] font-black tracking-wider text-blue-700">{document.validationCode}</p>
                    {validityLabel && <p className="mt-0.5 text-[6px] font-semibold text-slate-500">Validade: {validityLabel}</p>}
                  </div>
                )}
              </div>
            </footer>
          )}
        </article>
        );
      })}
    </div>
  );
};

export default ContratoAlunoDocumentRenderer;
