import React from 'react';
import type { useNfseModelDescriptionPreview } from './hooks/useNfseModelDescriptionPreview';
import './nfse-description-preview.css';

export type NfseDescriptionPreviewState = ReturnType<typeof useNfseModelDescriptionPreview>;

interface Props { preview: NfseDescriptionPreviewState; label?: string }

export default function NfseDescriptionPreview({ preview, label = 'Prévia da descrição' }: Props) {
  if (!preview.hasText) return null;
  if (preview.pending) return <div className="nfse-description-preview" role="status">Conferindo descrição…</div>;
  if (preview.error) return <div className="nfse-description-preview nfse-description-preview-error" role="alert">
    <span>Não foi possível conferir a descrição. Revise o texto ou tente novamente.</span>
    <button type="button" className="nfse-button nfse-button-secondary" onClick={preview.retry}>Tentar novamente</button>
  </div>;
  if (!preview.data) return null;
  return <div className="nfse-description-preview" aria-live="polite">
    <span className="nfse-description-preview-label">{preview.data.requiresAcademicContext ? 'Estrutura da descrição acadêmica' : label}{preview.data.usesReferenceMonth ? ` · ${preview.data.monthLabel}` : ''}</span>
    <p>{preview.data.description}</p>
    {preview.data.requiresAcademicContext && <small>Os trechos entre colchetes indicam a origem dos dados. A preparação preencherá os dados reais e conferirá o limite de 2.000 caracteres.</small>}
  </div>;
}
