export interface StudentCourseAccessItem {
  cursoId: string;
  turmaId?: string | null;
  cursoNome: string;
  turmaNome?: string | null;
  modalidade?: string | null;
  imagemUrl?: string | null;
  accessedAt?: string;
}

const getRecentKey = (alunoId: string) => `aluno:${alunoId}:recent-course-access`;
const getPinnedKey = (alunoId: string) => `aluno:${alunoId}:pinned-course-access`;

const canUseStorage = () => {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const parseStorageArray = <T,>(key: string): T[] => {
  if (!canUseStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const getStudentCourseAccessKey = (item: Pick<StudentCourseAccessItem, 'cursoId' | 'turmaId'>) =>
  `${item.cursoId || 'curso'}::${item.turmaId || 'sem-turma'}`;

export const getStudentRecentCourses = (alunoId: string): StudentCourseAccessItem[] => {
  if (!alunoId) return [];
  return parseStorageArray<StudentCourseAccessItem>(getRecentKey(alunoId))
    .filter((item) => item?.cursoId && item?.cursoNome)
    .sort((a, b) => String(b.accessedAt || '').localeCompare(String(a.accessedAt || '')));
};

export const recordStudentCourseAccess = (alunoId: string, item: StudentCourseAccessItem) => {
  if (!alunoId || !item?.cursoId || !canUseStorage()) return;

  const key = getStudentCourseAccessKey(item);
  const current = getStudentRecentCourses(alunoId);
  const nextItem: StudentCourseAccessItem = {
    ...item,
    cursoNome: item.cursoNome || 'Curso',
    turmaNome: item.turmaNome || null,
    modalidade: item.modalidade || null,
    imagemUrl: item.imagemUrl || null,
    accessedAt: new Date().toISOString(),
  };
  const next = [
    nextItem,
    ...current.filter((course) => getStudentCourseAccessKey(course) !== key),
  ].slice(0, 12);

  try {
    window.localStorage.setItem(getRecentKey(alunoId), JSON.stringify(next));
  } catch {
    return;
  }
};

export const getStudentPinnedCourseKeys = (alunoId: string): string[] => {
  if (!alunoId) return [];
  return parseStorageArray<string>(getPinnedKey(alunoId)).filter(Boolean);
};

export const toggleStudentPinnedCourse = (alunoId: string, courseKey: string) => {
  if (!alunoId || !courseKey || !canUseStorage()) return getStudentPinnedCourseKeys(alunoId);

  const current = getStudentPinnedCourseKeys(alunoId);
  const next = current.includes(courseKey)
    ? current.filter((key) => key !== courseKey)
    : [courseKey, ...current].slice(0, 6);

  try {
    window.localStorage.setItem(getPinnedKey(alunoId), JSON.stringify(next));
  } catch {
    return current;
  }
  return next;
};
