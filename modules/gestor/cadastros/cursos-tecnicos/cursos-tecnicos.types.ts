
export interface Aula {
  id: string;
  titulo: string;
  cargaHoraria: number; // Horas específicas desta aula/conteúdo
  descricao?: string;
}

export interface Disciplina {
  id: string;
  nome: string;
  cargaHoraria: number; // Será a soma das aulas
  aulas: Aula[];
}

export interface Modulo {
  id: string;
  nome: string; 
  descricao?: string;
  disciplinas: Disciplina[];
}

export interface CursoTecnico {
  id: string;
  nome: string;
  descricao: string;
  cargaHorariaTotal: number;
  duracaoMeses: number;
  area: string; 
  status?: string;
  versao?: string;
  totalTurmas?: number;
  cargaHorariaCadastrada?: number;
  publicarSite?: boolean;
  imagemDetalhe1?: string;
  imagemDetalhe2?: string;
  modulos: Modulo[];
}