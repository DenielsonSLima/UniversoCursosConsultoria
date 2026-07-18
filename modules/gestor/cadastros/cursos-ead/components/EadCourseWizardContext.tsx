import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { useEadCourseWizardController } from './useEadCourseWizardController';

export type EadCourseWizardContextValue = ReturnType<typeof useEadCourseWizardController>;

const EadCourseWizardContext = createContext<EadCourseWizardContextValue | null>(null);

export const EadCourseWizardProvider = ({
  children,
  value,
}: {
  children: ReactNode;
  value: EadCourseWizardContextValue;
}) => (
  <EadCourseWizardContext.Provider value={value}>
    {children}
  </EadCourseWizardContext.Provider>
);

export const useEadCourseWizardContext = () => {
  const contextValue = useContext(EadCourseWizardContext);
  if (!contextValue) {
    throw new Error('useEadCourseWizardContext deve ser usado dentro de EadCourseWizardProvider.');
  }
  return contextValue;
};
