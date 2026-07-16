import { supabase } from '../../../lib/supabase';
import { normalizeCursoVacinasConfig } from './vacinas.config';
import {
  AlunoVacinaCursoContext,
  AlunoVacinaRegistro,
  SaveAlunoVacinaInput,
  VacinaStatus,
} from './vacinas.types';

const VACINA_BUCKET = 'vacinas';
const VACINA_SIGNED_URL_TTL_SECONDS = 300;
const VACINA_MAX_FILE_SIZE = 10 * 1024 * 1024;
const VACINA_FILE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const toRegistro = (row: any, signedUrl: string | null = null): AlunoVacinaRegistro => ({
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
  arquivoPath: row.arquivo_url,
  arquivoUrl: signedUrl,
  status: row.status,
  origem: row.origem,
  observacao: row.observacao,
  validadoEm: row.validado_em,
  updatedAt: row.updated_at,
});

const getSignedArquivoUrl = async (path?: string | null): Promise<string | null> => {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(VACINA_BUCKET)
    .createSignedUrl(path, VACINA_SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error('Não foi possível assinar o comprovante vacinal privado.', error);
    return null;
  }
  return data?.signedUrl || null;
};

const hydrateRegistros = async (rows: any[]): Promise<AlunoVacinaRegistro[]> => Promise.all(
  rows.map(async (row) => toRegistro(row, await getSignedArquivoUrl(row.arquivo_url))),
);

const mapRegistros = (rows: any[]): AlunoVacinaRegistro[] => rows.map((row) => toRegistro(row));

const validateVacinaFile = (file: File) => {
  const extension = VACINA_FILE_EXTENSIONS[file.type];
  if (!extension) {
    throw new Error('Envie o comprovante em PDF, JPG ou PNG.');
  }
  if (file.size <= 0 || file.size > VACINA_MAX_FILE_SIZE) {
    throw new Error('O comprovante deve ter no máximo 10 MB.');
  }
  return extension;
};

export const alunoVacinasKeys = {
  contexts: (alunoId: string) => ['aluno-vacinas-contexts', alunoId] as const,
  records: (alunoId: string) => ['aluno-vacinas-records', alunoId] as const,
};

export const alunoVacinasService = {
  hydrateRegistros,
  mapRegistros,
  getArquivoUrl: getSignedArquivoUrl,

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
    return hydrateRegistros(data || []);
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

    const mutablePayload: any = {
      data_aplicacao: input.dataAplicacao || null,
      lote: input.lote || null,
      local_aplicacao: input.localAplicacao || null,
      status: 'em_analise',
      observacao: null,
    };

    if (input.arquivoPath !== undefined) {
      mutablePayload.arquivo_url = input.arquivoPath;
    }

    const query = existing?.id
      ? supabase.from('aluno_vacinas').update(mutablePayload).eq('id', existing.id)
      : supabase.from('aluno_vacinas').insert({
        ...mutablePayload,
        aluno_id: input.alunoId,
        curso_id: input.cursoId,
        matricula_id: input.matriculaId || null,
        turma_id: input.turmaId || null,
        vacina_codigo: input.vacinaCodigo,
        vacina_nome: input.vacinaNome,
        dose_numero: input.doseNumero,
        dose_label: input.doseLabel,
        origem: input.origem || 'aluno',
        arquivo_url: input.arquivoPath || null,
      });

    const { data, error } = await query.select('*').single();
    if (error) throw error;
    return (await hydrateRegistros([data]))[0];
  },

  async uploadVacinaArquivo(input: SaveAlunoVacinaInput, file: File): Promise<AlunoVacinaRegistro> {
    const ext = validateVacinaFile(file);
    const cleanName = `${input.vacinaCodigo}_${input.doseNumero}`
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = `${input.alunoId}/${input.cursoId}/${cleanName}_${Date.now()}.${ext}`;
    const { data: existing, error: existingError } = await supabase
      .from('aluno_vacinas')
      .select('arquivo_url')
      .eq('aluno_id', input.alunoId)
      .eq('curso_id', input.cursoId)
      .eq('vacina_codigo', input.vacinaCodigo)
      .eq('dose_numero', input.doseNumero)
      .maybeSingle();
    if (existingError) throw existingError;

    const { data, error: uploadError } = await supabase.storage
      .from(VACINA_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;
    if (!data?.path) throw new Error('Arquivo enviado, mas o storage nao retornou o caminho.');

    try {
      const saved = await this.saveAlunoVacina({ ...input, arquivoPath: data.path });
      if (existing?.arquivo_url && existing.arquivo_url !== data.path) {
        const { error: removeError } = await supabase.storage
          .from(VACINA_BUCKET)
          .remove([existing.arquivo_url]);
        if (removeError) {
          console.error('Não foi possível remover o comprovante vacinal substituído.', removeError);
        }
      }
      return saved;
    } catch (error) {
      const { error: cleanupError } = await supabase.storage
        .from(VACINA_BUCKET)
        .remove([data.path]);
      if (cleanupError) {
        console.error('Não foi possível limpar o comprovante vacinal não vinculado.', cleanupError);
      }
      throw error;
    }
  },

  async updateStatus(id: string, status: VacinaStatus, observacao?: string | null): Promise<AlunoVacinaRegistro> {
    const { data, error } = await supabase
      .from('aluno_vacinas')
      .update({
        status,
        observacao: observacao || null,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return toRegistro(data);
  },
};
