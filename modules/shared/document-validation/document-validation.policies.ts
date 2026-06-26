import {
  DocumentValidationPolicy,
  ValidatableDocumentType,
} from './document-validation.types';

/**
 * Regras-padrão de validade.
 *
 * Datas específicas da emissão (por exemplo, a validade escolhida na
 * carteirinha) sempre prevalecem sobre estes valores.
 */
export const DOCUMENT_VALIDATION_POLICIES: Record<
  ValidatableDocumentType,
  DocumentValidationPolicy
> = {
  carteirinha: {
    prefix: 'CIE',
    title: 'Carteirinha de Estudante',
  },
  cracha_estagio: {
    prefix: 'CRA-EST',
    title: 'Crachá de Estágio',
  },
  declaracao_matricula: {
    prefix: 'DEC-MAT',
    title: 'Declaração de Matrícula',
  },
  declaracao_frequencia: {
    prefix: 'DEC-FRE',
    title: 'Declaração de Frequência',
  },
  declaracao_irpf: {
    prefix: 'IRPF',
    title: 'Declaração de IRPF',
  },
  boletim: {
    prefix: 'BOL',
    title: 'Boletim Escolar',
  },
  atestado_conclusao_tecnico: {
    prefix: 'ATC-TEC',
    title: 'Atestado de Conclusão de Curso Técnico',
  },
  historico_escolar: {
    prefix: 'HIS',
    title: 'Histórico Escolar',
  },
  transferencia: {
    prefix: 'TRA',
    title: 'Transferência Escolar',
  },
  rematricula: {
    prefix: 'REM',
    title: 'Comprovante de Rematrícula',
  },
  termo_estagio: {
    prefix: 'TER-EST',
    title: 'Termo de Estágio',
  },
  certificado_tecnico: {
    prefix: 'CERT-TEC',
    title: 'Certificado Técnico',
  },
  certificado_livre: {
    prefix: 'CERT-LIV',
    title: 'Certificado de Curso Livre',
  },
  certificado_ead: {
    prefix: 'CERT-EAD',
    title: 'Certificado EAD',
  },
  certificado_especializacao: {
    prefix: 'CERT-ESP',
    title: 'Certificado de Especialização',
  },
};
