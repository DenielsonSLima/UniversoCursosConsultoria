import type { SecretariaFinanceiraRecebivel } from './secretariaFinanceira.service';
import type { CourseDebtGroup, CustomFinanceStudent } from './secretaria-financeira.types';
import { generateSafeUuid } from '../../../../lib/randomUuid';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export const today = () => new Date().toISOString().slice(0, 10);

export const formatCurrency = (value: number) => currencyFormatter.format(value);

export const formatDate = (value?: string) => (
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informado'
);

export const formatCurrencyInput = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const normalizeFinanceSearch = (value?: string) => (
  String(value || '').trim().toLocaleLowerCase('pt-BR')
);

export const safeRandomUUID = generateSafeUuid;

export const courseKeyFor = (item: SecretariaFinanceiraRecebivel) => (
  item.cursoId ||
  `${item.modalidade || 'SEM_MODALIDADE'}::${item.cursoNome || 'SEM_CURSO'}`
);

export const groupReceivables = (
  rows: SecretariaFinanceiraRecebivel[],
): CourseDebtGroup[] => {
  const courses = new Map<string, SecretariaFinanceiraRecebivel[]>();
  rows.forEach((item) => {
    const key = courseKeyFor(item);
    const courseRows = courses.get(key);
    if (courseRows) courseRows.push(item);
    else courses.set(key, [item]);
  });

  return Array.from(courses.entries())
    .map(([key, courseRows]) => {
      const studentsMap = new Map<string, SecretariaFinanceiraRecebivel[]>();
      courseRows.forEach((item) => {
        const studentKey = item.alunoId || `sem-aluno::${item.alunoNome}`;
        const studentRows = studentsMap.get(studentKey);
        if (studentRows) studentRows.push(item);
        else studentsMap.set(studentKey, [item]);
      });

      const first = courseRows[0];
      const turmaNames = Array.from(
        new Set(
          courseRows.map((item) => item.turmaNome).filter(Boolean),
        ),
      );
      const students = Array.from(studentsMap.entries())
        .map(([studentKey, studentRows]) => ({
          key: studentKey,
          alunoId: studentRows[0].alunoId,
          alunoNome: studentRows[0].alunoNome,
          alunoCpf: studentRows[0].alunoCpf,
          matricula: studentRows[0].matricula,
          rows: studentRows,
          total: studentRows.reduce((sum, item) => sum + item.valor, 0),
        }))
        .sort((a, b) => a.alunoNome.localeCompare(b.alunoNome, 'pt-BR'));

      return {
        key,
        cursoNome: first.cursoNome || 'Cobranças sem curso vinculado',
        modalidade: first.modalidade || 'Não informada',
        turmaNome: turmaNames.join(', ') || 'Sem turma vinculada',
        rows: courseRows,
        students,
        total: courseRows.reduce((sum, item) => sum + item.valor, 0),
      };
    })
    .sort((a, b) => a.cursoNome.localeCompare(b.cursoNome, 'pt-BR'));
};

export const buildCustomStudents = (
  rows: SecretariaFinanceiraRecebivel[],
): CustomFinanceStudent[] => {
  const students = new Map<string, CustomFinanceStudent>();
  rows.forEach((item) => {
    if (!item.alunoId) return;
    const current = students.get(item.alunoId) || {
      id: item.alunoId,
      nome: item.alunoNome,
      cpf: item.alunoCpf,
      courses: new Set<string>(),
      total: 0,
    };
    current.courses.add(item.cursoNome || 'Sem curso');
    current.total += item.valor;
    students.set(item.alunoId, current);
  });
  return Array.from(students.values())
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};
