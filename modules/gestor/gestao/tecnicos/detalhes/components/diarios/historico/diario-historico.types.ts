export interface SourceReference {
  sha256?: string;
  part?: string;
  locator?: string;
}

export interface HistoricalField {
  raw?: unknown;
  value?: unknown;
  declaredDate?: string;
  sourceRefs?: SourceReference[];
  review?: { state?: string; codes?: string[]; alternatives?: unknown[] };
}

export interface HistoricalGrade {
  columnOrdinal?: number;
  category?: HistoricalField;
  value?: HistoricalField;
}

export type HistoricalResults = Partial<Record<
  'partial' | 'final' | 'recovery' | 'frequency' | 'absences' | 'outcome', HistoricalField
>>;

export interface HistoricalGradeRow {
  sourceKey: string;
  grades: HistoricalGrade[];
  reportedResults?: HistoricalResults;
  review?: { state?: string };
}

export interface HistoricalLesson {
  id: string;
  sourceKey: string;
  date: string | null;
  dateField?: HistoricalField;
  hours: number | null;
  hoursState: string;
  hoursField?: HistoricalField;
  content: string | null;
  practice: string | null;
  contentField?: HistoricalField;
  practiceField?: HistoricalField;
}

export interface HistoricalStudent {
  id: string;
  matriculaId: string;
  name: string;
  enrollmentStatus: string;
  grades: HistoricalGrade[] | null;
  gradeRows?: HistoricalGradeRow[] | null;
  reportedResults: HistoricalResults | null;
  reportedAttendanceTotals?: HistoricalField[];
  partial: number | null;
  final: number | null;
  recovery: number | null;
  gradeState: string;
  resultState?: string;
  frequency: number | null;
  frequencyState: string;
  attendance: Array<{ lessonId: string; status: string | null; state: string; source?: HistoricalField }>;
}

export interface HistoricalIssue {
  issueKey?: string;
  code?: string;
  message?: string;
  sourceRefs?: SourceReference[];
  sourceDetail?: unknown;
}

export interface DiarioHistorico {
  id: string;
  sourceName: string;
  sourceSha256: string;
  importedAt: string;
  readOnly: true;
  officialHours: number | null;
  officialClassHours: number | null;
  reportedClassHours: number | null;
  hoursState: string;
  studentsCount: number;
  unresolvedCount: number;
  lessonsCount: number;
  attendanceCount: number;
  gradesConfirmed: number;
  lessons: HistoricalLesson[];
  students: HistoricalStudent[];
  unresolvedStudents: Array<{ sourcePersonKey: string; sourceNames: HistoricalField[]; identity?: unknown }>;
  issues: HistoricalIssue[];
  metadata?: Partial<Record<'course' | 'sourceModule' | 'sourceThematicArea' | 'sourceDiscipline'
    | 'sourceClass' | 'sourceWorkloadDeclarations' | 'submission' | 'assessmentLegend'
    | 'closure' | 'observations', HistoricalField[]>>;
  workloadReview?: { state?: string; codes?: string[] };
}
