import type React from 'react';
import type { Scope, TargetAudience } from '../biblioteca.types';

export type WizardStep = 0 | 1 | 2 | 3;
export type AccessMode = 'PUBLICO' | 'ALUNOS' | 'PROFESSORES' | 'CURSOS' | 'TURMAS' | 'INTERNO' | 'PRIVADO';
export type AvailabilityMode = 'FREE' | 'PERIOD';

interface UploadFormData {
  title: string;
  description: string;
  targetAudience: TargetAudience;
  scope: Scope;
  poloId: string;
  file: File | null;
}

export interface UploadWizardStepsProps {
  currentStep: WizardStep;
  formData: UploadFormData;
  setFormData: React.Dispatch<React.SetStateAction<UploadFormData>>;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  formatSizeMB: (bytes: number) => string;
  accessOptions: Array<{ mode: AccessMode; title: string; description: string; icon: React.ElementType }>;
  accessMode: AccessMode;
  setMode: (mode: AccessMode) => void;
  isProfessorUpload: boolean;
  polos: any[];
  getPoloMeta: (polo: any) => string;
  selectedCursos: string[];
  setSelectedCursos: React.Dispatch<React.SetStateAction<string[]>>;
  searchCurso: string;
  setSearchCurso: React.Dispatch<React.SetStateAction<string>>;
  filteredCursos: any[];
  toggleCurso: (id: string) => void;
  selectedTurmas: string[];
  setSelectedTurmas: React.Dispatch<React.SetStateAction<string[]>>;
  searchTurma: string;
  setSearchTurma: React.Dispatch<React.SetStateAction<string>>;
  turmas: any[];
  filteredTurmas: any[];
  toggleTurma: (id: string) => void;
  availabilityMode: AvailabilityMode;
  setAvailability: (mode: AvailabilityMode) => void;
  liberacaoData: string;
  setLiberacaoData: React.Dispatch<React.SetStateAction<string>>;
  liberacaoDataFim: string;
  setLiberacaoDataFim: React.Dispatch<React.SetStateAction<string>>;
  audienceLabels: Record<TargetAudience, string>;
  selectedPoloName: string;
  selectedPolo: any;
  getPeriodEndLabel: () => string;
  getPeriodDays: () => number | null;
  selectedCursoNames: string[];
  selectedTurmaNames: string[];
  preview: React.ReactNode;
}
