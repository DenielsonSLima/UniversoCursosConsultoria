import { BadgeCheck, ExternalLink, Eye, QrCode } from 'lucide-react';
import { canonicalDocumentValidityLabel } from '../../shared/canonical-document-render.utils';
import type { CarteirinhaPreceptorPreparationResult } from '../types/carteirinhas-preceptor.types';

interface CarteirinhasPreceptorPreparedResultProps {
  result: CarteirinhaPreceptorPreparationResult;
  onPreview: (emissionId: string) => void;
}

const CarteirinhasPreceptorPreparedResult = ({ result, onPreview }: CarteirinhasPreceptorPreparedResultProps) => {
  if (!result.documents.length) return null;

  return (
    <section className="rounded-3xl border border-violet-100 bg-violet-50/60 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-sm">
          <BadgeCheck size={20} />
        </span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">Carteirinhas preparadas pelo servidor</p>
          <h3 className="mt-1 text-base font-black text-[#001a33]">{result.documents.length} carteirinha(s) disponível(is)</h3>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
            {result.message || 'Os arquivos oficiais, QR Codes e regras de validade foram resolvidos de forma canônica.'}
          </p>
        </div>
      </div>

      <div className="mt-4 divide-y divide-violet-100 overflow-hidden rounded-2xl border border-violet-100 bg-white">
        {result.documents.map((document) => {
          const validityLabel = canonicalDocumentValidityLabel(document.renderPayload);
          return (
          <div key={document.emissionId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#001a33]">{document.targetName}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{document.title}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
                {document.validationCode && <span className="inline-flex items-center gap-1"><QrCode size={13} /> Código {document.validationCode}</span>}
                {validityLabel && <span>Validade: {validityLabel}</span>}
                {document.statusLabel && <span>Status: {document.statusLabel}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPreview(document.emissionId)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-200 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-violet-700 transition-colors hover:bg-violet-50"
              >
                Visualizar <Eye size={13} />
              </button>
              {document.validationUrl && (
                <a
                  href={document.validationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                >
                  Validar <ExternalLink size={13} />
                </a>
              )}
              {document.fileUrl && (
                <a
                  href={document.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-700 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white transition-colors hover:bg-violet-800"
                >
                  Abrir carteirinha <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
};

export default CarteirinhasPreceptorPreparedResult;
