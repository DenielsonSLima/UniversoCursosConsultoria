import { useCallback, useEffect, useState } from 'react';
import type {
  CicloFinanceiroTecnicoManualPreview,
  CicloFinanceiroTecnicoManualRevisao,
  CicloFinanceiroTecnicoManualRevisaoItem,
  CicloManualModoMatricula,
} from '../matricula-tecnica-ciclo-manual.types';
import {
  changeCicloManualEnrollmentMode,
  changeCicloManualRevisionItem,
  cicloManualRevisionForEnrollmentMode,
  cicloManualScheduleFromPreview,
  type CicloManualScheduleItem,
} from '../ciclo-manual-due-schedule';
import { revisionFromPreview } from '../manual-technical-cycle-confirmation';

interface RevisionState {
  contextKey: string;
  revision: CicloFinanceiroTecnicoManualRevisao | null;
  draft: CicloFinanceiroTecnicoManualRevisao | null;
  schedule: CicloManualScheduleItem[];
  originDate: string | null;
  dirty: boolean;
}

const initialState = (
  contextKey: string,
  enrollmentMode: CicloManualModoMatricula | null,
): RevisionState => {
  const revision = enrollmentMode
    ? cicloManualRevisionForEnrollmentMode(enrollmentMode)
    : null;
  return {
    contextKey,
    revision,
    draft: revision,
    schedule: [],
    originDate: null,
    dirty: false,
  };
};

export const useCicloManualRevision = (
  contextKey: string,
  enrollmentMode: CicloManualModoMatricula | null = null,
) => {
  const [state, setState] = useState(() => initialState(contextKey, enrollmentMode));
  const current = state.contextKey === contextKey
    ? state
    : initialState(contextKey, enrollmentMode);

  useEffect(() => {
    setState((previous) => previous.contextKey === contextKey
      ? previous
      : initialState(contextKey, enrollmentMode));
  }, [contextKey, enrollmentMode]);

  const seedPreview = useCallback((preview: CicloFinanceiroTecnicoManualPreview | undefined) => {
    if (!preview) return;
    setState((previous) => {
      const existing = previous.contextKey === contextKey
        ? previous
        : initialState(contextKey, enrollmentMode);
      if (existing.dirty) return existing;
      const canonical = revisionFromPreview(preview);
      const canonicalKeys = new Set(canonical.itens.map((item) => item.chave));
      return {
        ...existing,
        schedule: cicloManualScheduleFromPreview(preview),
        originDate: preview.dataOrigem,
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
  }, [contextKey, enrollmentMode]);

  const changeItem = (
    key: string,
    field: keyof Omit<CicloFinanceiroTecnicoManualRevisaoItem, 'chave'>,
    value: string,
  ) => {
    setState((previous) => previous.draft ? {
      ...previous,
      dirty: true,
      draft: changeCicloManualRevisionItem(previous.draft, previous.schedule, key, field, value),
    } : previous);
  };

  const changeEnrollmentMode = (modoMatricula: CicloManualModoMatricula) => {
    setState((previous) => previous.draft ? {
      ...previous,
      dirty: true,
      draft: changeCicloManualEnrollmentMode(
        previous.draft,
        previous.schedule,
        modoMatricula,
        previous.originDate,
      ),
    } : previous);
  };

  const apply = () => {
    setState((previous) => previous.draft ? {
      ...previous, revision: previous.draft, dirty: false,
    } : previous);
  };

  return { ...current, apply, changeItem, changeEnrollmentMode, seedPreview };
};
