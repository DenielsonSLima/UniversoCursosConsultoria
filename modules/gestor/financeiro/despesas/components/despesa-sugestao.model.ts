import { normalizeDespesaDescricao } from '../despesas-descricao.ts';
import type { DespesaSugestao } from '../despesas-sugestoes.service';

export interface SugestaoCampos {
  descricao: string;
  valor: string;
  categoriaId: string;
}

export interface SugestaoState {
  scope: string;
  campos: SugestaoCampos;
  manuais: Partial<Record<keyof SugestaoCampos, boolean>>;
  concluida: boolean;
  encontrada: boolean;
  aplicados: number;
  categoriaIndisponivel: boolean;
}

export const initialSugestaoState: SugestaoState = {
  scope: '',
  campos: { descricao: '', valor: '', categoriaId: '' },
  manuais: {},
  concluida: false,
  encontrada: false,
  aplicados: 0,
  categoriaIndisponivel: false,
};

type Action =
  | { type: 'selecionar'; scope: string }
  | { type: 'editar'; campo: keyof SugestaoCampos; value: string }
  | { type: 'aplicar'; scope: string; sugestao: DespesaSugestao | null; categoriasAtivas: string[] };

export function despesaSugestaoReducer(state: SugestaoState, action: Action): SugestaoState {
  if (action.type === 'editar') return {
    ...state,
    campos: { ...state.campos, [action.campo]: action.campo === 'descricao' ? normalizeDespesaDescricao(action.value) : action.value },
    manuais: { ...state.manuais, [action.campo]: true },
  };
  if (action.type === 'selecionar') {
    if (state.scope === action.scope) return state;
    return {
      ...initialSugestaoState,
      scope: action.scope,
      manuais: state.manuais,
      campos: {
        descricao: state.manuais.descricao ? state.campos.descricao : '',
        valor: state.manuais.valor ? state.campos.valor : '',
        categoriaId: state.manuais.categoriaId ? state.campos.categoriaId : '',
      },
    };
  }
  if (state.scope !== action.scope || state.concluida) return state;
  const { sugestao } = action;
  if (!sugestao) return { ...state, concluida: true };
  const categoriaIndisponivel = Boolean(sugestao.categoriaId)
    && !action.categoriasAtivas.includes(sugestao.categoriaId);
  const values: SugestaoCampos = {
    descricao: normalizeDespesaDescricao(sugestao.descricao),
    valor: Number.isFinite(sugestao.valorBase) && sugestao.valorBase > 0
      ? sugestao.valorBase.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : '',
    categoriaId: categoriaIndisponivel ? '' : sugestao.categoriaId,
  };
  const campos = { ...state.campos };
  let aplicados = 0;
  for (const campo of Object.keys(values) as (keyof SugestaoCampos)[]) {
    if (!state.manuais[campo] && values[campo]) {
      campos[campo] = values[campo];
      aplicados += 1;
    }
  }
  return { ...state, campos, concluida: true, encontrada: true, aplicados, categoriaIndisponivel };
}

