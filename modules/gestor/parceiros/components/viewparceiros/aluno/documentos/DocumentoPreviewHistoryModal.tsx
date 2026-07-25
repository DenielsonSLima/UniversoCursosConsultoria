import React from 'react';
import { Files, Trash2 } from 'lucide-react';
import { DocumentoAlunoChecklistItem } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import DocumentoFilePreview from './DocumentoFilePreview';
import DocumentoVersionHistory from './DocumentoVersionHistory';
import DocumentosModalShell from './DocumentosModalShell';

interface DocumentoPreviewHistoryModalProps {
  open: boolean;
  item: DocumentoAlunoChecklistItem | null;
  selectedVersionId?: string | null;
  selectedSourceId?: string | null;
  onSelectVersion: (versionId: string) => void;
  onSelectSource: (sourceId: string) => void;
  onDeleteSource?: (sourceId: string) => void;
  onClose: () => void;
}

const DocumentoPreviewHistoryModal: React.FC<DocumentoPreviewHistoryModalProps> = ({
  open,
  item,
  selectedVersionId,
  selectedSourceId,
  onSelectVersion,
  onSelectSource,
  onDeleteSource,
  onClose,
}) => {
  const selectedVersion =
    item?.versoes.find((version) => version.id === selectedVersionId)
    || item?.versaoAtual
    || item?.versoes[0]
    || null;
  const selectedSource =
    selectedVersion?.fontes.find((source) => source.id === selectedSourceId)
    || selectedVersion?.fontes[0]
    || null;

  return (
    <DocumentosModalShell
      open={open && Boolean(item)}
      title={item?.nome || 'Documento'}
      eyebrow="Arquivo e auditoria"
      description="Consulte o arquivo ativo e todas as versões preservadas deste item."
      size="full"
      onClose={onClose}
    >
      <div className="grid min-h-[70vh] grid-cols-1 gap-4 p-4 lg:grid-cols-[17rem_minmax(0,1fr)] lg:p-5">
        <aside className="rounded-2xl border border-slate-200 bg-slate-100/70 p-3">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Files aria-hidden="true" className="text-blue-600" size={15} />
            <h3 className="text-[10px] font-black uppercase tracking-wider text-[#001a33]">Versões</h3>
          </div>
          <DocumentoVersionHistory
            versoes={item?.versoes || []}
            selectedVersionId={selectedVersion?.id}
            onSelectVersion={onSelectVersion}
          />
        </aside>

        <div className="min-w-0">
          {selectedVersion && selectedVersion.fontes.length > 1 ? (
            <div className="mb-3 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2">
              {selectedVersion.fontes.map((fonte, index) => (
                <button
                  key={fonte.id}
                  type="button"
                  aria-pressed={fonte.id === selectedSource?.id}
                  onClick={() => onSelectSource(fonte.id)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-[9px] font-black uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    fonte.id === selectedSource?.id
                      ? 'bg-[#001a33] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Arquivo {index + 1}
                  {fonte.paginaInicio ? ` · pág. ${fonte.paginaInicio}${fonte.paginaFim !== fonte.paginaInicio ? `–${fonte.paginaFim}` : ''}` : ''}
                </button>
              ))}
            </div>
          ) : null}
          <DocumentoFilePreview fonte={selectedSource} />
          {selectedSource
            && selectedVersion?.id !== item?.versaoAtual?.id
            && selectedSource.arquivo.status !== 'excluido'
            && onDeleteSource ? (
            <button
              type="button"
              onClick={() => onDeleteSource(selectedSource.id)}
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-[9px] font-black uppercase tracking-wider text-red-700 transition hover:bg-red-100"
            >
              <Trash2 aria-hidden="true" size={13} /> Excluir este arquivo
            </button>
          ) : null}
        </div>
      </div>
    </DocumentosModalShell>
  );
};

export default DocumentoPreviewHistoryModal;
