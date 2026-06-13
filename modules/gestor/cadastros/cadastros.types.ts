// File: modules/gestor/cadastros/cadastros.types.ts

export interface Aula {
  id: string;
  titulo: string;
  cargaHoraria: number;
  descricao?: string;
}

export interface Disciplina {
  id: string;
  nome: string;
  cargaHoraria: number;
  descricao?: string;
  aulas: Aula[];
}

export interface Modulo {
  id: string;
  nome: string;
  descricao?: string;
  disciplinas: Disciplina[];
}

export interface Curso {
  id: string;
  nome: string;
  modalidade: 'TECNICO' | 'LIVRE' | 'ESPECIALIZACAO' | 'EAD' | 'SUPERIOR';
  carga_horaria: number;
  status: 'ativo' | 'inativo';
  area: string;
  descricao: string;
  versao: string;
  created_at?: string;
  modulos?: Modulo[];
}
