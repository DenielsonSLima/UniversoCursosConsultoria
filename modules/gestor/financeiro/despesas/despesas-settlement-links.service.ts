import { supabase } from '../../../../lib/supabase';

type SettlementLink = { despesa_lancamento_id: string; convenio_mes_id: string; convenio_id: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Preserve specialized routing for direct-table/legacy reads without relying on convenio RLS. */
export async function enrichExpenseSettlementLinks(rows: any[]) {
  const ids = [...new Set<string>(rows.filter(row => !row.is_rateio_derivado)
    .map(row => row.despesa_lancamento_id ?? row.id).filter(Boolean))];
  const links = new Map<string, SettlementLink>();
  for (let offset = 0; offset < ids.length; offset += 500) {
    const batch = ids.slice(offset, offset + 500);
    const { data, error } = await supabase.rpc('get_expense_settlement_links_secure', { p_expense_ids: batch });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('Não foi possível conferir os vínculos das despesas. Atualize a lista.');
    for (const link of data) {
      if (!link || !batch.includes(link.despesa_lancamento_id) || !uuid.test(link.convenio_mes_id || '')
        || !uuid.test(link.convenio_id || '') || links.has(link.despesa_lancamento_id)) {
        throw new Error('Os vínculos das despesas retornaram dados inválidos. Atualize a lista.');
      }
      links.set(link.despesa_lancamento_id, link);
    }
  }
  return rows.map(row => {
    const link = links.get(row.despesa_lancamento_id ?? row.id);
    return { ...row, convenio_mes_id: link?.convenio_mes_id ?? null, convenio_id: link?.convenio_id ?? null };
  });
}
