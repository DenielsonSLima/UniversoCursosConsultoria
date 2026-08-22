import type { TechnicalEnrollmentRequirement } from '../../shared/utils/technicalEnrollmentRequirements';

export interface CursosPageProps {
  alunoId?: string;
  initialCourseId?: string | null;
  onExitCourse?: () => void;
  onRequireTechnicalProfile?: () => void;
  onOpenEnrollment?: (courseId: string, turmaId: string) => void;
}

export interface EadProgress {
  startedAt: number;
  completedContentIds: string[];
  completedActivityIds: string[];
  completedVideoIds: string[];
  activityAnswers: Record<string, string>;
  quizAnswers?: Record<string, number>;
  quizScore?: number;
  completedAt?: number;
  certificateId?: string;
}

export interface EadProgressSummary {
  elapsedMinutes: number;
  minimumMinutes: number;
  progressPercent: number;
  allLessonsDone: boolean;
  allActivitiesDone: boolean;
  allVideosDone: boolean;
  minimumTimeDone: boolean;
  canTakeQuiz: boolean;
  quizScore?: string | number | null;
  quizPassed: boolean;
  quizMinimumScore?: number;
  questionsTotal: number;
  minimumQuestions: number;
  quizRetryBlocked: boolean;
  retryIntervalHours?: number;
  retryAvailableAt?: number | null;
  completedAt?: number | null;
  certificateId?: string | null;
}

export interface EadActivityAssessmentFeedback {
  submitted: boolean;
  selectedIndex: number | null;
  correctIndex: number | null;
  isCorrect: boolean | null;
}

export interface EadQuizQuestionFeedback {
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
}

export interface EadAssessmentFeedback {
  activities: Record<string, EadActivityAssessmentFeedback>;
  quiz: {
    submitted: boolean;
    score: number | null;
    passed: boolean;
    results: Record<string, EadQuizQuestionFeedback>;
  };
}

export interface EadProgressState {
  progress: EadProgress;
  summary: EadProgressSummary;
  assessmentFeedback?: EadAssessmentFeedback;
}

export type LearningTab = 'video' | 'aulas' | 'prova' | 'certificado';
export type CourseCatalogTab = 'ead' | 'live' | 'especializacao' | 'tecnico';
export type CourseContentTab = 'aulas' | 'atividades';

export interface TechnicalProfileGate {
  course: any;
  missingFields: TechnicalEnrollmentRequirement[];
}
