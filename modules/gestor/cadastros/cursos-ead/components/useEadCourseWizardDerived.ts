import type { EadCourseWizardState } from './useEadCourseWizardState';

export const useEadCourseWizardDerived = (state: EadCourseWizardState) => {
  const {
    nome,
    cargaHoraria,
    cronograma,
  } = state;

  const gradeCurricularPreview = cronograma.length
    ? cronograma
        .map((item) => `${item.titulo || 'Módulo do curso'} - ${item.cargaHoraria || 0}h - Aprovado`)
        .join('\n')
    : 'Módulo introdutório - 20h - Aprovado\nMódulo profissionalizante - 40h - Aprovado\nAvaliação final - 10h - Aprovado';

  const previewTemplateValues = {
    nome_aluno: 'Aluno Teste',
    cpf: '000.000.000-00',
    curso_nome: nome || '[Nome do Curso EAD]',
    carga_horaria: cargaHoraria || '0',
    data_inicio: '04/12/2025',
    data_fim: '30/12/2025',
    periodo: '04/12/2025 até 30/12/2025',
    data_conclusao: new Date().toLocaleDateString('pt-BR'),
    cidade: 'Cidade Exemplo',
    uf: 'UF',
    cidade_uf: 'Cidade Exemplo/UF',
    grade_curricular: gradeCurricularPreview,
    certificado_numero: '00001',
    codigo_certificado: 'CERT-EAD-2B4F-D710-0F26',
    codigo_validacao: 'CERT-EAD-2B4F-D710-0F26',
    pagina_livro: '—',
    livro: '—',
    livro_registro: '—',
    validacao_sistec: '—',
    ensino_medio_estabelecimento: '—',
    ensino_medio_localidade_uf: '—',
    ensino_medio_ano_conclusao: '—',
    url_validacao: 'https://universo.com/validacao',
  };
  const certificatePreviewZoom = 34;
  const certificatePreviewFrameStyle = {
    width: `${297 * (certificatePreviewZoom / 100)}mm`,
    height: `${210 * (certificatePreviewZoom / 100)}mm`,
  };

  return {
    gradeCurricularPreview,
    previewTemplateValues,
    certificatePreviewZoom,
    certificatePreviewFrameStyle,
  };
};
