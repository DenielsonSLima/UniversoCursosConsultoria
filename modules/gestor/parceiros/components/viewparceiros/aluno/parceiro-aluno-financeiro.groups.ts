import type { StudentReceivable } from './parceiro-aluno-financeiro.service';

interface EnrollmentGroup {
  id: string;
  turma: StudentReceivable['turmas'];
  matricula: StudentReceivable['matriculas'];
  items: StudentReceivable[];
}
interface CourseGroup { id: string; name: string; enrollments: EnrollmentGroup[] }
interface TypeGroup { id: string; label: string; courses: CourseGroup[] }

const types = [
  ['TECNICO', 'Técnico'], ['EAD', 'EAD'], ['LIVRE', 'Livres'],
  ['ESPECIALIZACAO', 'Especialização'], ['SUPERIOR', 'Superior'], ['OUTROS', 'Sem tipo informado'],
] as const;

/** Presentation grouping only: no inference from course names or financial calculations. */
export function groupStudentFinance(items: StudentReceivable[]): TypeGroup[] {
  const groups = new Map<string, TypeGroup>();
  for (const item of items) {
    const course = item.turmas?.cursos;
    const knownType = types.find(([id]) => id === course?.modalidade);
    const [typeId, label] = knownType || types[types.length - 1];
    const type = groups.get(typeId) || { id: typeId, label, courses: [] };
    groups.set(typeId, type);
    // Missing IDs stay separate by enrollment; equal names never merge different courses.
    const courseId = course?.id || `sem-curso:${item.matricula_id || item.id}`;
    let courseGroup = type.courses.find((entry) => entry.id === courseId);
    if (!courseGroup) {
      courseGroup = { id: courseId, name: course?.nome || 'Cobranças gerais', enrollments: [] };
      type.courses.push(courseGroup);
    }
    const enrollmentId = item.matricula_id || `sem-matricula:${item.id}`;
    let enrollment = courseGroup.enrollments.find((entry) => entry.id === enrollmentId);
    if (!enrollment) {
      enrollment = { id: enrollmentId, turma: item.turmas, matricula: item.matriculas, items: [] };
      courseGroup.enrollments.push(enrollment);
    }
    enrollment.items.push(item);
  }
  return types.flatMap(([id]) => groups.has(id) ? [groups.get(id)!] : []);
}
