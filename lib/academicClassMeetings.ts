export type AcademicSessionPeriod = 'M' | 'T' | 'N' | 'U';

export interface AcademicClassSession {
  id: string;
  periodo: AcademicSessionPeriod;
  cargaHoraria: number;
}

type AcademicClassRow = {
  id: string;
  turma_id: string;
  disciplina_id: string;
  data_aula: string | null;
  carga_horaria: number | string | null;
  sessao?: string | null;
};

export const groupAcademicClassMeetings = <T extends AcademicClassRow>(rows: T[]) => {
  const meetings = new Map<string, T & {
    carga_horaria: number;
    sessoes: AcademicClassSession[];
  }>();
  const sessionOrder: Record<string, number> = { M: 1, T: 2, N: 3, U: 4 };

  rows.forEach((row) => {
    const key = `${row.turma_id}:${row.disciplina_id}:${row.data_aula || row.id}`;
    const period = (row.sessao || 'U') as AcademicSessionPeriod;
    const session: AcademicClassSession = {
      id: row.id,
      periodo: period,
      cargaHoraria: Number(row.carga_horaria || 0),
    };
    const current = meetings.get(key);
    if (current) {
      current.carga_horaria += session.cargaHoraria;
      current.sessoes.push(session);
      current.sessoes.sort(
        (left, right) => (sessionOrder[left.periodo] || 9) - (sessionOrder[right.periodo] || 9),
      );
      return;
    }
    meetings.set(key, {
      ...row,
      carga_horaria: session.cargaHoraria,
      sessoes: [session],
    });
  });

  return Array.from(meetings.values());
};

export const formatAcademicSessions = (sessions: AcademicClassSession[]) => {
  if (sessions.length <= 1) return null;
  return sessions
    .map((session) => `${session.periodo} ${session.cargaHoraria}h`)
    .join(' + ');
};
