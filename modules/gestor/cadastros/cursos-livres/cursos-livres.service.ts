
import { CursoLivre } from './cursos-livres.types';

// Dados Iniciais Mockados
let mockCursos: CursoLivre[] = [
  {
    id: '1',
    nome: 'Excel Avançado para Negócios',
    descricao: 'Domine tabelas dinâmicas, macros e dashboards profissionais.',
    cargaHorariaTotal: 40,
    duracaoSemanas: 4,
    area: 'Administração',
    modulos: [
      {
        id: 'm1',
        nome: 'Módulo Único - Domínio de Dados',
        disciplinas: [
          { 
            id: 'd1', 
            nome: 'Funções Avançadas', 
            cargaHoraria: 20,
            aulas: [
              { id: 'a1', titulo: 'PROCV e PROCH', cargaHoraria: 5 },
              { id: 'a2', titulo: 'SE, E, OU aninhados', cargaHoraria: 5 },
              { id: 'a3', titulo: 'ÍNDICE e CORRESP', cargaHoraria: 10 }
            ]
          },
          { 
            id: 'd2', 
            nome: 'Dashboards', 
            cargaHoraria: 20, 
            aulas: [
               { id: 'a4', titulo: 'Gráficos Dinâmicos', cargaHoraria: 10 },
               { id: 'a5', titulo: 'Segmentação de Dados', cargaHoraria: 10 }
            ] 
          }
        ]
      }
    ]
  },
  {
    id: '2',
    nome: 'Oratória e Comunicação',
    descricao: 'Técnicas para falar em público e apresentações de impacto.',
    cargaHorariaTotal: 20,
    duracaoSemanas: 2,
    area: 'Desenvolvimento Pessoal',
    modulos: []
  },
  {
    id: '3',
    nome: 'Primeiros Socorros Básicos',
    descricao: 'Procedimentos de emergência para leigos e profissionais.',
    cargaHorariaTotal: 60,
    duracaoSemanas: 6,
    area: 'Saúde',
    modulos: []
  }
];

export const cursosLivresService = {
  async getAll(): Promise<CursoLivre[]> {
    return new Promise((resolve) => setTimeout(() => resolve(mockCursos), 500));
  },

  async getById(id: string): Promise<CursoLivre | undefined> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockCursos.find(c => c.id === id)), 300);
    });
  },

  async update(curso: CursoLivre): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        mockCursos = mockCursos.map(c => c.id === curso.id ? curso : c);
        resolve();
      }, 500);
    });
  },

  async create(curso: CursoLivre): Promise<CursoLivre> {
      return new Promise((resolve) => {
          setTimeout(() => {
              const newCurso = { ...curso, id: Math.random().toString(36).substr(2, 9) };
              mockCursos.push(newCurso);
              resolve(newCurso);
          }, 500);
      });
  }
};
