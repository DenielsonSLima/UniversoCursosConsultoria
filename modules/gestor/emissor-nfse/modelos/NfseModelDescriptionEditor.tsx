import React, { useId, useRef, useState } from 'react';
import NfseDescriptionPreview, { type NfseDescriptionPreviewState } from './NfseDescriptionPreview';

interface Props {
  value: string;
  onChange: (value: string) => void;
  preview: NfseDescriptionPreviewState;
}

const referenceMonthToken = '{{mes_referencia}}';

export default function NfseModelDescriptionEditor({ value, onChange, preview }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [insertionError, setInsertionError] = useState(false);
  const insertMonth = () => {
    const textarea = inputRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + referenceMonthToken + value.slice(end);
    if (next.length > 1000) {
      setInsertionError(true);
      textarea?.focus();
      return;
    }
    setInsertionError(false);
    onChange(next);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + referenceMonthToken.length, start + referenceMonthToken.length);
    });
  };

  return <div className="nfse-field nfse-wide">
    <div className="nfse-description-editor-heading">
      <label htmlFor={id}>Descrição do Serviço/Fornecimento<span className="nfse-model-required" aria-hidden="true"> *</span></label>
      <button type="button" className="nfse-button nfse-button-secondary nfse-description-insert"
        title={`Insere ${referenceMonthToken}, substituído pelo mês dos recebimentos.`}
        onMouseDown={(event) => event.preventDefault()} onClick={insertMonth}>Inserir mês dos recebimentos</button>
    </div>
    <textarea ref={inputRef} id={id} required maxLength={1000} value={value}
      aria-describedby={insertionError ? `${id}-error` : undefined}
      onChange={(event) => { setInsertionError(false); onChange(event.target.value); }} />
    <small className="nfse-model-counter">{value.length}/1000</small>
    {insertionError && <small id={`${id}-error`} className="nfse-model-field-error" role="alert">Reduza a descrição para inserir o mês sem ultrapassar 1.000 caracteres.</small>}
    <NfseDescriptionPreview preview={preview} />
  </div>;
}
