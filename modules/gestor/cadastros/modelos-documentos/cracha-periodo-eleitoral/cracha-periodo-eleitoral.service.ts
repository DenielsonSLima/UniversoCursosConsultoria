import { supabase } from '../../../../../lib/supabase';

export const getDefaultCrachaPeriodoEleitoralFields = () => [
  {
    id: 'frente_orgao',
    type: 'text',
    value: '{{ORGAO_TITULO}}',
    x: 45,
    y: 7,
    width: 45,
    page: 'frente',
    style: { fontSize: '18px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', lineHeight: '1.05' },
  },
  {
    id: 'frente_titulo',
    type: 'text',
    value: '{{TITULO_PRINCIPAL}}',
    x: 48,
    y: 30,
    width: 43,
    page: 'frente',
    style: { fontSize: '32px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', lineHeight: '0.95' },
  },
  {
    id: 'frente_faixa',
    type: 'rect',
    value: '',
    x: 48,
    y: 52,
    width: 43,
    height: 3.2,
    page: 'frente',
    style: { backgroundColor: '#0b58a8', borderRadius: '4px' },
  },
  {
    id: 'frente_nome',
    type: 'text',
    value: '{{ALUNO_NOME}}',
    x: 45,
    y: 66,
    width: 48,
    page: 'frente',
    style: { fontSize: '21px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', lineHeight: '1.05' },
  },
  {
    id: 'frente_curso',
    type: 'text',
    value: '{{ALUNO_CURSO}}',
    x: 48,
    y: 76,
    width: 43,
    page: 'frente',
    style: { fontSize: '19px', fontWeight: '700', textAlign: 'center', color: '#0b58a8', lineHeight: '1.05' },
  },
  {
    id: 'frente_selo_sergipe',
    type: 'seal',
    value: 'ESTADO DE\nSERGIPE',
    x: 78,
    y: 79,
    width: 14,
    height: 13,
    page: 'frente',
    style: { color: '#1f2937' },
  },
  {
    id: 'verso_label_nome',
    type: 'text',
    value: 'Nome Completo:',
    x: 6,
    y: 7,
    width: 35,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', color: '#0b58a8', lineHeight: '1' },
  },
  {
    id: 'verso_nome',
    type: 'boxText',
    value: '{{ALUNO_NOME}}',
    x: 6,
    y: 11,
    width: 88,
    height: 7,
    page: 'verso',
    style: { fontSize: '16px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', borderColor: '#0b58a8' },
  },
  {
    id: 'verso_label_instituicao',
    type: 'text',
    value: 'Instituição de Ensino:',
    x: 6,
    y: 19,
    width: 45,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', color: '#0b58a8', lineHeight: '1' },
  },
  {
    id: 'verso_instituicao',
    type: 'boxText',
    value: '{{INSTITUICAO_ENSINO}}',
    x: 6,
    y: 23,
    width: 88,
    height: 7,
    page: 'verso',
    style: { fontSize: '16px', fontWeight: '700', textAlign: 'center', color: '#0b58a8', borderColor: '#0b58a8' },
  },
  {
    id: 'verso_label_categoria',
    type: 'text',
    value: 'Categoria Profissional:',
    x: 6,
    y: 31.5,
    width: 40,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', color: '#0b58a8', lineHeight: '1' },
  },
  {
    id: 'verso_categoria',
    type: 'boxText',
    value: '{{CATEGORIA_PROFISSIONAL}}',
    x: 6,
    y: 35.5,
    width: 42,
    height: 7,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', borderColor: '#0b58a8' },
  },
  {
    id: 'verso_label_matricula',
    type: 'text',
    value: 'Matrícula:',
    x: 52,
    y: 31.5,
    width: 30,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', color: '#0b58a8', lineHeight: '1' },
  },
  {
    id: 'verso_matricula',
    type: 'boxText',
    value: '{{ALUNO_MATRICULA}}',
    x: 52,
    y: 35.5,
    width: 42,
    height: 7,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', borderColor: '#0b58a8' },
  },
  {
    id: 'verso_label_instrutor',
    type: 'text',
    value: 'Instrutor:',
    x: 6,
    y: 44,
    width: 25,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', color: '#0b58a8', lineHeight: '1' },
  },
  {
    id: 'verso_instrutor',
    type: 'boxText',
    value: '{{INSTRUTOR}}',
    x: 6,
    y: 48,
    width: 42,
    height: 7,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', borderColor: '#0b58a8' },
  },
  {
    id: 'verso_label_validade',
    type: 'text',
    value: 'Validade:',
    x: 52,
    y: 44,
    width: 25,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', color: '#0b58a8', lineHeight: '1' },
  },
  {
    id: 'verso_validade',
    type: 'boxText',
    value: '{{VALIDADE}}',
    x: 52,
    y: 48,
    width: 42,
    height: 7,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', borderColor: '#0b58a8' },
  },
  {
    id: 'verso_uso',
    type: 'text',
    value: 'Uso Obrigatório.\nAo término do estágio o crachá deverá ser devolvido ao NEPs',
    x: 18,
    y: 57,
    width: 64,
    page: 'verso',
    style: { fontSize: '14px', fontWeight: '900', textAlign: 'center', color: '#0b58a8', lineHeight: '1.12' },
  },
  {
    id: 'verso_assinatura_linha_1',
    type: 'line',
    value: '',
    x: 12,
    y: 75,
    width: 32,
    page: 'verso',
    style: { backgroundColor: '#64748b' },
  },
  {
    id: 'verso_assinatura_texto_1',
    type: 'text',
    value: 'Instituição de Ensino',
    x: 12,
    y: 77,
    width: 32,
    page: 'verso',
    style: { fontSize: '13px', fontWeight: '500', textAlign: 'center', color: '#1f2937' },
  },
  {
    id: 'verso_assinatura_linha_2',
    type: 'line',
    value: '',
    x: 56,
    y: 75,
    width: 32,
    page: 'verso',
    style: { backgroundColor: '#64748b' },
  },
  {
    id: 'verso_assinatura_texto_2',
    type: 'text',
    value: 'Núcleo de Educação Permanente - SES',
    x: 53,
    y: 77,
    width: 38,
    page: 'verso',
    style: { fontSize: '13px', fontWeight: '500', textAlign: 'center', color: '#1f2937' },
  },
  {
    id: 'verso_selo_sergipe',
    type: 'seal',
    value: 'ESTADO DE\nSERGIPE',
    x: 74,
    y: 84,
    width: 14,
    height: 11,
    page: 'verso',
    style: { color: '#1f2937' },
  },
];

export const DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE = {
  id: 'cracha_periodo_eleitoral',
  nome: 'Crachá Período Eleitoral',
  status: 'ativo',
  disponivelInicio: '',
  disponivelFim: '',
  hasVerso: true,
  orgaoTitulo: 'Hospital de Urgência de Sergipe - HUSE',
  tituloPrincipal: 'ESTÁGIO\nCURRICULAR',
  instituicaoEnsinoPadrao: 'Universo Cursos e Consultoria',
  categoriaPadrao: '{{ALUNO_CURSO}}',
  instrutorPadrao: 'Secretaria Acadêmica',
  validadePadrao: '{{DATA_FIM_DISPONIBILIDADE}}',
  corPrimaria: '#0b58a8',
  corTexto: '#0b58a8',
  corBorda: '#0b58a8',
  bgFrenteUrl: '',
  bgVersoUrl: '',
  ocultarDesignPadrao: false,
  fields: getDefaultCrachaPeriodoEleitoralFields(),
};

const parseLocalDate = (value?: string | null, endOfDay = false) => {
  if (!value) return null;
  const [year, month, day] = String(value).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
};

export const formatCrachaEleitoralDate = (value?: string | null) => {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString('pt-BR') : '';
};

export const isCrachaEleitoralTemplateAvailable = (template: any, now = new Date()) => {
  if (!template || template.status !== 'ativo') return false;
  const start = parseLocalDate(template.disponivelInicio);
  const end = parseLocalDate(template.disponivelFim, true);
  if (!start || !end) return false;
  return now >= start && now <= end;
};

const normalizeTemplate = (template: Record<string, any> | null) => {
  if (!template) return null;

  const normalized = {
    ...DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE,
    ...template,
    bgFrenteUrl: template.bgFrenteUrl || template.bgFrente || template.bg_frente_url || '',
    bgVersoUrl: template.bgVersoUrl || template.bgVerso || template.bg_verso_url || '',
  };

  if (!Array.isArray(normalized.fields) || normalized.fields.length === 0) {
    normalized.fields = getDefaultCrachaPeriodoEleitoralFields();
  }

  return normalized;
};

export const crachaPeriodoEleitoralService = {
  async getTemplate() {
    try {
      const { data, error } = await supabase
        .from('documentos_templates')
        .select('conteudo')
        .eq('id', 'cracha_periodo_eleitoral')
        .maybeSingle();

      if (!error && data?.conteudo) {
        return normalizeTemplate(data.conteudo);
      }
    } catch (e) {
      console.error('[crachaPeriodoEleitoralService] Erro ao buscar template:', e);
    }

    return DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE;
  },

  async saveTemplate(data: any) {
    try {
      const normalized = normalizeTemplate(data) || DEFAULT_CRACHA_PERIODO_ELEITORAL_TEMPLATE;
      const { error } = await supabase
        .from('documentos_templates')
        .upsert({
          id: 'cracha_periodo_eleitoral',
          conteudo: normalized,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;
      return true;
    } catch (e) {
      console.error('[crachaPeriodoEleitoralService] Erro ao salvar template:', e);
      return false;
    }
  },
};
