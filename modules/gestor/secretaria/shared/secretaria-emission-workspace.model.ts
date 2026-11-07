import { useEffect, useState } from 'react';
import { SecretariaAlunoResumo, SecretariaMatriculaResumo } from './secretaria-documentos.types';
export type EmissionMode = 'individual' | 'lote' | 'custom';

export interface CustomEmissionSelection {
  aluno: SecretariaAlunoResumo;
  matricula: SecretariaMatriculaResumo;
}

export type DocumentoBatchModalidade = 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO';

export type DocumentoBatchModalidadeOption = {
  label: string;
  value: DocumentoBatchModalidade;
};

export const DOCUMENTO_LOTE_MODALIDADES: Record<'pasta_identificacao' | 'ficha_matricula', DocumentoBatchModalidadeOption[]> = {
  pasta_identificacao: [
    { label: 'Técnico', value: 'TECNICO' },
    { label: 'Livre', value: 'LIVRE' },
    { label: 'Especialização', value: 'ESPECIALIZACAO' },
  ],
  ficha_matricula: [
    { label: 'Técnico', value: 'TECNICO' },
    { label: 'Livre', value: 'LIVRE' },
    { label: 'Especialização', value: 'ESPECIALIZACAO' },
  ],
};

export const mapModalidadeOptions = (documentoId: string): DocumentoBatchModalidadeOption[] =>
  DOCUMENTO_LOTE_MODALIDADES[
    documentoId as 'pasta_identificacao' | 'ficha_matricula'
  ] || [];

export const useDebouncedValue = <T,>(value: T, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);
  return debouncedValue;
};
