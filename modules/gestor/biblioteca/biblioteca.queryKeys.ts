export const bibliotecaQueryKeys = {
  foldersRoot: ['library-folders'] as const,
  folders: (teacherId: string | null, currentFolderId: string | null) =>
    ['library-folders', teacherId, currentFolderId] as const,
  documentsRoot: ['library-documents'] as const,
  documents: (teacherId: string | null, currentFolderId: string | null) =>
    ['library-documents', teacherId, currentFolderId] as const,
  allFoldersMoveRoot: ['library-all-folders-move'] as const,
  allFoldersMove: (teacherId: string | null) =>
    ['library-all-folders-move', teacherId] as const,
  courses: ['library-cursos-list'] as const,
  classes: ['library-turmas-list'] as const,
  disciplines: ['library-disciplinas-list'] as const,
  rulesDocuments: ['library-all-documents-rules'] as const,
  topAccessed: ['library-top-accessed'] as const,
  topRecent: ['library-top-recent'] as const,
  teacherRepositories: ['library-teacher-repositories'] as const,
  teacherStorageConfigs: ['library-teacher-storage-configs'] as const,
};
