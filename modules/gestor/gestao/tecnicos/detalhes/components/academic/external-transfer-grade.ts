export interface ExternalTransferDiscipline {
  id: string;
  nome: string;
  ordem: number;
  cargaHoraria: number;
}
export interface ExternalTransferModule {
  id: string;
  nome: string;
  ordem: number;
  disciplinas: ExternalTransferDiscipline[];
}
export interface ExternalTransferGrade {
  versao: 1;
  turmaId: string;
  cursoId: string;
  cursoNome: string;
  modulos: ExternalTransferModule[];
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value)
  && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const requireExternalTransferGrade = (value: unknown, turmaId: string): ExternalTransferGrade => {
  const moduleIds = new Set<string>();
  const disciplineIds = new Set<string>();
  if (!record(value) || value.versao !== 1 || value.turmaId !== turmaId || !uuid(value.turmaId)
    || !uuid(value.cursoId) || !text(value.cursoNome) || !Array.isArray(value.modulos)
    || !value.modulos.every((module) => {
      if (!record(module) || !uuid(module.id) || !text(module.nome) || !Number.isInteger(module.ordem)
        || moduleIds.has(module.id) || !Array.isArray(module.disciplinas)) return false;
      moduleIds.add(module.id);
      return module.disciplinas.every((discipline) => {
        if (!record(discipline) || !uuid(discipline.id) || !text(discipline.nome)
          || !Number.isInteger(discipline.ordem) || typeof discipline.cargaHoraria !== 'number'
          || !Number.isFinite(discipline.cargaHoraria) || discipline.cargaHoraria < 0
          || disciplineIds.has(discipline.id)) return false;
        disciplineIds.add(discipline.id);
        return true;
      });
    })) throw new Error('O servidor não retornou a grade completa do curso de destino. Recarregue as disciplinas.');
  return value as unknown as ExternalTransferGrade;
};

type Rpc = (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export const loadExternalTransferGrade = async (rpc: Rpc, turmaId: string): Promise<ExternalTransferGrade> => {
  const { data, error } = await rpc('get_grade_recebimento_transferencia_tecnica_secure', { p_turma_id: turmaId });
  if (error) throw error;
  return requireExternalTransferGrade(data, turmaId);
};
