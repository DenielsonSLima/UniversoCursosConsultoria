import type { NfseModel, NfseModelType } from '../types/nfse.types';

export const nfseModelTypeOptions = [
  { value: 'ALUNO', label: 'Alunos' },
  { value: 'SERVICO', label: 'Serviços' },
  { value: 'AMBOS', label: 'Ambos' },
];
export function nfseModelTypeLabel(value: NfseModel['modelType']): string {
  return value === 'ALUNO' ? 'Alunos' : value === 'SERVICO' ? 'Serviços' : value === 'AMBOS' ? 'Ambos' : 'Tipo não definido';
}
/** An unclassified legacy model remains visible to managers but cannot be used in a new operation. */
export function nfseModelsForType(models: readonly NfseModel[], type: NfseModelType): NfseModel[] {
  return models.filter(model => model.active && (model.modelType === type || (type !== 'AMBOS' && model.modelType === 'AMBOS')));
}
