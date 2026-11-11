import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { formatNfseMoney } from '../components/nfse.presentation';
import type { NfseStudentGroup } from './nfse-students.types';
import { formatNfseStudentCpf, formatNfseStudentLocation } from './nfse-student-registration.presentation';

interface SelectionCheckboxProps {
  label: string;
  ids: string[];
  selectedIds: readonly string[];
  disabled?: boolean;
  onToggle: (ids: string[]) => void;
}

export function NfseSelectionCheckbox({ label, ids, selectedIds, disabled, onToggle }: SelectionCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);
  const allSelected = ids.length > 0 && ids.every(id => selectedIds.includes(id));
  const someSelected = ids.some(id => selectedIds.includes(id));
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = someSelected && !allSelected;
  }, [allSelected, someSelected]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={allSelected}
    disabled={disabled || !ids.length} onChange={() => onToggle(ids)} />;
}

interface NfseStudentGroupsProps {
  groups: readonly NfseStudentGroup[];
  selectedIds: readonly string[];
  disabled?: boolean;
  onToggleStudent: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
}

export default function NfseStudentGroups({ groups, selectedIds, disabled, onToggleStudent, onToggleGroup }: NfseStudentGroupsProps) {
  const prefix = useId();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpanded = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return <div className="nfse-student-groups">
    {groups.map(group => {
      const isExpanded = expanded.has(group.id);
      const detailsId = `${prefix}-${group.id}`;
      return <section key={group.id} className="nfse-student-group" aria-label={group.label}>
        <div className="nfse-student-group-heading">
          <NfseSelectionCheckbox label={`Selecionar alunos da turma ${group.label}`} ids={group.students.map(student => student.id)}
            selectedIds={selectedIds} disabled={disabled} onToggle={onToggleGroup} />
          <button type="button" className="nfse-student-group-toggle" aria-expanded={isExpanded} aria-controls={detailsId}
            onClick={() => toggleExpanded(group.id)}>
            {isExpanded ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
            <span className="nfse-student-group-label">{group.label}<small>{group.studentCount} aluno(s)</small></span>
            <span className="nfse-student-group-amount">{formatNfseMoney(group.receivedAmount)}</span>
          </button>
        </div>
        {isExpanded && <div id={detailsId} className="nfse-student-group-rows">
          <div className="nfse-student-row-caption"><span>Aluno</span><span>Recebido no mês</span></div>
          {group.students.map(student => <label key={student.id} className="nfse-student-row">
            <input type="checkbox" aria-label={`Selecionar ${student.studentName}`} checked={selectedIds.includes(student.id)}
              disabled={disabled} onChange={() => onToggleStudent(student.id)} />
            <span className="nfse-student-name">
              <span>{student.studentName}</span>
              <span className="nfse-student-cpf">{formatNfseStudentCpf(student.studentCpf)}</span>
              <span className="nfse-student-location">{formatNfseStudentLocation(student.studentCity, student.studentState)}</span>
            </span>
            <span className="nfse-student-amount">{formatNfseMoney(student.receivedAmount)}</span>
          </label>)}
        </div>}
      </section>;
    })}
  </div>;
}

