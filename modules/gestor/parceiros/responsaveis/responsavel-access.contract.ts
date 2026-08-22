export type ResponsavelAccessStatusValue =
  | 'confirmed'
  | 'pending'
  | 'no_auth_user'
  | 'no_email'
  | string;

export interface ResponsavelAccessStatus {
  responsavelLegalId: string;
  status: ResponsavelAccessStatusValue;
  authUserExists?: boolean;
  emailConfirmed?: boolean;
  emailValidatedByManager?: boolean;
  temporaryPasswordPending?: boolean;
  temporaryPasswordAllowed?: boolean;
  requiresPasswordChange?: boolean;
  termsAccepted?: boolean;
  currentTermsVersion: string | null;
  firstAccessPending?: boolean;
}

export interface ResponsavelAccessPreparationResult {
  success: boolean;
  action?: 'ensure-responsavel-access';
  userId?: string | null;
  inviteSent?: boolean;
  profileLinked?: boolean;
  profileLinkState: 'linked' | 'already_linked' | 'not_eligible' | string | null;
  message: string | null;
}

export interface ResponsavelAccessResendResult {
  success: boolean;
  action?: 'resend-responsavel-access';
  userId?: string | null;
  recoveryEmailSent?: boolean;
  requestFinalized: boolean;
  profileLinkState: string | null;
  message: string | null;
}

export interface ResponsavelEmailConfirmationResult {
  success: boolean;
  action?: 'confirm-responsavel-email';
  userId?: string | null;
  emailConfirmed: boolean;
  emailValidatedByManager: boolean;
  message: string | null;
}

export interface ResponsavelTemporaryPasswordResult {
  success: boolean;
  action?: 'issue-responsavel-temporary-password';
  userId?: string | null;
  emailConfirmed: boolean;
  emailValidatedByManager: boolean;
  temporaryPassword: string;
  message: string | null;
}
