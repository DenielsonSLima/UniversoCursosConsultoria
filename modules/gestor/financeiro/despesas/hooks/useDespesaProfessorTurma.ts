import { useEffect, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { despesasQueryKeys } from '../despesas.queryKeys';
import { getUltimaTurmaDoProfessor } from '../despesas-sugestoes.service';
import { getTurmaModalidade, turmaModalidadeOptions, type TurmaModalidade } from '../components/despesa-form.utils';

interface State {
  scope: string;
  turmaEnabled: boolean;
  turmaId: string;
  turmaModalidade: TurmaModalidade | '';
  manual: boolean;
  applied: boolean;
}

const initialState = (scope: string): State => ({
  scope, turmaEnabled: Boolean(scope), turmaId: '', turmaModalidade: '', manual: false, applied: false,
});

type Action =
  | { type: 'scope'; scope: string }
  | { type: 'enabled'; scope: string; enabled: boolean }
  | { type: 'turma'; scope: string; id: string }
  | { type: 'modalidade'; scope: string; modalidade: TurmaModalidade | '' }
  | { type: 'apply'; scope: string; id: string; modalidade: TurmaModalidade }
  | { type: 'unavailable'; scope: string };

function reducer(previous: State, action: Action): State {
  const state = previous.scope === action.scope ? previous : initialState(action.scope);
  if (action.type === 'scope') return state;
  if (action.type === 'enabled') return {
    ...state, turmaEnabled: action.enabled, manual: true,
    ...(!action.enabled ? { turmaId: '', turmaModalidade: '' as const } : {}),
  };
  if (action.type === 'turma') return { ...state, turmaId: action.id, manual: true };
  if (action.type === 'modalidade') return { ...state, turmaModalidade: action.modalidade, turmaId: '', manual: true };
  if (action.type === 'unavailable') return { ...state, turmaId: '' };
  if (state.manual || state.applied || !state.turmaEnabled) return state;
  return { ...state, turmaId: action.id, turmaModalidade: action.modalidade, applied: true };
}

export function useDespesaProfessorTurma(
  poloId: string,
  professorId: string,
  isProfessor: boolean,
  turmas: any[],
) {
  const scope = isProfessor && poloId && poloId !== 'todos' && professorId ? `${poloId}:${professorId}` : '';
  const [state, dispatch] = useReducer(reducer, scope, initialState);
  const current = state.scope === scope ? state : initialState(scope);
  const query = useQuery({
    queryKey: [...despesasQueryKeys.lancamentosRoot, 'ultima-turma-professor', poloId, professorId],
    queryFn: () => getUltimaTurmaDoProfessor(poloId, professorId),
    enabled: Boolean(scope),
  });
  const suggested = turmas.find((turma) => turma.id === query.data);
  const modalidade = getTurmaModalidade(suggested);
  const validSuggestion = Boolean(suggested && turmaModalidadeOptions.some((option) => option.value === modalidade));

  useEffect(() => { dispatch({ type: 'scope', scope }); }, [scope]);
  useEffect(() => {
    if (!scope || !query.isSuccess || query.isFetching || !validSuggestion) return;
    dispatch({ type: 'apply', scope, id: suggested.id, modalidade: modalidade as TurmaModalidade });
  }, [scope, query.isSuccess, query.isFetching, validSuggestion, suggested?.id, modalidade]);
  useEffect(() => {
    if (state.scope === scope && state.turmaId && !turmas.some((turma) => turma.id === state.turmaId)) {
      dispatch({ type: 'unavailable', scope });
    }
  }, [scope, state.scope, state.turmaId, turmas]);

  let message = '';
  if (scope && current.turmaEnabled && !current.manual) {
    if (query.isError) message = 'Não foi possível sugerir a última turma. Você pode escolher uma turma.';
    else if (query.isPending || query.isFetching) message = 'Buscando a última turma usada para este professor…';
    else if (!query.data) message = 'Sem turma anterior neste polo. Você pode escolher uma turma.';
    else if (!validSuggestion) message = 'A última turma não está disponível neste polo. Escolha outra, se desejar.';
    else if (current.applied) message = 'Turma sugerida pela última despesa do professor. Você pode alterar ou desativar.';
  }
  return {
    turmaEnabled: current.turmaEnabled,
    turmaId: current.turmaId,
    turmaModalidade: current.turmaModalidade,
    setTurmaEnabled: (enabled: boolean) => dispatch({ type: 'enabled', scope, enabled }),
    setTurmaId: (id: string) => dispatch({ type: 'turma', scope, id }),
    setTurmaModalidade: (value: TurmaModalidade | '') => dispatch({ type: 'modalidade', scope, modalidade: value }),
    message,
  };
}
