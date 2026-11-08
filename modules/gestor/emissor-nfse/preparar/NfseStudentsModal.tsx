import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, UserPlus, Users, X } from 'lucide-react';
import InstitutionalSelect from '../../../shared/components/InstitutionalSelect';
import { formatNfseMoney } from '../components/nfse.presentation';
import type { NfseMoney } from '../types/nfse.types';
import NfseStudentGroups, { NfseSelectionCheckbox } from './NfseStudentGroups';
import type { NfseStudentGroup, NfseStudentOption } from './nfse-students.types';
import { useNfseStudentsDialog } from './useNfseStudentsDialog';
import NfseMonthPicker from './NfseMonthPicker';
import './nfse-students.css';

export interface NfseStudentsModalProps {
  month: string;
  search: string;
  courseTypeId: string;
  classId: string;
  courseTypes: readonly NfseStudentOption[];
  classes: readonly NfseStudentOption[];
  groups: readonly NfseStudentGroup[];
  selectedIds: readonly string[];
  selectedCount: number;
  selectedAmount: NfseMoney;
  loading: boolean;
  refreshing: boolean;
  selectionLoading: boolean;
  error?: string | null;
  excludedUnknownCount?: number;
  selectionError?: string | null;
  canAdd: boolean;
  page?: number;
  hasNext?: boolean;
  onPageChange?: (page: number) => void;
  onMonthChange: (month: string) => void;
  onSearchChange: (search: string) => void;
  onCourseTypeChange: (courseTypeId: string) => void;
  onClassChange: (classId: string) => void;
  onToggleStudent: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onToggleAll: (ids: string[]) => void;
  onRetry: () => void;
  onClose: () => void;
  onClearSelection?: () => void;
  onAdd: () => void;
}

export default function NfseStudentsModal(props: NfseStudentsModalProps) {
  const titleId = useId();
  const { overlayRef, dialogRef, initialFocusRef } = useNfseStudentsDialog(props.onClose);
  const busy = props.loading || props.refreshing;
  const page = props.page ?? 1;
  const visibleIds = props.groups.flatMap(group => group.students.map(student => student.id));
  if (typeof document === 'undefined') return null;

  return createPortal(<div ref={overlayRef} className="nfse-portal nfse-students-overlay" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget) props.onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="nfse-students-dialog">
      <header className="nfse-section-heading nfse-students-heading">
        <h2 id={titleId}>Adicionar alunos</h2>
        <button type="button" className="nfse-button nfse-button-secondary" aria-label="Fechar seleção de alunos" onClick={props.onClose}><X size={17} /></button>
      </header>
      <div className="nfse-students-body">
        <div className="nfse-students-filters">
          <div className="nfse-field nfse-students-filter-month"><label htmlFor={`${titleId}-month`}>Mês de referência</label>
            <NfseMonthPicker id={`${titleId}-month`} inputRef={initialFocusRef} value={props.month} onChange={props.onMonthChange} />
          </div>
          <div className="nfse-field nfse-students-filter-course"><label htmlFor={`${titleId}-course`}>Tipo de curso</label>
            <InstitutionalSelect id={`${titleId}-course`} ariaLabel="Tipo de curso" value={props.courseTypeId}
              onValueChange={props.onCourseTypeChange} options={props.courseTypes} placeholder="Selecionar tipo" loading={props.loading && !props.courseTypes.length} />
          </div>
          <label className="nfse-field nfse-students-filter-search"><span>Aluno</span>
            <input type="search" maxLength={120} value={props.search} placeholder="Buscar aluno…" onChange={event => props.onSearchChange(event.target.value)} />
          </label>
          <div className="nfse-field nfse-students-filter-class"><label htmlFor={`${titleId}-class`}>Turma</label>
            <InstitutionalSelect id={`${titleId}-class`} ariaLabel="Turma" value={props.classId} onValueChange={props.onClassChange}
              options={props.classes} placeholder="Todas as turmas" allowClear loading={props.loading && !props.classes.length} />
          </div>
        </div>
        {Boolean(props.excludedUnknownCount) && <p className="nfse-footer" role="status">{props.excludedUnknownCount} recebimento(s) sem valor confirmado não entram na seleção.</p>}
        {props.selectedIds.length > 0 && props.onClearSelection && <div className="nfse-pager"><button type="button" className="nfse-button nfse-button-secondary" onClick={props.onClearSelection}>Limpar seleção</button></div>}
        <div className="nfse-students-results" aria-busy={busy}>
          {props.error ? <div className="nfse-students-state" role="alert"><AlertCircle size={23} /><p>{props.error}</p>
            <button type="button" className="nfse-button nfse-button-secondary" onClick={props.onRetry}>Tentar novamente</button>
          </div> : props.loading ? <div className="nfse-students-state" role="status"><Loader2 size={23} className="animate-spin" /><p>Consultando recebimentos…</p></div>
            : props.groups.length ? <>
              <div className="nfse-students-page-selection">
                <label><NfseSelectionCheckbox label="Selecionar alunos desta página" ids={visibleIds} selectedIds={props.selectedIds}
                  disabled={busy} onToggle={props.onToggleAll} /><span>Selecionar desta página</span></label>
                {props.refreshing && <span role="status">Atualizando…</span>}
              </div>
              <NfseStudentGroups groups={props.groups} selectedIds={props.selectedIds} disabled={busy}
                onToggleStudent={props.onToggleStudent} onToggleGroup={props.onToggleGroup} />
            </> : <div className="nfse-students-state"><Users size={25} /><p>Nenhum aluno com recebimento neste mês para os filtros selecionados.</p></div>}
        </div>
        {props.onPageChange && (page > 1 || props.hasNext) && <nav className="nfse-pager" aria-label="Páginas de turmas">
          <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || page <= 1} onClick={() => props.onPageChange?.(page - 1)}>Anterior</button>
          <span>Página {page}</span>
          <button type="button" className="nfse-button nfse-button-secondary" disabled={busy || !props.hasNext} onClick={() => props.onPageChange?.(page + 1)}>Próxima</button>
        </nav>}
      </div>
      <footer className="nfse-footer nfse-students-footer">
        <div className="nfse-students-total" aria-live="polite" aria-atomic="true">
          <span>Total selecionado{!props.selectionLoading && !props.selectionError ? ` · ${props.selectedCount} aluno(s)` : ''}</span>
          {props.selectionError ? <span className="nfse-students-selection-error" role="alert">{props.selectionError}</span>
            : <strong>{props.selectionLoading ? 'Atualizando…' : formatNfseMoney(props.selectedAmount)}</strong>}
        </div>
        <div className="nfse-students-actions">
          {props.selectionError && <button type="button" className="nfse-button nfse-button-secondary" onClick={props.onRetry}>Atualizar total</button>}
          <button type="button" className="nfse-button nfse-button-secondary" onClick={props.onClose}>Cancelar</button>
          <button type="button" className="nfse-button nfse-button-primary" disabled={!props.canAdd || busy || props.selectionLoading || Boolean(props.selectionError)} onClick={props.onAdd}>
            <UserPlus size={16} />Adicionar selecionados
          </button>
        </div>
      </footer>
    </div>
  </div>, document.body);
}
