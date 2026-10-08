import React from 'react';
import DiplomaBlockContent from '../../../cadastros/modelos-documentos/diploma/components/DiplomaBlockContent';
import type { CertificadoAcademico, EadCertificatePage } from '../certificados.types';
import { buildEadCertificateTemplateVars, prepareEadCertificateTemplate, replaceEadCertificateVars } from './certificado-preview.utils';
import { MISSING_EAD_CURRICULUM_TABLE } from './ead-certificate-curriculum';
import { removePublicValidationReferences, shouldRenderCertificateQrBlock } from './certificate-validation-rendering';
import type { AssinaturasData } from '../../../configuracoes/assinaturas/assinaturas.service';

interface EadCertificateBlockProps {
  block: any;
  certificate: CertificadoAcademico;
  model: any;
  curriculumPage?: EadCertificatePage;
  curriculumText: string;
  totalHours?: number | null;
  signatures: AssinaturasData;
  validationCode: string;
  validationUrl: string;
  validationPublic: boolean;
  visibleBlocks: any[];
  getSignatureUrl: (block: any) => string;
}

const EadCertificateBlock: React.FC<EadCertificateBlockProps> = (props) => {
  const { block, certificate, curriculumPage } = props;
  if (block.type === 'qrcode' && !shouldRenderCertificateQrBlock(block, props.validationPublic, props.model)) return null;
  const isCurriculumTable = block.type === 'table' && String(block.content || '').includes('{{grade_curricular}}');
  const templateText = (text: string) => prepareEadCertificateTemplate(
    props.validationPublic ? text : removePublicValidationReferences(text), certificate,
  );
  const previewData = buildEadCertificateTemplateVars(certificate, {
    curriculumText: isCurriculumTable && !curriculumPage?.rows
      ? MISSING_EAD_CURRICULUM_TABLE : curriculumPage?.lines?.join('\n') || props.curriculumText,
    totalHours: props.totalHours,
    validationCode: props.validationCode,
    signatureVars: {
      diretoria_geral_nome: props.signatures.diretoriaGeralNome || '________________',
      diretoria_geral_cargo: props.signatures.diretoriaGeralCargo || 'Diretora Geral',
      secretaria_nome: props.signatures.secretariaNome || '________________',
      secretaria_cargo: props.signatures.secretariaCargo || 'Secretária Escolar',
    },
  });

  return <DiplomaBlockContent
    block={{ ...block, content: templateText(block.content || ''),
      title: templateText(block.title || ''), signerNameContent: templateText(block.signerNameContent || '') }}
    corTexto={props.model?.corTexto || '#1e293b'}
    isEditable={false}
    previewData={previewData}
    signatureTemplateVars={previewData}
    replaceText={(text, extra, strong) => replaceEadCertificateVars(text, certificate, { ...previewData, ...extra }, strong)}
    validationCode={props.validationCode}
    validationUrl={props.validationUrl}
    visibleBlocks={props.visibleBlocks}
    getSignatureUrl={props.getSignatureUrl}
    programmaticRows={isCurriculumTable ? curriculumPage?.rows || [] : undefined}
  />;
};

export default EadCertificateBlock;
