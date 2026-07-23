import type { GatewayEnvironment, GatewayPaymentMethod } from "../router.ts";

export type CheckoutMutableState = {
  checkoutMatriculaId: string | null;
  checkoutReceivableId: string | null;
  paymentCreated: boolean;
};

export type CheckoutContext = {
  admin: any;
  supabaseUrl: string;
  json: (body: unknown, status?: number) => Response;
  state: CheckoutMutableState;
  course: any;
  aluno: any;
  turma: any;
  matricula: any;
  environment: GatewayEnvironment;
  notificationsEnabled: boolean;
  isEadCheckout: boolean;
  keepTechnicalDocumentationPending: boolean;
  hasExplicitPaymentSelection: boolean;
  cpfCnpj: string;
  gatewayDocument: string;
  dataVencimento: string;
  charge: any;
  receivableFeeFields: Record<string, number | null | undefined>;
  gatewayPaymentMethodForCharge: GatewayPaymentMethod;
  gatewayRoute: {
    providerCode: string;
    credentialId: string | null;
    enabled: boolean;
    environment?: "sandbox" | "production";
  };
  technicalSchoolSnapshot: Record<string, unknown>;
};
