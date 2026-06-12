
import { CursoEspecializacao } from './cursos-especializacao.types';

// Dados Iniciais Mockados
let mockCursos: CursoEspecializacao[] = [
  {
    id: '1',
    nome: 'Especialização em Instrumentação Cirúrgica',
    descricao: 'Capacitação para atuar no bloco cirúrgico auxiliando a equipe médica.',
    cargaHorariaTotal: 360,
    duracaoMeses: 6,
    area: 'Saúde',
    requisito: 'Técnico em Enfermagem',
    modulos: [
      {
        id: 'm1',
        nome: 'Fundamentos Cirúrgicos',
        disciplinas: [
          { 
            id: 'd1', 
            nome: 'Centro Cirúrgico e CME', 
            cargaHoraria: 40,
            aulas: [
              { id: 'a1', titulo: 'Estrutura do Bloco Cirúrgico', cargaHoraria: 10 },
              { id: 'a2', titulo: 'Processos de Esterilização', cargaHoraria: 30 }
            ]
          }
        ]
      }
    ]
  },
  {
    id: '2',
    nome: 'Especialização em Enfermagem do Trabalho',
    descricao: 'Gestão da saúde ocupacional e prevenção de acidentes nas empresas.',
    cargaHorariaTotal: 400,
    duracaoMeses: 8,
    area: 'Saúde Ocupacional',
    requisito: 'Técnico em Enfermagem',
    modulos: []
  },
  {
    id: '3',
    nome: 'Especialização em Urgência e Emergência',
    descricao: 'Atendimento pré-hospitalar e intra-hospitalar a pacientes críticos.',
    cargaHorariaTotal: 380,
    duracaoMeses: 7,
    area: 'Saúde',
    requisito: 'Técnico em Enfermagem',
    modulos: []
  }
];

export const cursosEspecializacaoService = {
  async getAll(): Promise<CursoEspecializacao[]> {
    return new Promise((resolve) => setTimeout(() => resolve(mockCursos), 500));
  },

  async getById(id: string): Promise<CursoEspecializacao | undefined> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockCursos.find(c => c.id === id)), 300);
    });
  },

  async update(curso: CursoEspecializacao): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        mockCursos = mockCursos.map(c => c.id === curso.id ? curso : c);
        resolve();
      }, 500);
    });
  },

  async create(curso: CursoEspecializacao): Promise<CursoEspecializacao> {
      return new Promise((resolve) => {
          setTimeout(() => {
              const newCurso = { ...curso, id: Math.random().toString(36).substr(2, 9) };
              mockCursos.push(newCurso);
              resolve(newCurso);
          }, 500);
      });
  }
};
