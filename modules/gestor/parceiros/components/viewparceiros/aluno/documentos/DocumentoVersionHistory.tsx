import React from 'react';
import { CalendarClock, UserRound } from 'lucide-react';
import { DocumentoAlunoVersao } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import DocumentoStatusBadge from './DocumentoStatusBadge';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

interface DocumentoVersionHistoryProps {
  versoes: DocumentoAlunoVersao[];
  selectedVersionId?: string | null;
  onSelectVersion: (versionId: string) => void;
}

const DocumentoVersionHistory: React.FC<DocumentoVersionHistoryProps> = ({
  versoes,
  selectedVersionId,
  onSelectVersion,
}) => (
  <div className="space-y-2" role="list" aria-label="Histórico de versões">
    {versoes.map((versao) => {
      const selected = versao.id === selectedVersionId;
      const actorName = versao.revisadoPorNome || versao.enviadoPorNome;

      return (
        <button
          key={versao.id}
          type="button"
          role="listitem"
          aria-current={selected ? 'true' : undefined}
          onClick={() => onSelectVersion(versao.id)}
          className={`w-full rounded-2xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            selected
              ? 'border-blue-300 bg-blue-50 shadow-sm'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black text-[#001a33]">Versão {versao.numero}</span>
            <DocumentoStatusBadge status={versao.status} />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[9px] font-bold text-slate-500">
            <CalendarClock aria-hidden="true" size={11} />
            {dateFormatter.format(new Date(versao.enviadoEm))}
          </p>
          {actorName ? (
            <p className="mt-1 flex items-center gap-1.5 truncate text-[9px] font-bold text-slate-500">
              <UserRound aria-hidden="true" size={11} />
              {actorName}
            </p>
          ) : null}
          {versao.motivoRecusa || versao.motivoArquivamento ? (
            <p className="mt-2 line-clamp-2 text-[9px] font-semibold leading-relaxed text-slate-600">
              {versao.motivoRecusa || versao.motivoArquivamento}
            </p>
          ) : null}
        </button>
      );
    })}
  </div>
);

export default DocumentoVersionHistory;
