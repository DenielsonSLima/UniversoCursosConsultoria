import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = (relativePath: string) => readFile(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
);

const [
  enrollmentSource,
  vaccinesSource,
  calendarPageSource,
  calendarRealtimeSource,
  disciplinesSource,
  communicationPageSource,
  communicationRealtimeSource,
  signalTopicsSource,
] = await Promise.all([
  readSource('gestor/parceiros/components/viewparceiros/aluno/useMatriculaTecnicaWorkflowRealtime.ts'),
  readSource('gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoVacinas.tsx'),
  readSource('professor/calendario/CalendarioProfessorPage.tsx'),
  readSource('professor/calendario/useProfessorCalendarRealtime.ts'),
  readSource('professor/hooks/useProfessorDisciplinas.ts'),
  readSource('professor/comunicacao/ComunicacaoPage.tsx'),
  readSource('professor/comunicacao/useProfessorComunicacaoRealtime.ts'),
  readFile(new URL('./portal-realtime-signals.ts', import.meta.url), 'utf8'),
]);

test('hooks auditados ressincronizam no reconnect e limpam canal e debounce', () => {
  for (const source of [
    enrollmentSource,
    vaccinesSource,
    calendarRealtimeSource,
    disciplinesSource,
    communicationRealtimeSource,
  ]) {
    assert.match(source, /createRealtimeInvalidationController/);
    assert.match(
      source,
      /subscribe\((?:invalidation\.onChannelStatus|onChannelStatus)\)/,
    );
    assert.match(source, /(?:invalidation|recordsInvalidation)\.dispose\(\)/);
    assert.match(source, /removeChannel\(channel\)/);
    assert.match(source, /portalRealtimeSignalFilter/);
  }
});

test('hooks nunca assinam DELETE CDC nem tabelas de domínio', () => {
  for (const source of [
    enrollmentSource,
    vaccinesSource,
    calendarRealtimeSource,
    disciplinesSource,
    communicationRealtimeSource,
  ]) {
    assert.doesNotMatch(source, /event: 'DELETE'/);
    assert.doesNotMatch(source, /payload\.(new|old)/);
    assert.doesNotMatch(source, /setQueryData/);
    assert.doesNotMatch(source, /table:\s*['"]/);
  }
  assert.match(signalTopicsSource, /event: 'INSERT'/);
  assert.match(signalTopicsSource, /table: portalRealtimeSignalTable/);
  assert.match(signalTopicsSource, /filter: `topic=eq\.\$\{topic\}`/);
});

test('vacinas separa registros e contextos nas chaves exatas de cada tópico', () => {
  assert.match(
    vaccinesSource,
    /queryKey: alunoVacinasKeys\.records\(alunoId\),\s*exact: true/,
  );
  assert.match(
    vaccinesSource,
    /queryKey: alunoVacinasKeys\.contexts\(alunoId\),\s*exact: true/,
  );
  assert.match(
    vaccinesSource,
    /studentVaccines\(alunoId\)\),\s*recordsInvalidation\.schedule/,
  );
  assert.match(
    vaccinesSource,
    /studentEnrollment\(alunoId\)\),\s*contextsInvalidation\.schedule/,
  );
  assert.doesNotMatch(
    vaccinesSource,
    /studentEnrollment\(alunoId\)\),\s*recordsInvalidation\.schedule/,
  );
  assert.match(
    vaccinesSource,
    /recordsInvalidation\.onChannelStatus\(status\)[\s\S]*contextsInvalidation\.onChannelStatus\(status\)/,
  );
  assert.match(
    vaccinesSource,
    /recordsInvalidation\.dispose\(\)[\s\S]*contextsInvalidation\.dispose\(\)/,
  );
});

test('calendário usa tópicos separados para geral, escopo docente e acadêmico', () => {
  assert.doesNotMatch(calendarPageSource, /postgres_changes|\.channel\(/);
  assert.match(calendarRealtimeSource, /professorCalendarGeneral/);
  assert.match(calendarRealtimeSource, /professorCalendarScoped/);
  assert.match(calendarRealtimeSource, /professorAcademic/);
  assert.doesNotMatch(calendarRealtimeSource, /turmaFilter|in\.\(/);
});

test('chat nunca injeta CDC bruto nem registra conteúdo de mensagem', () => {
  assert.doesNotMatch(communicationPageSource, /setQueryData|Realtime message received/);
  assert.doesNotMatch(communicationRealtimeSource, /console\.|payload|resolveCommunicationAttachmentUrls/);
  assert.match(communicationPageSource, /professorComunicacaoQueryKeys\.messages\(activeChatId\)/);
  assert.match(communicationRealtimeSource, /invalidateQueries/);
});
