import { supabase } from '../../../../lib/supabase';
import { queryOptions } from '@tanstack/react-query';

export interface CarteirinhaTechnicalEnrollment {
  enrollmentId: string;
  dataMatricula: string | null;
  turmaId: string;
  turmaNome: string;
  turmaCodigo: string;
  poloId: string;
  cursoNome: string;
  alunoId: string;
  alunoNome: string;
  cpf: string;
  rg: string;
  nascimento: string;
  fotoUrl: string | null;
  tipoDocumento: string | null;
}

export interface CarteirinhaTechnicalClass {
  id: string;
  codigo: string;
  nome: string;
  cursoNome: string;
  poloId: string;
  turno: string;
}

export interface CarteirinhaWorkspace {
  enrollments: CarteirinhaTechnicalEnrollment[];
  classes: CarteirinhaTechnicalClass[];
  institutionalData: any;
  academicConfig: any;
  template: any;
}

export const secretariaCarteirinhasService = {
  async getWorkspace(poloId: string): Promise<CarteirinhaWorkspace> {
    const { data, error } = await supabase.rpc('get_secretaria_carteirinha_workspace_secure', {
      p_polo_id: poloId,
    });

    if (error) throw error;

    const payload: any = Array.isArray(data) ? data[0] : data || {};
    return {
      enrollments: (payload.enrollments || []).map((row: any) => ({
        enrollmentId: row.enrollment_id,
        dataMatricula: row.data_matricula || null,
        turmaId: row.turma_id,
        turmaNome: row.turma_nome || 'Turma não informada',
        turmaCodigo: row.turma_codigo || '',
        poloId: row.polo_id,
        cursoNome: row.curso_nome || 'Curso técnico',
        alunoId: row.aluno_id,
        alunoNome: row.aluno_nome || '',
        cpf: row.cpf_cnpj || '',
        rg: row.rg || '',
        nascimento: row.data_nascimento || '',
        fotoUrl: row.foto_url || null,
        tipoDocumento: row.tipo_documento || null,
      })),
      classes: (payload.classes || []).map((row: any) => ({
        id: row.id,
        codigo: row.codigo || '',
        nome: row.nome || 'Turma não informada',
        cursoNome: row.curso_nome || 'Curso técnico',
        poloId: row.polo_id,
        turno: row.turno || '',
      })),
      institutionalData: payload.institutional_data || null,
      academicConfig: payload.academic_config || {},
      template: payload.template || {},
    };
  },
};

export const secretariaCarteirinhasKeys = {
  workspace: (poloId: string) => ['secretaria', 'carteirinhas', 'workspace', poloId] as const,
};

export const secretariaCarteirinhasWorkspaceQueryOptions = (poloId: string) => queryOptions({
  queryKey: secretariaCarteirinhasKeys.workspace(poloId),
  queryFn: () => secretariaCarteirinhasService.getWorkspace(poloId),
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
});
