export const RELATIONSHIP_BIRTHDAY_POLICY_VERSION = 'push-relationship-birthday-legitimate-interest-v2';
export const RELATIONSHIP_BIRTHDAY_LEGAL_BASIS = 'legitimo_interesse' as const;
export const RELATIONSHIP_BIRTHDAY_LIA_VERSION = 'lia-relationship-birthday-v1';

export type RelationshipBirthdayLegalBasis =
  | typeof RELATIONSHIP_BIRTHDAY_LEGAL_BASIS
  | 'consentimento'
  | null;

export type RelationshipPreferenceSurface =
  | 'public_signup_web'
  | 'public_signup_app'
  | 'student_first_access'
  | 'student_notification_preferences';

export type RelationshipBirthdayPreference = {
  configured: boolean;
  decided: boolean;
  allowed: boolean;
  updatedAt: string | null;
  policyVersion: string;
  legalBasis: RelationshipBirthdayLegalBasis;
  activationReason: string | null;
  purpose: 'relationship_birthday';
  includesCommercialAdvertising: false;
  canOptOut: true;
};
