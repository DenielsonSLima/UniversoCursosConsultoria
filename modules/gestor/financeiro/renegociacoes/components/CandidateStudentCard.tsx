import React, { useState } from 'react';
import { ChevronDown, UserRound } from 'lucide-react';
import type { RenegociacaoCandidateGroup } from '../renegociacoes.types';
import CandidateEnrollment from './CandidateEnrollment';
import type { CandidateSelectionState } from './candidateSelection.model';

interface CandidateStudentCardProps {
  studentId: string;
  studentName: string;
  groups: RenegociacaoCandidateGroup[];
  selection: CandidateSelectionState;
  onSelectionChange: (group: RenegociacaoCandidateGroup, selectedIds: string[]) => void;
  onClearSelection: () => void;
  onStart: (group: RenegociacaoCandidateGroup, selectedIds: string[]) => void;
}

const studentInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';

const CandidateStudentCard: React.FC<CandidateStudentCardProps> = ({
  studentId,
  studentName,
  groups,
  selection,
  onSelectionChange,
  onClearSelection,
  onStart,
}) => {
  const [expanded, setExpanded] = useState(false);
  const panelId = `candidate-student-${studentId}`;
  const selectedHere = Boolean(
    selection.ownerIdentity?.alunoId === studentId && selection.selectedIds.length,
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-h-[4.5rem] w-full items-center gap-3 bg-white px-4 py-3 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:px-5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#001a33] text-xs font-black text-white">
            {studentInitials(studentName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-black text-[#001a33]">{studentName}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <UserRound size={12} aria-hidden="true" />
              {groups.length} {groups.length === 1 ? 'matrícula/turma' : 'matrículas/turmas'}
            </span>
          </span>
          <span className="hidden text-[10px] font-black uppercase tracking-wide text-blue-700 sm:inline">
            {selectedHere
              ? `${selection.selectedIds.length} selecionada${selection.selectedIds.length === 1 ? '' : 's'}`
              : expanded
                ? 'Recolher'
                : 'Ver parcelas'}
          </span>
          <ChevronDown
            size={19}
            aria-hidden="true"
            className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </h3>

      <div id={panelId} hidden={!expanded} className="space-y-3 border-t border-slate-100 bg-slate-50/70 p-3 sm:p-4">
        <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-900">
          Cada proposta usa parcelas de uma única matrícula e turma. Abra uma matrícula para escolher 1 ou várias.
        </p>
        {groups.map((group) => (
          <CandidateEnrollment
            key={`${group.matriculaId}-${group.turmaId}`}
            group={group}
            active={expanded}
            selection={selection}
            onSelectionChange={onSelectionChange}
            onClearSelection={onClearSelection}
            onStart={onStart}
          />
        ))}
      </div>
    </section>
  );
};

export default CandidateStudentCard;
