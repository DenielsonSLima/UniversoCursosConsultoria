import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import InstitutionalSelect from '../../../../../shared/components/InstitutionalSelect';
import {
  PIX_KEY_OPTIONS,
  formatPixKeyInput,
  normalizePixKey,
  pixKeyPlaceholder,
  validatePixKey,
  type PixKeyType,
} from '../../formularioparceiros/professor/professor-form.model';

export interface ProfessorPixValue {
  tipoChavePix: PixKeyType;
  chavePix: string;
}

interface ProfessorPixEditorProps {
  professor: { id: string; tipoChavePix?: string | null; chavePix?: string | null };
  onSave: (value: ProfessorPixValue) => Promise<void>;
  canEdit?: boolean;
}

const knownType = (value?: string | null): PixKeyType =>
  PIX_KEY_OPTIONS.some(option => option.value === value) ? value as PixKeyType : '';

const ProfessorPixEditor: React.FC<ProfessorPixEditorProps> = ({ professor, onSave, canEdit = true }) => {
  const inputId = useId();
  const feedbackId = useId();
  const [stored, setStored] = useState({
    tipoChavePix: professor.tipoChavePix || '', chavePix: professor.chavePix || '',
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ProfessorPixValue>({ tipoChavePix: '', chavePix: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const saving = useRef(false);

  useEffect(() => {
    setStored({ tipoChavePix: professor.tipoChavePix || '', chavePix: professor.chavePix || '' });
  }, [professor.tipoChavePix, professor.chavePix]);

  const beginEdit = () => {
    const tipoChavePix = knownType(stored.tipoChavePix);
    setDraft({ tipoChavePix, chavePix: formatPixKeyInput(tipoChavePix, stored.chavePix) });
    setError('');
    setSuccess('');
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit || saving.current) return;
    const validation = validatePixKey(draft.tipoChavePix, draft.chavePix);
    if (validation) { setError(validation); return; }
    const value = { tipoChavePix: draft.tipoChavePix, chavePix: normalizePixKey(draft.tipoChavePix, draft.chavePix) };
    saving.current = true;
    setPending(true);
    setError('');
    setSuccess('');
    try {
      await onSave(value);
      setStored(value);
      setEditing(false);
      setSuccess(value.chavePix ? 'Dados Pix salvos.' : 'Dados Pix salvos sem chave.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar os dados Pix.');
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  const typeLabel = PIX_KEY_OPTIONS.find(option => option.value === stored.tipoChavePix)?.label || 'Tipo não informado';

  return (
    <section aria-label="Dados Pix do professor" className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Pix para recebimento</h3>
          <p className="mt-1 text-xs text-slate-500">Opcional. Informe uma chave para os pagamentos ao professor.</p>
        </div>
        {canEdit && !editing && (
          <button type="button" className="professor-action" onClick={beginEdit}>
            <Pencil size={14} aria-hidden="true" />{stored.chavePix ? 'Editar Pix' : 'Adicionar Pix'}
          </button>
        )}
      </div>

      {editing && canEdit ? (
        <form noValidate onSubmit={save} className="mt-4" aria-busy={pending}>
          <fieldset disabled={pending} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <label htmlFor={`${inputId}-type`} className="mb-1 block text-xs text-slate-600">Tipo da chave Pix</label>
              <InstitutionalSelect id={`${inputId}-type`} value={draft.tipoChavePix} ariaLabel="Tipo de chave Pix"
                onValueChange={value => { setDraft({ tipoChavePix: knownType(value), chavePix: '' }); setError(''); }}
                options={[{ value: '', label: 'Sem chave Pix' }, ...PIX_KEY_OPTIONS]} disabled={pending} className="w-full" />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${inputId}-key`} className="mb-1 block text-xs text-slate-600">Chave Pix</label>
              <input id={`${inputId}-key`} name="chavePix" type={draft.tipoChavePix === 'EMAIL' ? 'email' : 'text'}
                className="professor-input" value={draft.chavePix} disabled={!draft.tipoChavePix || pending}
                placeholder={pixKeyPlaceholder(draft.tipoChavePix)} aria-describedby={feedbackId} aria-invalid={Boolean(error) || undefined}
                inputMode={['CPF', 'PHONE'].includes(draft.tipoChavePix) ? 'numeric' : 'text'}
                onChange={event => { setDraft({ ...draft, chavePix: formatPixKeyInput(draft.tipoChavePix, event.target.value) }); setError(''); }} />
            </div>
          </fieldset>
          <div id={feedbackId} className="mt-2 text-xs text-slate-500">
            {error ? <p role="alert" className="text-rose-700">{error}</p> : 'Você pode deixar o tipo e a chave em branco.'}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {(draft.chavePix || draft.tipoChavePix) && (
              <button type="button" className="professor-action mr-auto" disabled={pending}
                onClick={() => { setDraft({ tipoChavePix: '', chavePix: '' }); setError(''); }}>Remover chave Pix</button>
            )}
            <button type="button" className="professor-action" disabled={pending} onClick={() => { setEditing(false); setError(''); }}>
              <X size={14} aria-hidden="true" />Cancelar
            </button>
            <button type="submit" className="professor-action border-blue-600 text-blue-700" disabled={pending}>
              <Check size={14} aria-hidden="true" />{pending ? 'Salvando Pix…' : 'Salvar Pix'}
            </button>
          </div>
        </form>
      ) : stored.chavePix ? (
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Tipo da chave Pix</dt><dd className="mt-1 text-sm text-slate-700">{typeLabel}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-slate-500">Chave Pix</dt><dd className="mt-1 break-all text-sm text-slate-700">{stored.chavePix}</dd></div>
        </dl>
      ) : <p className="mt-3 text-sm text-slate-500">Nenhuma chave Pix informada.</p>}
      {success && <p role="status" className="mt-3 text-xs text-emerald-700">{success}</p>}
    </section>
  );
};

export default ProfessorPixEditor;
