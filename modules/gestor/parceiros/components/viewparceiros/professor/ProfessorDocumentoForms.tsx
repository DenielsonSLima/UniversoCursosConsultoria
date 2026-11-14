import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import ProfessorDocumentoDialog from './ProfessorDocumentoDialog';
import {
  PROFESSOR_DOCUMENT_CATEGORIES,
  type ProfessorDocumento,
  type ProfessorDocumentoCategoria,
} from './professor-documentos.service';
import {
  professorDocumentButton as button,
  professorDocumentButtonBase as buttonBase,
  professorDocumentInput as input,
  professorDocumentPrimaryButton as primaryButton,
} from './professor-documentos.presentation';

export interface ProfessorDocumentoSolicitacao {
  nome: string;
  categoria: ProfessorDocumentoCategoria;
  instrucao: string;
}
export interface ProfessorDocumentoRevisao {
  status: 'aprovado' | 'recusado';
  observacao: string;
}
interface SharedProps {
  busy: boolean;
  error: string;
  onClose: () => void;
}

export const ProfessorDocumentoCreateForm: React.FC<
  SharedProps & {
    onSubmit: (value: ProfessorDocumentoSolicitacao) => void;
  }
> = ({ busy, error, onClose, onSubmit }) => {
  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<ProfessorDocumentoCategoria>('outro');
  const [instrucao, setInstrucao] = useState('');
  return (
    <ProfessorDocumentoDialog title='Adicionar pendência documental' busy={busy} onClose={onClose}>
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          if (nome.trim().length >= 2) {
            onSubmit({
              nome: nome.trim(),
              categoria,
              instrucao: instrucao.trim(),
            });
          }
        }}
      >
        <label className='block text-xs font-medium'>
          Nome do documento
          <input
            autoFocus
            required
            minLength={2}
            maxLength={160}
            value={nome}
            disabled={busy}
            onChange={(event) =>
              setNome(event.target.value)}
            className={input}
            placeholder='Ex.: Diploma de graduação'
          />
        </label>
        <fieldset disabled={busy}>
          <legend className='mb-2 text-xs font-medium'>Categoria</legend>
          <div className='flex flex-wrap gap-2'>
            {PROFESSOR_DOCUMENT_CATEGORIES.map((item) => (
              <button
                key={item.value}
                type='button'
                aria-pressed={categoria === item.value}
                onClick={() => setCategoria(item.value)}
                className={`${buttonBase} ${
                  categoria === item.value
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </fieldset>
        <label className='block text-xs font-medium'>
          Orientação (opcional)
          <textarea
            maxLength={1000}
            rows={3}
            value={instrucao}
            disabled={busy}
            onChange={(event) =>
              setInstrucao(event.target.value)}
            className={input}
          />
        </label>
        {error && <p role='alert' className='text-red-700'>{error}</p>}
        <div className='flex justify-end gap-2 border-t border-slate-200 pt-3'>
          <button type='button' className={button} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type='submit'
            disabled={busy || nome.trim().length < 2}
            className={primaryButton}
          >
            {busy ? 'Adicionando…' : 'Adicionar pendência'}
          </button>
        </div>
      </form>
    </ProfessorDocumentoDialog>
  );
};

export const ProfessorDocumentoReviewForm: React.FC<
  SharedProps & {
    documento: ProfessorDocumento;
    onSubmit: (value: ProfessorDocumentoRevisao) => void;
  }
> = ({ documento, busy, error, onClose, onSubmit }) => {
  const [decision, setDecision] = useState<'aprovado' | 'recusado'>('aprovado');
  const [reason, setReason] = useState('');
  return (
    <ProfessorDocumentoDialog title={`Revisar: ${documento.nome}`} busy={busy} onClose={onClose}>
      <form
        className='space-y-4'
        onSubmit={(event) => {
          event.preventDefault();
          if (decision !== 'recusado' || reason.trim()) {
            onSubmit({
              status: decision,
              observacao: reason.trim(),
            });
          }
        }}
      >
        <div className='flex flex-wrap gap-2'>
          <button
            type='button'
            aria-pressed={decision === 'aprovado'}
            disabled={busy}
            onClick={() =>
              setDecision('aprovado')}
            className={`${buttonBase} ${
              decision === 'aprovado'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Check size={15} />Aprovar
          </button>
          <button
            type='button'
            aria-pressed={decision === 'recusado'}
            disabled={busy}
            onClick={() =>
              setDecision('recusado')}
            className={`${buttonBase} ${
              decision === 'recusado'
                ? 'border-red-400 bg-red-50 text-red-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <X size={15} />Solicitar reenvio
          </button>
        </div>
        <label className='block text-xs font-medium'>
          {decision === 'recusado' ? 'Motivo do reenvio' : 'Observação (opcional)'}
          <textarea
            required={decision === 'recusado'}
            rows={3}
            maxLength={1000}
            className={input}
            value={reason}
            onChange={(event) =>
              setReason(event.target.value)}
            disabled={busy}
          />
        </label>
        {error && <p role='alert' className='text-red-700'>{error}</p>}
        <div className='flex justify-end gap-2 border-t border-slate-200 pt-3'>
          <button type='button' className={button} disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button
            type='submit'
            disabled={busy || (decision === 'recusado' && !reason.trim())}
            className={primaryButton}
          >
            {busy ? 'Registrando…' : 'Registrar análise'}
          </button>
        </div>
      </form>
    </ProfessorDocumentoDialog>
  );
};
