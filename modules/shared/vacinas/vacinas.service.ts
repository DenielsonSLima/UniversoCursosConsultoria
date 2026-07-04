import { supabase } from '../../../lib/supabase';
import { normalizeCursoVacinasConfig } from './vacinas.config';
import {
  AlunoVacinaCursoContext,
  AlunoVacinaRegistro,
  SaveAlunoVacinaInput,
  VacinaStatus,
} from './vacinas.types';

const getFileExtension = (file: File, fallback = 'bin') => {
  const fromName = file.name.split('.').pop();
  return (fromName || fallback).toLowerCase().replace(/[^a-z0-9]/g, '') || fallback;
};

const toRegistro = (row: any): AlunoVacinaRegistro => ({
  id: row.id,
  alunoId: row.aluno_id,
  cursoId: row.curso_id,
  matriculaId: row.matricula_id,
  turmaId: row.turma_id,
  vacinaCodigo: row.vacina_codigo,
  vacinaNome: row.vacina_nome,
  doseNumero: row.dose_numero,
  doseLabel: row.dose_label,
  dataAplicacao: row.data_aplicacao,
  lote: row.lote,
  localAplicacao: row.local_aplicacao,
  arquivoUrl: row.arquivo_url,
  status: row.status,
  origem: row.origem,
  observacao: row.observacao,
  validadoEm: row.validado_em,
  updatedAt: row.updated_at,
});

export const alunoVacinasKeys = {
  contexts: (alunoId: string) => ['aluno-vacinas-contexts', alunoId] as const,
  records: (alunoId: string) => ['aluno-vacinas-records', alunoId] as const,
};

export const alunoVacinasService = {
  async getCursoContexts(alunoId: string): Promise<AlunoVacinaCursoContext[]> {
    const { data, error } = await supabase
      .from('matriculas')
      .select('id, turma_id, status, turmas(id, nome, cursos(id, nome, modalidade, vacinas_config))')
      .eq('aluno_id', alunoId)
      .in('status', ['ATIVO', 'CONCLUIDO']);

    if (error) throw error;

    return (data || [])
      .map((matricula: any) => {
        const turma = Array.isArray(matricula.turmas) ? matricula.turmas[0] : matricula.turmas;
        const curso = Array.isArray(turma?.cursos) ? turma.cursos[0] : turma?.cursos;
        if (!curso?.id) return null;

        const config = normalizeCursoVacinasConfig(curso.vacinas_config, curso.nome);
        if (!config.exigirCarteiraEstagio || config.vacinas.length === 0) return null;

        return {
          matriculaId: matricula.id || null,
          turmaId: turma?.id || matricula.turma_id || null,
          turmaNome: turma?.nome || null,
          cursoId: curso.id,
          cursoNome: curso.nome || 'Curso',
          config,
        };
      })
      .filter(Boolean) as AlunoVacinaCursoContext[];
  },

  async getAlunoVacinas(alunoId: string): Promise<AlunoVacinaRegistro[]> {
    const { data, error } = await supabase
      .from('aluno_vacinas')
      .select('*')
      .eq('aluno_id', alunoId)
      .order('curso_id', { ascending: true })
      .order('vacina_nome', { ascending: true })
      .order('dose_numero', { ascending: true });

    if (error) throw error;
    return (data || []).map(toRegistro);
  },

  async saveAlunoVacina(input: SaveAlunoVacinaInput): Promise<AlunoVacinaRegistro> {
    const { data: existing, error: existingError } = await supabase
      .from('aluno_vacinas')
      .select('id, arquivo_url')
      .eq('aluno_id', input.alunoId)
      .eq('curso_id', input.cursoId)
      .eq('vacina_codigo', input.vacinaCodigo)
      .eq('dose_numero', input.doseNumero)
      .maybeSingle();

    if (existingError) throw existingError;

    const payload: any = {
      aluno_id: input.alunoId,
      curso_id: input.cursoId,
      matricula_id: input.matriculaId || null,
      turma_id: input.turmaId || null,
      vacina_codigo: input.vacinaCodigo,
      vacina_nome: input.vacinaNome,
      dose_numero: input.doseNumero,
      dose_label: input.doseLabel,
      data_aplicacao: input.dataAplicacao || null,
      lote: input.lote || null,
      local_aplicacao: input.localAplicacao || null,
      status: 'em_analise',
      origem: input.origem || 'aluno',
      observacao: null,
      validado_em: null,
    };

    if (input.arquivoUrl !== undefined) {
      payload.arquivo_url = input.arquivoUrl;
    }

    const query = existing?.id
      ? supabase.from('aluno_vacinas').update(payload).eq('id', existing.id)
      : supabase.from('aluno_vacinas').insert({ ...payload, arquivo_url: input.arquivoUrl || null });

    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return toRegistro(data);
  },

  async uploadVacinaArquivo(input: SaveAlunoVacinaInput, file: File): Promise<AlunoVacinaRegistro> {
    const ext = getFileExtension(file);
    const cleanName = `${input.cursoId}_${input.vacinaCodigo}_${input.doseNumero}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${input.alunoId}/vacinas/${cleanName}_${Date.now()}.${ext}`;

    const { data, error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (uploadError) throw uploadError;
    if (!data?.path) throw new Error('Arquivo enviado, mas o storage nao retornou o caminho.');

    const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(data.path);
    return this.saveAlunoVacina({ ...input, arquivoUrl: urlData.publicUrl });
  },

  async updateStatus(id: string, status: VacinaStatus, observacao?: string | null): Promise<AlunoVacinaRegistro> {
    const { data, error } = await supabase
      .from('aluno_vacinas')
      .update({
        status,
        observacao: observacao || null,
        validado_em: status === 'aprovado' || status === 'reprovado' ? new Date().toISOString() : null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return toRegistro(data);
  },
};
