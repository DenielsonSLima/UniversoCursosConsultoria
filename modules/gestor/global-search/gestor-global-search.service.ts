import { supabase } from '../../../lib/supabase';
import { buildGlobalSearchResultKey } from './gestor-global-search.model';
import {
  GESTOR_GLOBAL_SEARCH_LIMIT,
  type GestorGlobalSearchEntityType,
  type GestorGlobalSearchResult,
} from './gestor-global-search.types';

interface GestorGlobalSearchRpcRow {
  partner_id?: string;
  entity_type?: GestorGlobalSearchEntityType;
  entity_name?: string;
  document_number?: string | null;
  entity_status?: string | null;
  photo_url?: string | null;
  polo_id?: string | null;
  polo_name?: string | null;
  polo_city?: string | null;
  polo_state?: string | null;
  class_id?: string | null;
  class_name?: string | null;
  class_code?: string | null;
  other_classes?: number | string | null;
}

const mapSearchResult = (row: GestorGlobalSearchRpcRow): GestorGlobalSearchResult => {
  const partnerId = String(row.partner_id || '');
  const poloId = row.polo_id || null;
  return {
    key: buildGlobalSearchResultKey(partnerId, poloId),
    partnerId,
    entityType: row.entity_type || 'PF',
    name: String(row.entity_name || 'Cadastro sem nome'),
    document: row.document_number || null,
    status: String(row.entity_status || 'ATIVO'),
    photoUrl: row.photo_url || null,
    poloId,
    poloName: row.polo_name || null,
    poloCity: row.polo_city || null,
    poloState: row.polo_state || null,
    classId: row.class_id || null,
    className: row.class_name || null,
    classCode: row.class_code || null,
    otherClasses: Math.max(0, Number(row.other_classes || 0)),
  };
};

export const gestorGlobalSearchService = {
  async search(term: string, signal?: AbortSignal): Promise<GestorGlobalSearchResult[]> {
    let request = supabase.rpc('search_gestor_global_entities_secure', {
      p_search: term,
      p_limit: GESTOR_GLOBAL_SEARCH_LIMIT,
    });
    if (signal) request = request.abortSignal(signal);

    const { data, error } = await request;
    if (error) throw error;
    return ((data || []) as GestorGlobalSearchRpcRow[])
      .map(mapSearchResult)
      .filter((result) => result.partnerId);
  },
};
