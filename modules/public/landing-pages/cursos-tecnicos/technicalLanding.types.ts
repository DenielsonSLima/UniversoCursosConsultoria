export type TechnicalLandingTemplateKey =
  | 'enfermagem'
  | 'seguranca-do-trabalho'
  | 'radiologia'
  | 'analises-clinicas'
  | 'saude-bucal'
  | 'default';

export type HighSchoolSituation = 'CURSANDO_2_ANO' | 'CURSANDO_3_ANO' | 'CONCLUIDO';
export type TechnicalPaymentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD';

export type TechnicalDocumentPhase = 'APOS_PAGAMENTO' | 'ANTES_ATIVACAO' | 'ANTES_ESTAGIO';

export interface TechnicalLandingDocument {
  key: string;
  label: string;
  description?: string;
  phase: TechnicalDocumentPhase;
  situations?: HighSchoolSituation[];
}

export interface TechnicalLandingConfig {
  templateKey: TechnicalLandingTemplateKey;
  eyebrow: string;
  titleComplement?: string;
  description: string;
  formTitle: string;
  formDescription: string;
  highlights: string[];
  documents: TechnicalLandingDocument[];
  documentationNotice?: string;
  accent: 'blue' | 'emerald' | 'cyan' | 'violet';
  marketingCampaign?: {
    promise?: string;
    heroImageUrl?: string;
    eligibility?: string;
  };
}

export interface TechnicalLandingCourse {
  id: string;
  name: string;
  description: string;
  area: string;
  workloadHours: number;
  durationMonths: number | null;
  imageUrl: string | null;
  landingTemplateKey?: string | null;
  paymentMethods: TechnicalPaymentMethod[];
}

export interface TechnicalLandingClass {
  id: string;
  courseId: string;
  name: string;
  code: string;
  shift: string;
  status: string;
  startDate: string | null;
  expectedEndDate: string | null;
  enrollmentStartDate: string | null;
  enrollmentEndDate: string | null;
  totalSeats: number;
  occupiedSeats: number;
  availableSeats: number;
  onlineEnrollmentAvailable: boolean;
  enrollmentFee: number;
  reEnrollmentFee: number;
  installments: number;
  installmentValue: number;
  punctualDiscount: number;
  punctualDiscountEnabled: boolean;
  punctualInstallmentValue: number;
  availabilityLabel: string;
  acceptsConcurrent: boolean;
  acceptsSubsequent: boolean;
  minimumHighSchoolGrade: 2 | 3;
}

export interface TechnicalLandingPolo {
  id: string;
  name: string;
  city: string;
  state: string;
  address: string | null;
  number: string | null;
  district: string | null;
}

export interface TechnicalLandingData {
  course: TechnicalLandingCourse;
  turma: TechnicalLandingClass;
  polo: TechnicalLandingPolo;
}

export interface TechnicalEnrollmentFormValues {
  highSchoolSituation: HighSchoolSituation | '';
  schoolName: string;
  completionYear: string;
  expectedCompletionYear: string;
  paymentMethod: TechnicalPaymentMethod | '';
  acceptedDeclaration: boolean;
}

export interface TechnicalEnrollmentPayload {
  turmaId: string;
  courseId: string;
  highSchoolSituation: HighSchoolSituation;
  schoolName: string;
  completionYear: string | null;
  expectedCompletionYear: string | null;
  paymentMethod: TechnicalPaymentMethod;
}

export interface TechnicalLandingEnrollmentController {
  isAuthenticated: boolean;
  isSubmitting?: boolean;
  onRequireAuthentication: () => void;
  onSubmit?: (payload: TechnicalEnrollmentPayload) => Promise<void> | void;
}

export interface TechnicalCourseLandingPageProps {
  data: TechnicalLandingData;
  enrollment: TechnicalLandingEnrollmentController;
}
