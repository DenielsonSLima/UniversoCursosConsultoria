import type { NfseModelType } from '../types/nfse.types';
import React, { useId, useRef, useState } from 'react';
import NfseDescriptionPreview, { type NfseDescriptionPreviewState } from './NfseDescriptionPreview';
import { insertNfseDescriptionVariable, nfseAcademicDescriptionTemplate, nfseDescriptionVariables } from './nfse-description-variables';

interface Props {
  modelType?: NfseModelType | null | '';
  value: string;
  onChange: (value: string) => void;
  preview: NfseDescriptionPreviewState;
}

export default function NfseModelDescriptionEditor({ value, onChange, preview, modelType }: Props) {
  const id = useId();
  const variables = nfseDescriptionVariables.filter(variable => modelType === 'AMBOS' || (modelType === 'ALUNO'
    ? variable.token !== '{{periodo}}' : modelType === 'SERVICO' && variable.token === '{{periodo}}'));
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [insertionError, setInsertionError] = useState(false);
  const insertVariable = (token: string) => {
    if (!variables.some(variable => variable.token === token)) return;
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
      {modelType === 'ALUNO' && <button type="button" className="nfse-button nfse-button-secondary nfse-description-insert"
        onClick={() => { setInsertionError(false); onChange(nfseAcademicDescriptionTemplate); }}>Usar descrição formal de cursos</button>}
    </div>
    <textarea ref={inputRef} id={id} required maxLength={2000} value={value}
      aria-describedby={insertionError ? `${id}-error` : undefined}
      onChange={(event) => { setInsertionError(false); onChange(event.target.value); }} />
    <small className="nfse-model-counter">{value.length}/2000</small>
    <details className="nfse-description-variables">
      <summary>Variáveis da descrição</summary>
      {(modelType === 'AMBOS' ? [
        { label: 'Somente ao emitir para alunos', items: variables.filter(variable => variable.token !== '{{periodo}}') },
        { label: 'Somente ao emitir serviços', items: variables.filter(variable => variable.token === '{{periodo}}') },
      ] : [{ label: '', items: variables }]).map(group => <div key={group.label}>
        {group.label && <small>{group.label}</small>}
        <div className="nfse-model-radio-group">{group.items.map(variable =>
          <button key={variable.token} type="button" className="nfse-button nfse-button-secondary nfse-description-insert"
            title={variable.help} onMouseDown={event => event.preventDefault()}
            onClick={() => insertVariable(variable.token)}>Inserir {variable.label.toLocaleLowerCase('pt-BR')}</button>)}</div>
      </div>)}
      {modelType === 'AMBOS' && <small>Para usar a mesma descrição nos dois fluxos, prefira texto sem variáveis. Variáveis acadêmicas exigem matrícula; período exige datas do serviço. A emissão incompatível será bloqueada, sem inventar dados ou remover trechos.</small>}
      {modelType === 'ALUNO' && <><small>Os dados vêm da matrícula e da turma selecionadas. Inclua curso, matrícula, parcelas e meses de pagamento.</small>
        <small>Textos sem variáveis acadêmicas recebem os dados formais do curso nas novas preparações por recebimentos.</small></>}
      {modelType === 'SERVICO' && <small>Use {'{{periodo}}'} para selecionar as datas inicial e final em cada lançamento. O período não altera a competência fiscal. Dados acadêmicos não são preenchidos a partir do parceiro.</small>}
      {!modelType && <small>Selecione o tipo do modelo para exibir as variáveis disponíveis.</small>}
    </details>
    {insertionError && <small id={`${id}-error`} className="nfse-model-field-error" role="alert">Reduza a descrição para inserir a variável sem ultrapassar 2.000 caracteres.</small>}
    <NfseDescriptionPreview preview={preview} />
  </div>;
}
