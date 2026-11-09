import { useEffect, useReducer } from 'react';
import { useQuery } from '@tanstack/react-query';
import { despesasQueryKeys, type DespesaTipo } from '../despesas.queryKeys';
import { getUltimaDespesaDoCredor } from '../despesas-sugestoes.service';
import type { CategoriaFinanceira } from '../despesas.types';
import { despesaSugestaoReducer, initialSugestaoState } from '../components/despesa-sugestao.model';

export function useDespesaSugestao(
  poloId: string,
  tipo: DespesaTipo,
  fornecedorId: string,
  categorias: CategoriaFinanceira[] | undefined,
  categoriasResolvidas: boolean,
) {
  const enabled = Boolean(poloId && poloId !== 'todos' && fornecedorId && tipo !== 'OUTRO_DEBITO');
  const scope = enabled ? `${poloId}:${tipo}:${fornecedorId}` : '';
  const [state, dispatch] = useReducer(despesaSugestaoReducer, initialSugestaoState);
  const query = useQuery({
    queryKey: [...despesasQueryKeys.lancamentosRoot, 'ultima-do-credor', poloId, tipo, fornecedorId],
    queryFn: () => getUltimaDespesaDoCredor(poloId, tipo, fornecedorId),
    enabled,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    dispatch({ type: 'selecionar', scope });
  }, [scope]);

  useEffect(() => {
    if (!enabled || !query.isSuccess || query.isFetching || !categoriasResolvidas) return;
    dispatch({
      type: 'aplicar', scope, sugestao: query.data,
      categoriasAtivas: (categorias || []).filter((item) => item.status === 'ativo').map((item) => item.id),
    });
  }, [enabled, scope, query.isSuccess, query.isFetching, query.data, categorias, categoriasResolvidas]);

  let message = '';
  if (enabled) {
    if (query.isError) message = 'Não foi possível consultar a última despesa. Você pode preencher manualmente.';
    else if (!state.concluida || state.scope !== scope) message = 'Consultando a última despesa deste parceiro…';
    else if (!state.encontrada) message = 'Este parceiro ainda não tem despesa anterior neste polo e tipo.';
    else if (state.aplicados) message = 'Preenchido com base na última despesa deste parceiro. Confira os campos.';
    else message = 'Última despesa encontrada. Seus campos preenchidos foram mantidos.';
    if (state.scope === scope && state.categoriaIndisponivel && !state.manuais.categoriaId) {
      message += ' A categoria anterior está indisponível; selecione outra.';
    }
  }

  return {
    ...state.campos,
    setDescricao: (value: string) => dispatch({ type: 'editar', campo: 'descricao', value }),
    setValor: (value: string) => dispatch({ type: 'editar', campo: 'valor', value }),
    setCategoriaId: (value: string) => dispatch({ type: 'editar', campo: 'categoriaId', value }),
    message,
    failed: enabled && query.isError,
    retry: () => { void query.refetch(); },
  };
}
