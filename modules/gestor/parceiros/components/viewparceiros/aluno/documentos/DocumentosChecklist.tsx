import React from 'react';
import { Inbox } from 'lucide-react';
import { DocumentoAlunoChecklistItem } from '../../../../../../shared/documentos-aluno/documentos-aluno.types';
import DocumentoChecklistCard from './DocumentoChecklistCard';

interface DocumentosChecklistProps {
  itens: DocumentoAlunoChecklistItem[];
  busyItemId?: string | null;
  onPreview?: (item: DocumentoAlunoChecklistItem) => void;
  onHistory?: (item: DocumentoAlunoChecklistItem) => void;
  onReview?: (item: DocumentoAlunoChecklistItem) => void;
  onArchive?: (item: DocumentoAlunoChecklistItem) => void;
  onUpload?: (item: DocumentoAlunoChecklistItem, files: File[]) => void;
}

const DocumentosChecklist: React.FC<DocumentosChecklistProps> = ({
  itens,
  busyItemId,
  onPreview,
  onHistory,
  onReview,
  onArchive,
  onUpload,
}) => {
  if (itens.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
        <Inbox aria-hidden="true" className="mx-auto text-slate-300" size={30} />
        <p className="mt-3 text-sm font-black text-[#001a33]">Checklist indisponível</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Nenhum item documental foi encontrado para este aluno.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="documentos-checklist-title">
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-600">Documentos do aluno</p>
          <h3 id="documentos-checklist-title" className="mt-1 text-lg font-black tracking-tight text-[#001a33]">
            Checklist e decisões
          </h3>
        </div>
        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{itens.length} itens</span>
      </div>
      <div className="space-y-3">
        {itens.map((item) => (
          <DocumentoChecklistCard
            key={item.id}
            item={item}
            busy={busyItemId === item.id}
            onPreview={onPreview}
            onHistory={onHistory}
            onReview={onReview}
            onArchive={onArchive}
            onUpload={onUpload}
          />
        ))}
      </div>
    </section>
  );
};

export default DocumentosChecklist;
