import { Eye, ExternalLink, FileCheck2, QrCode } from 'lucide-react';
import { canonicalDocumentValidityLabel } from '../../shared/canonical-document-render.utils';
import type { ContratoAlunoPreparationResult } from '../types/contratos-aluno.types';

interface ContratosAlunoPreparedResultProps {
  result: ContratoAlunoPreparationResult;
  onPreview: (emissionId: string) => void;
}

const ContratosAlunoPreparedResult = ({ result, onPreview }: ContratosAlunoPreparedResultProps) => {
  if (!result.documents.length) return null;

  return (
    <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
            <FileCheck2 size={20} />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Emissão preparada pelo servidor</p>
            <h3 className="mt-1 text-base font-black text-[#001a33]">{result.documents.length} contrato(s) disponível(is)</h3>
            <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
              {result.message || 'Use o arquivo oficial retornado pelo serviço. O QR Code e a validade exibidos são canônicos.'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 divide-y divide-emerald-100 overflow-hidden rounded-2xl border border-emerald-100 bg-white">
        {result.documents.map((document) => {
          const validityLabel = canonicalDocumentValidityLabel(document.renderPayload);
          return (
          <div key={document.emissionId} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-[#001a33]">{document.targetName}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{document.title}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-500">
                {document.validationCode && (
                  <span className="inline-flex items-center gap-1"><QrCode size={13} /> Código {document.validationCode}</span>
                )}
                {validityLabel && <span>Validade: {validityLabel}</span>}
                {document.statusLabel && <span>Status: {document.statusLabel}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onPreview(document.emissionId)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-blue-200 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-blue-700 transition-colors hover:bg-blue-50"
              >
                Visualizar <Eye size={13} />
              </button>
              {document.validationUrl && (
                <a
                  href={document.validationUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                >
                  Validar <ExternalLink size={13} />
                </a>
              )}
              {document.fileUrl && (
                <a
                  href={document.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#001a33] px-3 py-2 text-[11px] font-black uppercase tracking-wide text-white transition-colors hover:bg-blue-800"
                >
                  Abrir documento <ExternalLink size={13} />
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

export default ContratosAlunoPreparedResult;
