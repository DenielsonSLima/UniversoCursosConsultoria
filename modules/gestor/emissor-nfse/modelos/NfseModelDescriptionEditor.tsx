import React, { useId, useRef, useState } from 'react';
import NfseDescriptionPreview, { type NfseDescriptionPreviewState } from './NfseDescriptionPreview';
import { insertNfseDescriptionVariable, nfseAcademicDescriptionTemplate, nfseDescriptionVariables } from './nfse-description-variables';

interface Props {
  value: string;
  onChange: (value: string) => void;
  preview: NfseDescriptionPreviewState;
}

export default function NfseModelDescriptionEditor({ value, onChange, preview }: Props) {
  const id = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [insertionError, setInsertionError] = useState(false);
  const insertVariable = (token: string) => {
    const textarea = inputRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const next = insertNfseDescriptionVariable(value, token, start, end);
    if (next === null) {
      setInsertionError(true);
      textarea?.focus();
      return;
    }
    setInsertionError(false);
    onChange(next);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return <div className="nfse-field nfse-wide">
    <div className="nfse-description-editor-heading">
      <label htmlFor={id}>Descrição do Serviço/Fornecimento<span className="nfse-model-required" aria-hidden="true"> *</span></label>
      <button type="button" className="nfse-button nfse-button-secondary nfse-description-insert"
        onClick={() => { setInsertionError(false); onChange(nfseAcademicDescriptionTemplate); }}>Usar descrição formal de cursos</button>
    </div>
    <textarea ref={inputRef} id={id} required maxLength={2000} value={value}
      aria-describedby={insertionError ? `${id}-error` : undefined}
      onChange={(event) => { setInsertionError(false); onChange(event.target.value); }} />
    <small className="nfse-model-counter">{value.length}/2000</small>
    <details className="nfse-description-variables">
      <summary>Variáveis da descrição</summary>
      <div className="nfse-model-radio-group">{nfseDescriptionVariables.map(variable =>
        <button key={variable.token} type="button" className="nfse-button nfse-button-secondary nfse-description-insert"
          title={variable.help} onMouseDown={event => event.preventDefault()}
          onClick={() => insertVariable(variable.token)}>Inserir {variable.label.toLocaleLowerCase('pt-BR')}</button>)}</div>
      <small>Para cursos preparados pelos recebimentos, os dados vêm da matrícula e da turma selecionadas. Inclua curso, matrícula, parcelas e meses de pagamento. Em Serviços, confirme uma descrição literal do serviço; dados acadêmicos não são preenchidos a partir do parceiro.</small>
      <small>Textos sem variáveis acadêmicas recebem os dados formais do curso nas novas preparações por recebimentos. A revisão mostrará a descrição completa antes da emissão.</small>
    </details>
    {insertionError && <small id={`${id}-error`} className="nfse-model-field-error" role="alert">Reduza a descrição para inserir a variável sem ultrapassar 2.000 caracteres.</small>}
    <NfseDescriptionPreview preview={preview} />
  </div>;
}
