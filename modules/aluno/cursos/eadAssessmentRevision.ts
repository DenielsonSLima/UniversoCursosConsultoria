import type { EadProgressState } from './cursosPage.types';

export const getAvailableRevisionLessons = (catalogConfig: any, revision?: EadProgressState['assessmentRevision']) => (
  revision?.available && catalogConfig?.assessmentRevision === revision.available
    && Array.isArray(catalogConfig.conteudos) ? catalogConfig.conteudos : []
);

export const getEffectiveEadConfig = (catalogConfig: any, state?: EadProgressState) => {
  if (state?.assessmentRevision) return state.effectiveEadConfig || null;
  return catalogConfig || {};
};

export const canStartEadRevision = (state?: EadProgressState) => (
  state?.assessmentRevision?.canUpgrade === true
  && typeof state.assessmentRevision.available === 'string'
  && state.assessmentRevision.available.length > 0
  && state.assessmentRevision.available !== state.assessmentRevision.current
  && state.summary.quizPassed === false
  && !state.progress.completedAt
  && !state.progress.certificateId
);
