import { useCallback, useEffect, useState } from 'react';
import type {
  CicloFinanceiroTecnicoManualPreview,
  CicloFinanceiroTecnicoManualRevisao,
  CicloFinanceiroTecnicoManualRevisaoItem,
  CicloManualModoMatricula,
} from '../matricula-tecnica-ciclo-manual.types';

export const revisionFromPreview = (
  preview: CicloFinanceiroTecnicoManualPreview,
): CicloFinanceiroTecnicoManualRevisao => ({
  modoMatricula: preview.modoMatricula ?? (preview.matriculaSemBoleto ? 'OMITIR' : 'BOLETO'),
  emitirMatricula: (preview.modoMatricula ?? (preview.matriculaSemBoleto ? 'OMITIR' : 'BOLETO')) === 'BOLETO',
  itens: [...preview.itens, ...(preview.matriculaSemBoleto ? [preview.matriculaSemBoleto] : [])].map((item) => ({
    chave: item.chave,
    valor: item.valor,
    vencimento: item.vencimento,
    descontoPontualidade: item.detalhesBoleto.desconto?.valor ?? '0',
    jurosAtrasoPercentual: item.detalhesBoleto.juros?.percentualMes ?? '0',
    multaAtrasoPercentual: item.detalhesBoleto.multa?.percentual ?? '0',
  })),
});

interface RevisionState {
  contextKey: string;
  revision: CicloFinanceiroTecnicoManualRevisao | null;
  draft: CicloFinanceiroTecnicoManualRevisao | null;
  dirty: boolean;
}

const initialState = (contextKey: string): RevisionState => ({
  contextKey, revision: null, draft: null, dirty: false,
});

export const useCicloManualRevision = (contextKey: string) => {
  const [state, setState] = useState(() => initialState(contextKey));
  const current = state.contextKey === contextKey ? state : initialState(contextKey);

  useEffect(() => {
    setState((previous) => previous.contextKey === contextKey ? previous : initialState(contextKey));
  }, [contextKey]);

  const seedPreview = useCallback((preview: CicloFinanceiroTecnicoManualPreview | undefined) => {
    if (!preview) return;
    setState((previous) => {
      const existing = previous.contextKey === contextKey ? previous : initialState(contextKey);
      if (existing.dirty) return existing;
      const canonical = revisionFromPreview(preview);
      const canonicalKeys = new Set(canonical.itens.map((item) => item.chave));
      return {
        ...existing,
        draft: {
          modoMatricula: canonical.modoMatricula,
          emitirMatricula: canonical.emitirMatricula,
          itens: [
            ...canonical.itens,
            ...(existing.draft?.itens.filter((item) => !canonicalKeys.has(item.chave)) ?? []),
          ],
        },
      };
    });
  }, [contextKey]);

  const changeItem = (
    key: string,
    field: keyof Omit<CicloFinanceiroTecnicoManualRevisaoItem, 'chave'>,
    value: string,
  ) => {
    setState((previous) => previous.draft ? {
      ...previous,
      dirty: true,
      draft: {
        ...previous.draft,
        itens: previous.draft.itens.map((item) => item.chave === key ? { ...item, [field]: value } : item),
      },
    } : previous);
  };

  const changeEnrollmentMode = (modoMatricula: CicloManualModoMatricula) => {
    setState((previous) => previous.draft ? {
      ...previous, dirty: true, draft: { ...previous.draft, modoMatricula, emitirMatricula: modoMatricula === 'BOLETO' },
    } : previous);
  };

  const apply = () => {
    setState((previous) => previous.draft ? {
      ...previous, revision: previous.draft, dirty: false,
    } : previous);
  };

  return { ...current, apply, changeItem, changeEnrollmentMode, seedPreview };
};
