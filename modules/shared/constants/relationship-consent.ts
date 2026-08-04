export const RELATIONSHIP_BIRTHDAY_POLICY_VERSION = 'push-relationship-birthday-v1';

export type RelationshipConsentSurface =
  | 'public_signup_web'
  | 'public_signup_app'
  | 'student_first_access'
  | 'student_notification_preferences';

export type RelationshipBirthdayPreference = {
  decided: boolean;
  allowed: boolean;
  updatedAt: string | null;
  policyVersion: string;
  purpose: 'relationship_birthday';
  includesCommercialAdvertising: false;
};
