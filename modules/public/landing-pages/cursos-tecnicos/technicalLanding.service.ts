import { supabase } from '../../../../lib/supabase';
import type {
  TechnicalLandingClass,
  TechnicalLandingCourse,
  TechnicalLandingData,
  TechnicalLandingPolo,
  TechnicalPaymentMethod,
} from './technicalLanding.types';

const paymentMethodsFromConfig = (config: any): TechnicalPaymentMethod[] => {
  const methods: TechnicalPaymentMethod[] = [];
  if (config?.metodosRecebimento?.pix === true) methods.push('PIX');
  if (config?.metodosRecebimento?.boleto === true) methods.push('BOLETO');
  if (config?.metodosRecebimento?.cartao === true && config?.cartao?.aceitar !== false) {
    methods.push('CREDIT_CARD');
  }
  return methods;
};

const mapCourse = (row: any): TechnicalLandingCourse => ({
  id: String(row.id),
  name: String(row.nome || 'Curso técnico'),
  description: String(row.descricao || ''),
  area: String(row.area || 'Formação técnica'),
  workloadHours: Number(row.carga_horaria || 0),
  durationMonths: row.curso_duracao_meses == null ? null : Number(row.curso_duracao_meses),
  imageUrl: row.curso_imagem_url || null,
  landingTemplateKey: row.landing_template_key || null,
  paymentMethods: paymentMethodsFromConfig(row.financeiro_config),
});

const mapTurma = (row: any): TechnicalLandingClass => ({
  id: String(row.turma_id),
  courseId: String(row.curso_id),
  name: String(row.turma_nome || 'Turma técnica'),
  code: String(row.turma_codigo || ''),
  shift: String(row.turno || 'A DEFINIR'),
  status: String(row.turma_status || ''),
  startDate: row.data_inicio || null,
  expectedEndDate: row.data_previsao_termino || null,
  enrollmentStartDate: row.data_inicio_inscricao || null,
  enrollmentEndDate: row.data_fim_inscricao || null,
  totalSeats: Number(row.vagas_totais || 0),
  occupiedSeats: Number(row.vagas_ocupadas || 0),
  availableSeats: Number(row.vagas_disponiveis || 0),
  onlineEnrollmentAvailable: row.inscricoes_online_disponiveis === true,
  enrollmentFee: Number(row.valor_matricula || 0),
  installments: Number(row.qtd_parcelas || 0),
  installmentValue: Number(row.valor_parcela || 0),
  availabilityLabel: String(row.situacao_vagas || 'VAGAS DISPONÍVEIS'),
  acceptsConcurrent: row.aceita_concomitante === true,
  acceptsSubsequent: row.aceita_subsequente !== false,
  minimumHighSchoolGrade: Number(row.serie_minima_ensino_medio) === 3 ? 3 : 2,
});

const mapPolo = (row: any): TechnicalLandingPolo => ({
  id: String(row?.polo_id || ''),
  name: String(row?.polo_nome || 'Polo a definir'),
  city: String(row?.polo_cidade || ''),
  state: String(row?.polo_estado || ''),
  address: row?.polo_endereco || null,
  number: row?.polo_numero || null,
  district: row?.polo_bairro || null,
});

const mapLandingData = (row: any): TechnicalLandingData => ({
  course: mapCourse({
    ...row,
    id: row.curso_id,
    nome: row.curso_nome,
    descricao: row.curso_descricao,
    area: row.curso_area,
    carga_horaria: row.curso_carga_horaria,
    financeiro_config: row.financeiro_config,
  }),
  turma: mapTurma(row),
  polo: mapPolo(row),
});

const attachCoursePaymentConfig = async (rows: any[]) => {
  const courseIds = [...new Set(rows.map((row) => String(row.curso_id)).filter(Boolean))];
  if (courseIds.length === 0) return rows;

  const { data, error } = await supabase
    .from('cursos')
    .select('id, financeiro_config')
    .in('id', courseIds);
  if (error) throw error;

  const configs = new Map((data || []).map((course: any) => [String(course.id), course.financeiro_config]));
  return rows.map((row) => ({
    ...row,
    financeiro_config: configs.get(String(row.curso_id)) || {},
  }));
};

export const technicalLandingService = {
  async listPublishedClasses(limit = 3): Promise<TechnicalLandingData[]> {
    const { data, error } = await supabase.rpc('list_public_technical_classes', {
      p_limit: Math.max(1, Math.min(3, limit)),
      p_turma_id: null,
    });
    if (error) throw error;
    const rows = await attachCoursePaymentConfig(Array.isArray(data) ? data : []);
    return rows.map(mapLandingData);
  },

  async getPublishedClass(turmaId: string): Promise<TechnicalLandingData> {
    const { data, error } = await supabase.rpc('list_public_technical_classes', {
      p_limit: 1,
      p_turma_id: turmaId,
    });

    if (error) throw error;
    const rows = await attachCoursePaymentConfig(Array.isArray(data) ? data : []);
    const row = rows[0] || null;
    if (!row) throw new Error('Turma técnica não encontrada ou não publicada no site.');

    return mapLandingData(row);
  },
};
