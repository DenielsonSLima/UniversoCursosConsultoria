import type {
  GatewayEnvironment,
  GatewayPaymentMethod,
  GatewayProviderCode,
} from "../router.ts";

export type { GatewayEnvironment, GatewayPaymentMethod, GatewayProviderCode };

export type CheckoutRoute = {
  providerCode: GatewayProviderCode;
  credentialId: string | null;
  enabled: boolean;
  environment?: GatewayEnvironment;
};

export type CheckoutBody = Record<string, unknown>;

export type EadCharge = {
  method: GatewayPaymentMethod;
  installmentCount: number;
  value: number;
  feeValue: number;
  netValue: number;
  description: string;
  dueDate: string;
};

export type CheckoutRuntime = {
  req: Request;
  bodyText: string;
  body: CheckoutBody;
  admin: any;
  supabaseUrl: string;
  corsHeaders: Record<string, string>;
};

export type EadCheckoutContext = CheckoutRuntime & {
  environment: GatewayEnvironment;
  course: any;
  aluno: any;
  turma: any;
  matricula: any;
  charge: EadCharge;
  route: CheckoutRoute;
};
