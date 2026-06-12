
import { LibraryDocument, TeacherRepository } from './biblioteca.types';

// Mock Docs Institucionais
let mockDocs: LibraryDocument[] = [
  {
    id: '1',
    title: 'Calendário Acadêmico 2024',
    description: 'Datas de provas e feriados.',
    fileType: 'PDF',
    size: '1.2 MB',
    url: '#',
    createdAt: '2024-01-15',
    targetAudience: 'TODOS',
    scope: 'GLOBAL',
    authorId: 'admin',
    authorName: 'Gestão Acadêmica',
    isTeacherUpload: false
  },
  {
    id: '2',
    title: 'Manual do Estágio - Enfermagem',
    description: 'Regras para preenchimento do diário de campo.',
    fileType: 'DOC',
    size: '450 KB',
    url: '#',
    createdAt: '2024-02-10',
    targetAudience: 'ALUNOS',
    scope: 'GLOBAL',
    authorId: 'coord',
    authorName: 'Coordenação Pedagógica',
    isTeacherUpload: false
  },
  {
    id: '3',
    title: 'Planilha de Fechamento de Caixa',
    description: 'Modelo para secretarias locais.',
    fileType: 'XLS',
    size: '25 KB',
    url: '#',
    createdAt: '2024-01-05',
    targetAudience: 'INTERNO',
    scope: 'POLO_ESPECIFICO',
    poloId: '1',
    poloName: 'Japoatã',
    authorId: 'fin',
    authorName: 'Financeiro Central',
    isTeacherUpload: false
  },
  {
    id: '4',
    title: 'Diretrizes para Aulas Práticas',
    description: 'Normas de segurança em laboratório.',
    fileType: 'PDF',
    size: '2.5 MB',
    url: '#',
    createdAt: '2024-02-20',
    targetAudience: 'PROFESSORES',
    scope: 'GLOBAL',
    authorId: 'coord',
    authorName: 'Coordenação',
    isTeacherUpload: false
  }
];

// Mock Repositórios de Professores
let mockTeachers: TeacherRepository[] = [
  {
    teacherId: 't1',
    teacherName: 'Dr. Ricardo Silva',
    specialty: 'Enfermagem / Anatomia',
    documentsCount: 12,
    lastUpdate: '2024-02-25'
  },
  {
    teacherId: 't2',
    teacherName: 'Profa. Ana Costa',
    specialty: 'Ética e Bioética',
    documentsCount: 5,
    lastUpdate: '2024-02-10'
  },
  {
    teacherId: 't3',
    teacherName: 'Prof. Carlos Mendes',
    specialty: 'Radiologia',
    documentsCount: 0,
    lastUpdate: '2024-01-05'
  }
];

export const bibliotecaService = {
  async getInstitutionalDocuments() {
    return new Promise<LibraryDocument[]>((resolve) => {
      setTimeout(() => resolve(mockDocs), 500);
    });
  },

  async getTeacherRepositories() {
    return new Promise<TeacherRepository[]>((resolve) => {
      setTimeout(() => resolve(mockTeachers), 500);
    });
  },

  async uploadDocument(doc: Omit<LibraryDocument, 'id' | 'createdAt' | 'authorId' | 'authorName' | 'isTeacherUpload'>) {
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const newDoc: LibraryDocument = {
          ...doc,
          id: Math.random().toString(36).substr(2, 9),
          createdAt: new Date().toISOString().split('T')[0],
          authorId: 'gestor',
          authorName: 'Gestor Logado',
          isTeacherUpload: false
        };
        mockDocs.unshift(newDoc);
        resolve();
      }, 800);
    });
  },

  async deleteDocument(id: string) {
    return new Promise<void>((resolve) => {
        setTimeout(() => {
            mockDocs = mockDocs.filter(d => d.id !== id);
            resolve();
        }, 500);
    });
  }
};
