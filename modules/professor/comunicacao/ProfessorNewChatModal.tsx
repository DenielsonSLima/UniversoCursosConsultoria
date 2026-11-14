import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import InstitutionalSelect from '../../shared/components/InstitutionalSelect';

interface Category { id: string; nome: string; }
interface ProfessorNewChatModalProps {
  categories: Category[];
  categoryId: string;
  subject: string;
  busy?: boolean;
  categoriesLoading?: boolean;
  categoriesError?: boolean;
  onCategoryChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onSubjectChange: (value: string) => void;
}

export const ProfessorNewChatModal: React.FC<ProfessorNewChatModalProps> = ({
  categories, categoryId, subject, busy, categoriesLoading, categoriesError,
  onCategoryChange, onClose, onSubmit, onSubjectChange,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('[data-close]')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const elements = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),textarea:not([disabled])');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [busy, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4" onClick={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="professor-card max-h-[90dvh] w-full max-w-lg overflow-y-auto">
        <div className="professor-heading">
          <div><h3 id={titleId}>Novo chamado docente</h3><p>Fale com os setores administrativos e a coordenação.</p></div>
          <button type="button" data-close aria-label="Fechar novo chamado" disabled={busy} className="professor-button" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={onSubmit}>
          <fieldset disabled={busy} className="space-y-4">
            <div className="professor-field">
              <label htmlFor="teacher-chat-category">Setor / assunto</label>
              <InstitutionalSelect
                id="teacher-chat-category" ariaLabel="Setor / assunto" required
                value={categoryId} onValueChange={onCategoryChange}
                options={categories.map((category) => ({ value: category.id, label: category.nome }))}
                loading={categoriesLoading}
                error={categoriesError ? 'Categorias indisponíveis. A consulta será retomada ao reconectar.' : undefined}
                placeholder="Selecione uma categoria…"
              />
            </div>
            <div className="professor-field">
              <label htmlFor="teacher-chat-subject">Mensagem / solicitação</label>
              <textarea
                id="teacher-chat-subject" required rows={4} placeholder="Descreva o que você precisa…"
                value={subject} onChange={(event) => onSubjectChange(event.target.value)}
                className="professor-input resize-y"
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" className="professor-button" onClick={onClose}>Cancelar</button>
              <button type="submit" className="professor-button professor-button--primary" disabled={!categoryId || !subject.trim() || categoriesError}>
                {busy ? 'Abrindo…' : 'Confirmar chamado'}
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
};
