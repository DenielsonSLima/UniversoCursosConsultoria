import { supabase } from '../../../lib/supabase';
import {
  RELATIONSHIP_BIRTHDAY_LEGAL_BASIS,
  RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
  type RelationshipBirthdayPreference,
  type RelationshipPreferenceSurface,
} from '../../shared/constants/relationship-consent';

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const mapPreference = (value: unknown): RelationshipBirthdayPreference => {
  const row = asRecord(value);
  const configured = row.configured === true || row.decided === true;
  return {
    configured,
    // Alias temporário para clientes já publicados durante a troca de política.
    decided: configured,
    allowed: row.allowed === true,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
    policyVersion: typeof row.policyVersion === 'string'
      ? row.policyVersion
      : RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
    legalBasis: row.legalBasis === 'consentimento'
      ? 'consentimento'
      : row.legalBasis === RELATIONSHIP_BIRTHDAY_LEGAL_BASIS
        ? RELATIONSHIP_BIRTHDAY_LEGAL_BASIS
        : null,
    activationReason: typeof row.activationReason === 'string'
      ? row.activationReason
      : null,
    purpose: 'relationship_birthday',
    includesCommercialAdvertising: false,
    canOptOut: true,
  };
};

export const relationshipPreferenceService = {
  async getPreference(): Promise<RelationshipBirthdayPreference> {
    const { data, error } = await (supabase.rpc as any)(
      'aluno_push_relacionamento_preferencia_obter',
    );
    if (error) throw error;
    return mapPreference(data);
  },

  async ensureTermsDefault(
    surface: Extract<
      RelationshipPreferenceSurface,
      'public_signup_web' | 'public_signup_app' | 'student_first_access'
    >,
  ): Promise<RelationshipBirthdayPreference> {
    const { data, error } = await (supabase.rpc as any)(
      'aluno_push_relacionamento_preferencia_ativar_por_termos',
      { p_surface: surface },
    );
    if (error) throw error;
    return mapPreference(data);
  },

  async updatePreference(
    allowed: boolean,
    surface: RelationshipPreferenceSurface,
  ): Promise<RelationshipBirthdayPreference> {
    const { data, error } = await (supabase.rpc as any)(
      'aluno_push_relacionamento_preferencia_registrar',
      {
        p_allowed: allowed,
        p_surface: surface,
      },
    );
    if (error) throw error;
    return mapPreference(data);
  },
};
