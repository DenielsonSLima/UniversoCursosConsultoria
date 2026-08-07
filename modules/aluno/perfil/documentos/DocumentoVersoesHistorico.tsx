import React from 'react';
import { Clock3, Eye, Files } from 'lucide-react';
import type {
  DocumentoAlunoArquivo,
  DocumentoAlunoVersao,
} from '../../../shared/documentos-aluno/documentos-aluno.types';
import DocumentoStatusBadge from './DocumentoStatusBadge';
import {
  formatDocumentoAlunoBytes,
  formatDocumentoAlunoData,
} from './documentos-aluno.formatters';

interface DocumentoVersoesHistoricoProps {
  versions: DocumentoAlunoVersao[];
  currentVersionId?: string | null;
  onOpenArquivo?: (arquivo: DocumentoAlunoArquivo) => void;
  initiallyOpen?: boolean;
}

const DocumentoVersoesHistorico: React.FC<DocumentoVersoesHistoricoProps> = ({
  versions,
  currentVersionId,
  onOpenArquivo,
  initiallyOpen = false,
}) => {
  if (!versions.length) return null;

  const orderedVersions = [...versions].sort((left, right) => right.numero - left.numero);

  return (
    <details
      open={initiallyOpen}
      className="group rounded-2xl border border-slate-200 bg-white"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs font-black uppercase tracking-wide text-[#001a33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Clock3 size={15} className="text-blue-600" aria-hidden="true" />
          Histórico de versões
        </span>
        <span className="text-[9px] text-slate-400">
          {versions.length} {versions.length === 1 ? 'versão' : 'versões'}
        </span>
      </summary>

      <ol className="space-y-3 border-t border-slate-100 p-4">
        {orderedVersions.map((version) => (
          <li key={version.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-black text-slate-800">
                  Versão {version.numero}
                  {version.id === currentVersionId ? (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[8px] uppercase tracking-wider text-blue-700">
                      Atual
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-[9px] font-medium text-slate-400">
                  Enviada em {formatDocumentoAlunoData(version.enviadoEm)}
                </p>
              </div>
              <DocumentoStatusBadge status={version.status} />
            </div>

            {version.motivoRecusa || version.motivoArquivamento ? (
              <p className="mt-3 rounded-lg border border-red-100 bg-red-50 p-2.5 text-[10px] font-semibold leading-relaxed text-red-700">
                {version.motivoRecusa || version.motivoArquivamento}
              </p>
            ) : null}

            {version.fontes.length ? (
              <ul className="mt-3 space-y-2" aria-label={`Arquivos da versão ${version.numero}`}>
                {version.fontes.map((source) => {
                  const pageRange = source.paginaInicio
                    ? source.paginaFim && source.paginaFim !== source.paginaInicio
                      ? `Páginas ${source.paginaInicio}–${source.paginaFim}`
                      : `Página ${source.paginaInicio}`
                    : null;

                  return (
                    <li
                      key={source.id}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <Files size={13} className="shrink-0 text-blue-600" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10px] font-bold text-slate-700">
                          {source.arquivo.nome}
                        </span>
                        <span className="block text-[9px] font-medium text-slate-400">
                          {[pageRange, formatDocumentoAlunoBytes(source.arquivo.tamanhoBytes)]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {onOpenArquivo ? (
                        <button
                          type="button"
                          onClick={() => onOpenArquivo(source.arquivo)}
                          aria-label={`Visualizar ${source.arquivo.nome} da versão ${version.numero}`}
                          className="shrink-0 rounded-lg p-1.5 text-blue-600 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          <Eye size={13} aria-hidden="true" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  );
};

export default DocumentoVersoesHistorico;
