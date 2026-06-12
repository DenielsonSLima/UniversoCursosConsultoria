
export interface Aula {
  id: string;
  titulo: string;
  cargaHoraria: number; // Horas específicas desta aula/conteúdo
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

export interface CursoLivre {
  id: string;
  nome: string;
  descricao: string;
  cargaHorariaTotal: number;
  duracaoSemanas: number; // Diferença: Cursos livres geralmente medem em semanas ou dias
  area: string; 
  modulos: Modulo[];
}
