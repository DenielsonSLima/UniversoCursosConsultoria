
export interface Aula {
  id: string;
  titulo: string;
  cargaHoraria: number;
  descricao?: string;
}

export interface Disciplina {
  id: string;
  nome: string;
  cargaHoraria: number; // Soma das aulas
  aulas: Aula[];
}

export interface Modulo {
  id: string;
  nome: string; 
  descricao?: string;
  disciplinas: Disciplina[];
}

export interface CursoEspecializacao {
  id: string;
  nome: string;
  descricao: string;
  cargaHorariaTotal: number;
  duracaoMeses: number;
  area: string; 
  requisito: string; // Ex: "Técnico em Enfermagem Concluído"
  modulos: Modulo[];
}
