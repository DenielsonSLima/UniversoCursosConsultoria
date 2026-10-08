import { getBlocks } from '../../../cadastros/modelos-documentos/diploma/components/diploma-preview.blocks';
import type { CertificadoAcademico } from '../certificados.types';
import { getEadCertificateCurriculum, getEadCertificateCurriculumTable } from './ead-certificate-curriculum';

// Layout decisions use the same effective blocks displayed by the template editor.
export const hasEadCurriculumTableBlock = (model: any): boolean =>
  getBlocks(model || {}).some((block: any) => block?.visible && block?.page === 'verso'
    && block?.type === 'table' && String(block.content || '').includes('{{grade_curricular}}'));

export const getCertificatePreviewPageCount = (
  certificate: CertificadoAcademico,
  model: { hasVerso?: boolean; blocks?: unknown[] } | undefined,
): number => model?.hasVerso === false && certificate.modalidade !== 'TECNICO'
  ? 1
  : 1 + ((hasEadCurriculumTableBlock(model)
    ? getEadCertificateCurriculumTable(certificate)?.pages.length
    : getEadCertificateCurriculum(certificate)?.pages.length) || 1);
