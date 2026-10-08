import { supabase } from '../../../lib/supabase';
import type { CertificadoAcademico } from '../../gestor/secretaria/certificados/certificados.types';

export const getAlunoEadCertificate = async (alunoId: string, cursoId: string): Promise<CertificadoAcademico | null> => {
  const { data, error } = await supabase
    .from('certificados_academicos')
    .select(`
      *,
      aluno:parceiros!certificados_academicos_aluno_id_fkey(nome, cpf_cnpj, rg, tipo_documento, orgao_emissor, rg_uf_emissao, rg_data_emissao),
      turma:turmas!certificados_academicos_turma_id_fkey(nome, codigo),
      curso:cursos!certificados_academicos_curso_id_fkey(nome, carga_horaria),
      polo:polos!certificados_academicos_polo_id_fkey(nome, cidade, estado)
    `)
    .eq('aluno_id', alunoId)
    .eq('curso_id', cursoId)
    .eq('modalidade', 'EAD')
    .eq('status', 'FINALIZADO')
    .not('codigo_validacao', 'is', null)
    .order('data_conclusao', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as unknown as CertificadoAcademico | null;
};
