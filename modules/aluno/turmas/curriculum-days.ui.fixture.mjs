export const scheduleIo = `
export const supabase = { from(table) {
  const request = { table };
  return {
    select(value) { request.select = value; return this; },
    eq(field, value) { request[field] = value; return this; },
    order(field, options) { request.order = { field, options }; return this; },
    abortSignal(signal) {
      window.scheduleRequests.push(request);
      return new Promise((resolve, reject) => {
        const deliver = () => {
          const fixture = window.scheduleFixture;
          resolve(fixture.failure ? { data: null, error: new Error('Consulta indisponível') }
            : { data: fixture.rows || [], error: null });
        };
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
        if (window.scheduleFixture.pending) window.resolveSchedule = deliver;
        else deliver();
      });
    },
  };
} };
`;

export const scheduleEntry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Summary from './components/turma-detail/AcademicSummaryTab';
import { useAlunoClassSchedule } from './hooks/useAlunoClassSchedule';
const root = createRoot(document.getElementById('root'));
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function App({ fixture }) {
  const scope = fixture.scope;
  const query = useAlunoClassSchedule(scope);
  return <Summary disciplines={fixture.disciplines} summaries={[]} isTechnical={false}
    state={{ isLoading: false, isError: false, error: null, refetch: async () => {} }}
    classes={query.data || []}
    classesState={{ isLoading: query.isLoading, isError: query.isError, error: query.error, refetch: query.refetch }}
    scheduleScopeKey={scope.alunoId + ':' + scope.matriculaId + ':' + scope.turmaId} />;
}
window.renderSchedule = fixture => {
  window.scheduleFixture = fixture;
  window.scheduleRequests ||= [];
  root.render(<QueryClientProvider client={client}><App fixture={fixture} /></QueryClientProvider>);
};
`;

export const scheduleFixture = {
  scope: { alunoId: 'student-a', matriculaId: 'enrollment-a', turmaId: 'class-a', enabled: true },
  disciplines: [
    { id: 'config-one', disciplina_id: 'one', professor_nome: 'Docente de teste',
      disciplinas: { id: 'one', nome: 'Primeira disciplina', carga_horaria: 20,
        modulo: { id: 'module', nome: 'Módulo de teste', ordem: 1 } } },
    { id: 'config-two', disciplina_id: 'two', disciplinas: { id: 'two', nome: 'Segunda disciplina',
      modulo: { id: 'module', nome: 'Módulo de teste', ordem: 1 } } },
  ],
  rows: [
    { id: 'lesson-one', turma_id: 'class-a', disciplina_id: 'one', data_aula: '2026-10-10', sessao: 'M', titulo: 'Conteúdo da manhã', carga_horaria: 4 },
    { id: 'lesson-two', turma_id: 'class-a', disciplina_id: 'one', data_aula: '2026-10-10', sessao: 'T', titulo: 'Conteúdo da tarde', carga_horaria: 4 },
    { id: 'lesson-three', turma_id: 'class-a', disciplina_id: 'two', data_aula: '2026-10-12', sessao: 'N', titulo: 'Conteúdo de outra disciplina', carga_horaria: 2 },
  ],
};
