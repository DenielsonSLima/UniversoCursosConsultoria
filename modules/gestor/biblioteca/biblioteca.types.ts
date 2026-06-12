
export type TargetAudience = 'ALUNOS' | 'PROFESSORES' | 'INTERNO' | 'TODOS';
export type Scope = 'GLOBAL' | 'POLO_ESPECIFICO';

export interface LibraryDocument {
  id: string;
  title: string;
  description?: string;
  fileType: 'PDF' | 'DOC' | 'XLS' | 'IMG' | 'VIDEO' | 'OTHER';
  size: string;
  url: string;
  createdAt: string;
  
  // Permissões
  targetAudience: TargetAudience;
  scope: Scope;
  poloId?: string; // Se scope == POLO_ESPECIFICO
  poloName?: string;

  // Metadados
  authorId: string;
  authorName: string;
  isTeacherUpload: boolean; // Se true, foi um professor que subiu para a biblioteca dele
}

export interface TeacherRepository {
  teacherId: string;
  teacherName: string;
  teacherAvatar?: string;
  specialty: string;
  documentsCount: number;
  lastUpdate: string;
}
