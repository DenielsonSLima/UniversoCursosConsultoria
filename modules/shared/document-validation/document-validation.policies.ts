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
  carteirinha_preceptor: {
    prefix: 'PRE',
    title: 'Crachá de Preceptor',
  },
  cracha_estagio: {
    prefix: 'CRA-EST',
    title: 'Crachá de Estágio',
  },
  contrato_aluno: {
    prefix: 'CON-ALU',
    title: 'Contrato do Aluno',
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
  termo_estagio: {
    prefix: 'TER-EST',
    title: 'Termo de Estágio',
  },
  pasta_identificacao: {
    prefix: 'PASTA',
    title: 'Pasta de Identificação do Aluno',
  },
  ficha_matricula: {
    prefix: 'FICHA-MAT',
    title: 'Ficha de Matrícula',
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
  diario_classe: {
    prefix: 'DIA',
    title: 'Diário de Classe',
  },
};
