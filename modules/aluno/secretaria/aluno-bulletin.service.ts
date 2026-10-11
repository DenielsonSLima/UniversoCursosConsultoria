import { supabase } from '../../../lib/supabase';
import { assertPdfBlobReady } from '../../gestor/secretaria/shared/pdf-blob-print';
import { buildAcademicPreviewFromPayload } from '../../gestor/secretaria/historico-emissoes/academic-preview';
import type { EmissionPdfSource } from '../../gestor/secretaria/historico-emissoes/emission-pdf-core';
import type { AcademicPreviewRpcPayload } from '../../gestor/secretaria/historico-emissoes/historico-emissoes.types';
import type { CanonicalDocumentPdfResult } from '../../gestor/secretaria/shared/canonical-document-pdf.types';

export interface AlunoBulletinPdf extends CanonicalDocumentPdfResult {
  code: string;
}

type BulletinRpcSource = Omit<EmissionPdfSource, 'preview'> & {
  preview: Omit<EmissionPdfSource['preview'], 'academicData'> & {
    academicData: AcademicPreviewRpcPayload;
  };
};

const assertActiveRequest = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('A emissão do boletim foi cancelada.');
};

/** The own-student RPC supplies the authorized module, stable code and full frozen model. */
export async function loadAlunoBulletinPdf(
  enrollmentId: string,
  alunoId: string,
  moduleId: string,
  signal?: AbortSignal,
): Promise<AlunoBulletinPdf> {
  if (!enrollmentId || !alunoId || !moduleId) {
    throw new Error('Selecione uma matrícula e um módulo para emitir o boletim.');
  }
  assertActiveRequest(signal);
  const request = supabase.rpc('obter_boletim_aluno_pdf', {
    p_matricula_id: enrollmentId,
    p_modulo_id: moduleId,
  });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  assertActiveRequest(signal);
  if (error) throw new Error(error.message || 'Não foi possível consultar o boletim oficial.');
  const source = data as BulletinRpcSource | null;
  const emission = source?.emission;
  if (!emission?.id || !emission.codigo || emission.status !== 'ATIVO'
    || emission.documento !== 'boletim' || emission.periodo_referencia !== moduleId
    || emission.matricula_id !== enrollmentId || emission.aluno_id !== alunoId) {
    throw new Error('O boletim oficial deste módulo não foi localizado.');
  }
  const preview = source?.preview;
  if (!preview?.template || typeof preview.template !== 'object'
    || typeof preview.template.textContent !== 'string' || !preview.template.textContent.trim()
    || (preview.template.absoluteFields !== undefined && !Array.isArray(preview.template.absoluteFields))
    || !preview.polo || typeof preview.polo !== 'object' || Array.isArray(preview.polo)
    || !String(preview.polo.nomeFantasia || preview.polo.nome || '').trim()) {
    throw new Error('O modelo institucional do boletim não está disponível.');
  }
  const payload = preview.academicData;
  if (!payload || !Array.isArray(payload.componentes) || !payload.componentes.length
    || payload.componentes.some((row) => !row || row.moduleId !== moduleId)) {
    throw new Error('Os dados acadêmicos não pertencem ao módulo selecionado.');
  }
  // The RPC already orders, filters and calculates the selected module.
  const pdfSource: EmissionPdfSource = {
    emission,
    preview: { ...preview, academicData: buildAcademicPreviewFromPayload(payload, null, true) },
  };
  const { createEmissionDocumentsPdf } = await import('../../gestor/secretaria/historico-emissoes/emission-document.pdf');
  assertActiveRequest(signal);
  const result = await createEmissionDocumentsPdf([pdfSource]);
  assertActiveRequest(signal);
  assertPdfBlobReady(result.blob, 'O boletim');
  return { ...result, code: emission.codigo };
}
