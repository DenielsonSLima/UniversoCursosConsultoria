import { supabase } from '../../../lib/supabase';
import {
  RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
  type RelationshipBirthdayPreference,
  type RelationshipConsentSurface,
} from '../../shared/constants/relationship-consent';

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const mapPreference = (value: unknown): RelationshipBirthdayPreference => {
  const row = asRecord(value);
  return {
    decided: row.decided === true,
    allowed: row.allowed === true,
    updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null,
    policyVersion: typeof row.policyVersion === 'string'
      ? row.policyVersion
      : RELATIONSHIP_BIRTHDAY_POLICY_VERSION,
    purpose: 'relationship_birthday',
    includesCommercialAdvertising: false,
  };
};

export const relationshipConsentService = {
  async getPreference(): Promise<RelationshipBirthdayPreference> {
    const { data, error } = await (supabase.rpc as any)(
      'aluno_push_relacionamento_preferencia_obter',
    );
    if (error) throw error;
    return mapPreference(data);
  },

  async registerPreference(
    allowed: boolean,
    surface: RelationshipConsentSurface,
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
