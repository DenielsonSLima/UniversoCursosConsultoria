// File: modules/gestor/biblioteca/biblioteca.types.ts

export type TargetAudience = 'ALUNOS' | 'PROFESSORES' | 'INTERNO' | 'TODOS';
export type Scope = 'GLOBAL' | 'POLO_ESPECIFICO';

export interface LibraryFolder {
  id: string;
  nome: string;
  parentId?: string | null;
  teacherId?: string | null;
  createdAt: string;
}

export interface LibraryDocument {
  id: string;
  pastaId?: string | null;
  title: string;
  description?: string;
  fileType: 'PDF' | 'DOC' | 'XLS' | 'IMG' | 'VIDEO' | 'OTHER';
  size: string;
  url: string;
  targetAudience: TargetAudience;
  scope: Scope;
  poloId?: string | null;
  poloName?: string;
  acessos: number;
  teacherId?: string | null;
  authorName: string;
  createdAt: string;
  
  // Advanced permissions & Release rules
  cursoIds?: string[];
  turmaIds?: string[];
  disciplinaIds?: string[];
  liberacaoTipo?: 'IMEDIATO' | 'POR_DATA' | 'DISCIPLINA_INICIO';
  liberacaoData?: string | null;
  liberacaoDisciplinaId?: string | null;
  liberacaoDiasValidade?: number | null;
}

export interface LibraryDocumentUploadPayload extends Omit<LibraryDocument, 'id' | 'createdAt' | 'acessos' | 'authorName'> {
  file?: File;
  sizeBytes?: number;
  enforceTeacherScope?: boolean;
}

export interface TeacherRepository {
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  specialty: string;
  documentsCount: number;
  lastUpdate: string;
  storageQuotaGb?: number;
  storageUsedBytes?: number;
}

export interface TeacherStorageQuota extends TeacherRepository {
  storageQuotaGb: number;
  storageUsedBytes: number;
}
