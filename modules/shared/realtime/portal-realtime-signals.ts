export const portalRealtimeSignalTable = 'portal_realtime_signals' as const;

export const portalRealtimeTopics = {
  studentCourseAccess: (alunoId: string) =>
    `portal:aluno:${alunoId}:acesso`,
  studentEnrollment: (alunoId: string) =>
    `portal:gestor:aluno:${alunoId}:matricula`,
  studentVaccines: (alunoId: string) =>
    `portal:gestor:aluno:${alunoId}:vacinas`,
  professorAcademic: (professorId: string, poloId: string) =>
    `portal:professor:${professorId}:polo:${poloId}:academico`,
  professorCalendarGeneral: (poloId: string) =>
    `portal:professor:calendar:polo:${poloId}:general`,
  professorCalendarScoped: (professorId: string, poloId: string) =>
    `portal:professor:${professorId}:polo:${poloId}:calendar`,
  professorChats: (professorId: string) =>
    `portal:comunicacao:professor:${professorId}:chats`,
  professorChatMessages: (professorId: string, chatId: string) =>
    `portal:comunicacao:professor:${professorId}:chat:${chatId}`,
};

export const portalRealtimeSignalFilter = (topic: string) => ({
  event: 'INSERT' as const,
  schema: 'public' as const,
  table: portalRealtimeSignalTable,
  filter: `topic=eq.${topic}`,
});
