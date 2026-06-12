
import { CursoTecnico } from './cursos-tecnicos.types';

// Dados Iniciais Mockados
let mockCursos: CursoTecnico[] = [
  {
    id: '1',
    nome: 'Técnico em Enfermagem',
    descricao: 'Formação completa para atuação em hospitais e clínicas.',
    cargaHorariaTotal: 1200,
    duracaoMeses: 24,
    area: 'Saúde',
    modulos: [
      {
        id: 'm1',
        nome: 'Módulo I - Fundamentos de Saúde',
        disciplinas: [
          { 
            id: 'd1', 
            nome: 'Anatomia e Fisiologia', 
            cargaHoraria: 60,
            aulas: [
              { id: 'a1', titulo: 'Introdução ao Corpo Humano', cargaHoraria: 10 },
              { id: 'a2', titulo: 'Sistema Esquelético', cargaHoraria: 20 },
              { id: 'a3', titulo: 'Sistema Muscular', cargaHoraria: 30 }
            ]
          },
          { 
            id: 'd2', 
            nome: 'Ética e Bioética', 
            cargaHoraria: 30, 
            aulas: [
               { id: 'a4', titulo: 'Código de Ética', cargaHoraria: 15 },
               { id: 'a5', titulo: 'Legislação Profissional', cargaHoraria: 15 }
            ] 
          }
        ]
      }
    ]
  },
  {
    id: '2',
    nome: 'Técnico em Radiologia',
    descricao: 'Operação de equipamentos de diagnóstico por imagem.',
    cargaHorariaTotal: 1600,
    duracaoMeses: 18,
    area: 'Saúde',
    modulos: []
  },
  {
    id: '3',
    nome: 'Técnico em Segurança do Trabalho',
    descricao: 'Prevenção de acidentes e promoção da saúde ocupacional.',
    cargaHorariaTotal: 1400,
    duracaoMeses: 18,
    area: 'Gestão',
    modulos: []
  }
];

export const cursosTecnicosService = {
  async getAll(): Promise<CursoTecnico[]> {
    return new Promise((resolve) => setTimeout(() => resolve(mockCursos), 500));
  },

  async getById(id: string): Promise<CursoTecnico | undefined> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(mockCursos.find(c => c.id === id)), 300);
    });
  },

  async update(curso: CursoTecnico): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        mockCursos = mockCursos.map(c => c.id === curso.id ? curso : c);
        resolve();
      }, 500);
    });
  },

  async create(curso: CursoTecnico): Promise<CursoTecnico> {
      return new Promise((resolve) => {
          setTimeout(() => {
              const newCurso = { ...curso, id: Math.random().toString(36).substr(2, 9) };
              mockCursos.push(newCurso);
              resolve(newCurso);
          }, 500);
      });
  }
};
