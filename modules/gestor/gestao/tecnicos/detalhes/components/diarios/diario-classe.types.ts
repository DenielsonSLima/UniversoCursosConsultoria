import { DiarioTemplate } from '../../../../../cadastros/modelos-documentos/diarios/diarios.service';
import { DiarioAula, DiarioStudent } from './diario-classe.service';
import { DiarioExportMode } from './turma-diarios.types';

export type DiarioActiveTab = 'frequencia' | 'resultado' | 'conteudo' | 'observacoes';

export interface ActiveInstruments {
  p: boolean;
  ti: boolean;
  tg: boolean;
  s: boolean;
  cq: boolean;
  o: boolean;
}

export type AttendanceStatus = 'P' | 'F' | null;
export type AttendanceMap = Record<string, Record<string, AttendanceStatus>>;

export interface DiarioGradeResult {
  p: number | null;
  ti: number | null;
  tg: number | null;
  s: number | null;
  cq: number | null;
  o: number | null;
  rec: number | null;
  total_aulas: number;
  total_faltas: number;
  frequencia_percent: number | null;
  media_parcial: number | null;
  media_final: number | null;
  resultado_final: string;
}

export type GradesMap = Record<string, DiarioGradeResult>;

export interface DiarioStudentStats {
  faltas: number;
  frequencia: number | null;
  mediaParcial: number | null;
  mediaFinal: number | null;
  resultado: string;
}

export interface DiarioClasseProps {
  disciplina: any;
  moduloNome: string;
  turma: any;
  onBack: () => void;
  accessMode?: 'GESTOR' | 'PROFESSOR';
  initialExportMode?: DiarioExportMode;
  returnToListOnExportClose?: boolean;
}

export interface DiarioPrintDocumentProps {
  template: DiarioTemplate;
  turma: any;
  disciplina: any;
  moduloNome: string;
  students: DiarioStudent[];
  aulas: DiarioAula[];
  attendanceMap: AttendanceMap;
  gradesMap: GradesMap;
  praticasMap: Record<string, string>;
  observacoes: string;
  activeInstruments?: ActiveInstruments;
  watermark?: any;
  diretorSigUrl?: string | null;
  secretarioSigUrl?: string | null;
  exportMode?: DiarioExportMode;
}
