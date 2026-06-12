
export type StatusTurma = 'EM_ANDAMENTO' | 'FINALIZADA';
export type Turno = 'MATUTINO' | 'VESPERTINO' | 'NOTURNO' | 'INTEGRAL' | 'EAD';

export interface Turma {
  id: string;
  codigo: string; // Gerado Automaticamente
  nome: string; // Gerado Automaticamente
  cursoId: string;
  cursoNome: string;
  modalidade: 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'EAD';
  poloId?: string; // Opcional pois EAD não tem
  poloNome?: string; // Opcional pois EAD não tem
  dataInicio: string;
  dataPrevisaoTermino: string;
  turno: Turno;
  status: StatusTurma;
  alunosMatriculados: number;
  alunosAtivos?: number;
  alunosInativos?: number;
  vagasTotais: number;
}
