import type { Curso } from '../../cadastros.types';

export interface EadCourseWizardProps {
  curso?: Curso | null;
  onBack: () => void;
  onSave: () => void;
}

export type EadCourseWizardControllerProps = Pick<EadCourseWizardProps, 'curso' | 'onSave'>;
