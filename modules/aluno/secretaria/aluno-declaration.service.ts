import { supabase } from '../../../lib/supabase';
import { assertPdfBlobReady } from '../../gestor/secretaria/shared/pdf-blob-print';
import type { EmissionPdfSource } from '../../gestor/secretaria/historico-emissoes/emission-pdf-core';
import type { CanonicalDocumentPdfResult } from '../../gestor/secretaria/shared/canonical-document-pdf.types';

export interface AlunoDeclarationPdf extends CanonicalDocumentPdfResult {
  code: string;
}

const assertActiveRequest = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('A emissão da declaração foi cancelada.');
};

/** The authorized RPC supplies the student's emission and the saved institutional model. */
export async function loadAlunoDeclarationPdf(
  enrollmentId: string,
  alunoId: string,
  signal?: AbortSignal,
): Promise<AlunoDeclarationPdf> {
  if (!enrollmentId || !alunoId) throw new Error('Selecione uma matrícula para emitir a declaração.');
  assertActiveRequest(signal);
  const request = supabase.rpc('obter_declaracao_matricula_aluno_pdf', {
    p_matricula_id: enrollmentId,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  assertActiveRequest(signal);
  if (error) throw new Error(error.message || 'Não foi possível consultar a declaração oficial.');
  const source = data as EmissionPdfSource | null;
  const emission = source?.emission;
  if (!emission?.id || !emission.codigo || emission.status !== 'ATIVO'
    || emission.documento !== 'declaracao_matricula'
    || emission.matricula_id !== enrollmentId || emission.aluno_id !== alunoId) {
    throw new Error('A declaração oficial desta matrícula não foi localizada.');
  }
  const preview = source?.preview;
  if (!preview?.template || typeof preview.template !== 'object'
    || typeof preview.template.textContent !== 'string' || !preview.template.textContent.trim()
    || !preview.polo || typeof preview.polo !== 'object') {
    throw new Error('O modelo institucional da declaração não está disponível.');
  }
  const { createDeclarationDocumentsPdf } = await import('../../gestor/secretaria/historico-emissoes/declaration-document.pdf');
  assertActiveRequest(signal);
  const result = await createDeclarationDocumentsPdf([source]);
  assertActiveRequest(signal);
  assertPdfBlobReady(result.blob, 'A declaração');
  return { ...result, code: emission.codigo };
}
