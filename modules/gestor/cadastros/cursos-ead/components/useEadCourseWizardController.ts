import type { EadCourseWizardControllerProps } from './eadCourseWizard.types';
import { useEadCourseWizardActions } from './useEadCourseWizardActions';
import { useEadCourseWizardDerived } from './useEadCourseWizardDerived';
import { useEadCourseWizardInitialization } from './useEadCourseWizardInitialization';
import { useEadCourseWizardPersistence } from './useEadCourseWizardPersistence';
import { useEadCourseWizardState } from './useEadCourseWizardState';

export const useEadCourseWizardController = ({
  curso,
  onSave,
}: EadCourseWizardControllerProps) => {
  const state = useEadCourseWizardState();

  useEadCourseWizardInitialization(curso, state);

  const derived = useEadCourseWizardDerived(state);
  const actions = useEadCourseWizardActions(state);
  const persistence = useEadCourseWizardPersistence({ curso, onSave, state });

  return {
    curso,
    ...state,
    ...derived,
    ...actions,
    ...persistence,
  };
};
