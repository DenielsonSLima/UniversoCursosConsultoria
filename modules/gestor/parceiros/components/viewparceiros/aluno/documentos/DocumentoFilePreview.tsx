import React from 'react';
import { ExternalLink, FileWarning } from 'lucide-react';
import { DocumentoAlunoFonte } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import { formatarTamanhoArquivo } from '../../../../../../shared/documentos-aluno/documentos-aluno.utils';

interface DocumentoFilePreviewProps {
  fonte: DocumentoAlunoFonte | null;
}

const DocumentoFilePreview: React.FC<DocumentoFilePreviewProps> = ({ fonte }) => {
  if (!fonte?.arquivo.url) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <FileWarning aria-hidden="true" className="text-slate-300" size={34} />
        <p className="mt-3 text-sm font-black text-[#001a33]">Pré-visualização indisponível</p>
        <p className="mt-1 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
          Solicite uma nova URL temporária para visualizar este arquivo.
        </p>
      </div>
    );
  }

  const { arquivo } = fonte;
  const isImage = arquivo.mimeType.startsWith('image/');
  const pageSuffix = fonte.paginaInicio ? `#page=${fonte.paginaInicio}` : '';
  const sizeLabel = formatarTamanhoArquivo(arquivo.tamanhoBytes);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-[#001a33]">{arquivo.nome}</p>
          <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
            {[arquivo.mimeType, sizeLabel].filter(Boolean).join(' · ')}
          </p>
        </div>
        <a
          href={arquivo.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-blue-100 bg-blue-50 px-3 text-[9px] font-black uppercase tracking-wider text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Abrir arquivo <ExternalLink aria-hidden="true" size={12} />
        </a>
      </div>
      <div className="flex min-h-[55vh] items-center justify-center bg-slate-100 p-2 sm:p-4">
        {isImage ? (
          <img
            src={arquivo.url}
            alt={`Pré-visualização de ${arquivo.nome}`}
            className="max-h-[68vh] max-w-full rounded-lg object-contain shadow-lg"
          />
        ) : (
          <iframe
            src={`${arquivo.url}${pageSuffix}`}
            title={`Pré-visualização de ${arquivo.nome}`}
            className="h-[68vh] w-full rounded-lg border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
};

export default DocumentoFilePreview;
