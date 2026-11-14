import type { ProfessorDocumentoStatus } from './professor-documentos.service';

export const professorDocumentStatuses: Record<
  ProfessorDocumentoStatus,
  { label: string; color: string }
> = {
  pendente: { label: 'Aguardando envio', color: 'bg-amber-50 text-amber-800' },
  em_analise: { label: 'Em análise', color: 'bg-blue-50 text-blue-700' },
  aprovado: { label: 'Aprovado', color: 'bg-emerald-50 text-emerald-700' },
  recusado: { label: 'Reenvio solicitado', color: 'bg-red-50 text-red-700' },
};
export const professorDocumentButtonBase =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50';
export const professorDocumentButton =
  `${professorDocumentButtonBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
export const professorDocumentPrimaryButton =
  `${professorDocumentButtonBase} border-[#001a33] bg-[#001a33] text-white hover:bg-blue-950`;
export const professorDocumentInput =
  'mt-1 min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 max-sm:min-h-11 max-sm:text-base';
export const professorDocumentDate = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
