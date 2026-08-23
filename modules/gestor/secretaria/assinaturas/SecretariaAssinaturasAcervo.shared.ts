import type {
  ElectronicSignatureArchiveFilters,
  ElectronicSignatureArtifactClass,
} from "../../../shared/assinatura-eletronica/assinatura-eletronica.contract";
import { ElectronicSignatureRequestError } from "../../../shared/assinatura-eletronica/assinatura-eletronica.service";

export const INITIAL_FILTERS: ElectronicSignatureArchiveFilters = {
  search: '',
  status: 'TODOS',
  documentType: null,
  turmaId: null,
  finalizedFrom: null,
  finalizedTo: null,
};

export const fieldClassName = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#001a33] outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400';

export const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data informada pelo serviço';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Maceio',
  }).format(date);
};

export const roleLabel = (role: string) => ({
  PROFESSOR: 'Professor(a)',
  COORDENADOR: 'Coordenador(a)',
}[role] || role);

export const artifactLabel = (artifactClass: ElectronicSignatureArtifactClass) => (
  artifactClass === 'DOCUMENTO_FINAL' ? 'documento final' : 'comprovante de evidências'
);

export const archiveErrorMessage = (error: unknown) => {
  if (error instanceof ElectronicSignatureRequestError) return error.message;
  return error instanceof Error ? error.message : 'Tente novamente.';
};


