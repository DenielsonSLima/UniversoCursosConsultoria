import { supabase } from '../../../../../lib/supabase';
import {
  CourseAgentFaq,
  CourseAgentSettings,
  CourseAgentStats,
  DEFAULT_COURSE_AGENT_SETTINGS,
} from './course-agent.types';

const mapSettings = (connectionId: string, row: any): CourseAgentSettings => ({
  connectionId,
  enabled: row?.enabled ?? DEFAULT_COURSE_AGENT_SETTINGS.enabled,
  confidenceThreshold: Number(row?.confidence_threshold ?? DEFAULT_COURSE_AGENT_SETTINGS.confidenceThreshold),
  maxClarifications: Number(row?.max_clarifications ?? DEFAULT_COURSE_AGENT_SETTINGS.maxClarifications),
  showPrices: row?.show_prices ?? DEFAULT_COURSE_AGENT_SETTINGS.showPrices,
  showOpenClasses: row?.show_open_classes ?? DEFAULT_COURSE_AGENT_SETTINGS.showOpenClasses,
  greetingMessage: row?.greeting_message || DEFAULT_COURSE_AGENT_SETTINGS.greetingMessage,
  fallbackMessage: row?.fallback_message || DEFAULT_COURSE_AGENT_SETTINGS.fallbackMessage,
  handoffMessage: row?.handoff_message || DEFAULT_COURSE_AGENT_SETTINGS.handoffMessage,
  updatedAt: row?.updated_at,
});

const mapFaq = (row: any): CourseAgentFaq => ({
  id: row.id,
  connectionId: row.conexao_id || null,
  courseId: row.curso_id || null,
  courseName: row.cursos?.nome || null,
  category: row.category || 'geral',
  question: row.question || '',
  answer: row.answer || '',
  keywords: Array.isArray(row.keywords) ? row.keywords : [],
  active: row.active !== false,
  priority: Number(row.priority || 0),
  updatedAt: row.updated_at,
});

const faqPayload = (faq: CourseAgentFaq) => ({
  conexao_id: faq.connectionId,
  curso_id: faq.courseId || null,
  category: faq.category.trim() || 'geral',
  question: faq.question.trim(),
  answer: faq.answer.trim(),
  keywords: faq.keywords.map((item) => item.trim()).filter(Boolean).slice(0, 30),
  active: faq.active,
  priority: Math.max(-100, Math.min(100, Number(faq.priority || 0))),
});

export const courseAgentService = {
  async getSettings(connectionId: string): Promise<CourseAgentSettings> {
    const { data, error } = await supabase
      .from('whatsapp_course_agent_settings')
      .select('*')
      .eq('conexao_id', connectionId)
      .maybeSingle();
    if (error) throw error;
    return mapSettings(connectionId, data);
  },

  async saveSettings(settings: CourseAgentSettings): Promise<CourseAgentSettings> {
    const { data, error } = await supabase
      .from('whatsapp_course_agent_settings')
      .upsert({
        conexao_id: settings.connectionId,
        enabled: settings.enabled,
        confidence_threshold: settings.confidenceThreshold,
        max_clarifications: settings.maxClarifications,
        show_prices: settings.showPrices,
        show_open_classes: settings.showOpenClasses,
        greeting_message: settings.greetingMessage.trim(),
        fallback_message: settings.fallbackMessage.trim(),
        handoff_message: settings.handoffMessage.trim(),
      }, { onConflict: 'conexao_id' })
      .select('*')
      .single();
    if (error) throw error;
    return mapSettings(settings.connectionId, data);
  },

  async getFaqs(connectionId: string): Promise<CourseAgentFaq[]> {
    const { data, error } = await supabase
      .from('whatsapp_course_agent_faq')
      .select('*, cursos(nome)')
      .or(`conexao_id.is.null,conexao_id.eq.${connectionId}`)
      .order('active', { ascending: false })
      .order('priority', { ascending: false })
      .order('question', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapFaq);
  },

  async saveFaq(faq: CourseAgentFaq): Promise<CourseAgentFaq> {
    const payload = faqPayload(faq);
    const query = faq.id
      ? supabase.from('whatsapp_course_agent_faq').update(payload).eq('id', faq.id)
      : supabase.from('whatsapp_course_agent_faq').insert(payload);
    const { data, error } = await query.select('*, cursos(nome)').single();
    if (error) throw error;
    return mapFaq(data);
  },

  async deleteFaq(id: string): Promise<void> {
    const { error } = await supabase
      .from('whatsapp_course_agent_faq')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async getStats(connectionId: string): Promise<CourseAgentStats> {
    const today = new Date().toISOString().slice(0, 10);
    const [coursesResult, classesResult, faqResult, eventsResult] = await Promise.all([
      supabase
        .from('cursos')
        .select('id,nome,modalidade')
        .eq('publicar_site', true)
        .ilike('status', 'ativo')
        .order('nome'),
      supabase
        .from('turmas')
        .select('id', { count: 'exact', head: true })
        .eq('publicar_no_site', true)
        .in('status', ['PLANEJADA', 'INSCRICOES_ABERTAS', 'EM_ANDAMENTO', 'ATIVA', 'ABERTA'])
        .or(`data_inicio_inscricao.is.null,data_inicio_inscricao.lte.${today}`)
        .or(`data_fim_inscricao.is.null,data_fim_inscricao.gte.${today}`),
      supabase
        .from('whatsapp_course_agent_faq')
        .select('id', { count: 'exact', head: true })
        .eq('active', true)
        .or(`conexao_id.is.null,conexao_id.eq.${connectionId}`),
      supabase
        .from('whatsapp_course_agent_events')
        .select('query_text,created_at')
        .eq('conexao_id', connectionId)
        .eq('event_type', 'unmatched')
        .not('query_text', 'is', null)
        .order('created_at', { ascending: false })
        .limit(250),
    ]);

    if (coursesResult.error) throw coursesResult.error;
    if (classesResult.error) throw classesResult.error;
    if (faqResult.error) throw faqResult.error;
    if (eventsResult.error) throw eventsResult.error;

    const courses = coursesResult.data || [];
    const modalityCounts = courses.reduce<Record<string, number>>((acc, course: any) => {
      const modality = String(course.modalidade || 'OUTROS').toUpperCase();
      acc[modality] = (acc[modality] || 0) + 1;
      return acc;
    }, {});
    const unansweredMap = new Map<string, { query: string; count: number; lastAskedAt: string }>();
    (eventsResult.data || []).forEach((event: any) => {
      const query = String(event.query_text || '').trim();
      const key = query.toLocaleLowerCase('pt-BR');
      if (!query || unansweredMap.has(key)) {
        const current = unansweredMap.get(key);
        if (current) current.count += 1;
        return;
      }
      unansweredMap.set(key, {
        query,
        count: 1,
        lastAskedAt: event.created_at,
      });
    });

    return {
      publicCourseCount: courses.length,
      publicClassCount: classesResult.count || 0,
      activeFaqCount: faqResult.count || 0,
      modalityCounts,
      catalog: courses.map((course: any) => ({
        id: course.id,
        name: course.nome,
        modality: course.modalidade || 'OUTROS',
      })),
      unanswered: Array.from(unansweredMap.values())
        .sort((a, b) => b.count - a.count || b.lastAskedAt.localeCompare(a.lastAskedAt))
        .slice(0, 20),
    };
  },
};
