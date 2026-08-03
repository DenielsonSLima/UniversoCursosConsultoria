import { supabase } from '../../../lib/supabase';
import type { PublicUnit } from './contact.types';

const mapPublicUnit = (row: any): PublicUnit => ({
  id: String(row.id),
  name: String(row.name || 'Unidade'),
  city: String(row.city || ''),
  state: String(row.state || ''),
  address: row.address || null,
  number: row.number || null,
  complement: row.complement || null,
  district: row.district || null,
  postalCode: row.postal_code || null,
  phone: row.phone || null,
  email: row.email || null,
  logoUrl: row.logo_url || null,
  isMatrix: row.is_matrix === true,
  supportHours: row.support_hours || null,
});

export const contactService = {
  async listPublicUnits(): Promise<PublicUnit[]> {
    const { data, error } = await supabase.rpc('list_public_units');
    if (error) throw error;
    return (Array.isArray(data) ? data : []).map(mapPublicUnit);
  },
};
