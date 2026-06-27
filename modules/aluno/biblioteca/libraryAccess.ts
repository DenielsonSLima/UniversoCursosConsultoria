type MaybeString = string | null | undefined;

export interface AlunoLibraryAccessContext {
  activeTurmaIds: string[];
  activeCursoIds: string[];
  activePoloIds: string[];
  activeTeacherIds: string[];
  turmaDisciplinas: Array<{
    turma_id: string;
    disciplina_id: string;
    created_at?: MaybeString;
  }>;
}

const toIdArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

export const isLibraryUrl = (url: unknown): boolean => {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
};

const hasAnyMatch = (sourceIds: string[], activeSet: Set<string>) => {
  return sourceIds.some((id) => activeSet.has(id));
};

export const canAccessLibraryDocumentAsAluno = (
  doc: any,
  context: AlunoLibraryAccessContext
): boolean => {
  if (!doc) return false;

  const turmaSet = new Set(context.activeTurmaIds);
  const cursoSet = new Set(context.activeCursoIds);
  const poloSet = new Set(context.activePoloIds);
  const teacherSet = new Set(context.activeTeacherIds);
  const now = Date.now();

  // 1) Público-alvo
  if (doc.publico_alvo !== 'ALUNOS' && doc.publico_alvo !== 'TODOS') {
    return false;
  }

  // 2) Abrangência por polo
  if (doc.abrangencia === 'POLO_ESPECIFICO' && doc.polo_id && !poloSet.has(doc.polo_id)) {
    return false;
  }

  // 3) Apenas professores vinculados ao aluno (se houver)
  if (doc.teacher_id && !teacherSet.has(doc.teacher_id)) {
    return false;
  }

  // 4) Restrições por curso
  const cursoIds = toIdArray(doc.curso_ids);
  if (cursoIds.length > 0) {
    if (cursoSet.size === 0 || !hasAnyMatch(cursoIds, cursoSet)) {
      return false;
    }
  }

  // 5) Restrições por turma
  const turmaIds = toIdArray(doc.turma_ids);
  if (turmaIds.length > 0) {
    if (turmaSet.size === 0 || !hasAnyMatch(turmaIds, turmaSet)) {
      return false;
    }
  }

  // 6) Liberação por data
  if (doc.liberacao_tipo === 'POR_DATA' && doc.liberacao_data) {
    const releaseDate = Date.parse(doc.liberacao_data);
    if (Number.isNaN(releaseDate)) {
      return false;
    }

    if (now < releaseDate) {
      return false;
    }

    const diasValidade = Number(doc.liberacao_dias_validade);
    if (Number.isFinite(diasValidade) && diasValidade > 0) {
      const prazoMs = diasValidade * 24 * 60 * 60 * 1000;
      if (now > releaseDate + prazoMs) {
        return false;
      }
    }
  }

  // 7) Liberação por início de disciplina
  if (doc.liberacao_tipo === 'DISCIPLINA_INICIO') {
    const disciplinaIds = toIdArray(doc.disciplina_ids);
    const triggerDisciplina = typeof doc.liberacao_disciplina_id === 'string'
      ? doc.liberacao_disciplina_id
      : null;

    if (triggerDisciplina && !disciplinaIds.includes(triggerDisciplina)) {
      disciplinaIds.push(triggerDisciplina);
    }

    if (disciplinaIds.length === 0) {
      return false;
    }

    const activeLinks = context.turmaDisciplinas.filter(
      (td) => turmaSet.has(td.turma_id) && disciplinaIds.includes(td.disciplina_id)
    );

    if (activeLinks.length === 0) {
      return false;
    }

    const diasValidade = Number(doc.liberacao_dias_validade);
    if (Number.isFinite(diasValidade) && diasValidade > 0) {
      const prazoMs = diasValidade * 24 * 60 * 60 * 1000;
      const aindaNoPrazo = activeLinks.some((td) => {
        if (!td.created_at) return true;
        const iniciadoEm = Date.parse(td.created_at);
        if (Number.isNaN(iniciadoEm)) return true;
        return now <= iniciadoEm + prazoMs;
      });

      if (!aindaNoPrazo) {
        return false;
      }
    }

    return true;
  }

  // 8) Disciplinas associadas (sem regra de início)
  const docDisciplinas = toIdArray(doc.disciplina_ids);
  if (docDisciplinas.length > 0) {
    if (turmaSet.size === 0) {
      return false;
    }

    const disciplinaPermitida = docDisciplinas.some((disciplinaId) =>
      context.turmaDisciplinas.some(
        (td) => td.disciplina_id === disciplinaId && turmaSet.has(td.turma_id)
      )
    );

    if (!disciplinaPermitida) {
      return false;
    }
  }

  return true;
};

export const matchesLibrarySearch = (doc: any, query: string): boolean => {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  const title = (doc?.titulo || '').toLowerCase();
  const description = (doc?.descricao || '').toLowerCase();
  return title.includes(normalizedQuery) || description.includes(normalizedQuery);
};
