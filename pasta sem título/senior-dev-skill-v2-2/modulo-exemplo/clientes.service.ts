// clientes.service.ts
// ✅ Regra IDL: Service como objeto com funções (não classe com estado)
// ✅ Regra #7: Paginação sempre
// ✅ Regra #6: Não usa service_role — cliente com anon key
// ✅ Operações de escrita delegadas a Edge Functions

import { supabase } from '@/lib/supabase/client';
import type {
  Cliente,
  CreateClienteInput,
  UpdateClienteInput,
  GetClientesParams,
  PaginatedClientes,
} from './clientes.types';

const ITENS_POR_PAGINA = 50;

export const clienteService = {

  // ─── Leitura (direto no Supabase — RLS protege) ─────────────────────────

  async getAll(params: GetClientesParams): Promise<PaginatedClientes> {
    const { organizationId, pagina = 0, itensPorPagina = ITENS_POR_PAGINA, busca } = params;
    const from = pagina * itensPorPagina;
    const to = from + itensPorPagina - 1;

    let query = supabase
      .from('clientes')
      .select('*', { count: 'exact' })            // ✅ total para calcular páginas
      .eq('organization_id', organizationId)       // ✅ filtro explícito (dupla proteção)
      .order('nome')
      .range(from, to);                            // ✅ paginação sempre

    if (busca) {
      query = query.ilike('nome', `%${busca}%`);  // busca case-insensitive
    }

    const { data, error, count } = await query;

    if (error) throw new Error(error.message);

    return {
      data: data ?? [],
      total: count ?? 0,
      pagina,
      totalPaginas: Math.ceil((count ?? 0) / itensPorPagina),
    };
  },

  async getById(id: string): Promise<Cliente | null> {
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .eq('id', id)
      .single();

    if (error?.code === 'PGRST116') return null; // not found
    if (error) throw new Error(error.message);
    return data;
  },

  // ─── Escrita (via Edge Functions — valida JWT + Zod + regras) ───────────

  async create(input: CreateClienteInput): Promise<Cliente> {
    const { data, error } = await supabase.functions.invoke<Cliente>(
      'criar-cliente',
      { body: input }
    );
    if (error) throw error;
    if (!data) throw new Error('Nenhum dado retornado pela Edge Function');
    return data;
  },

  async update(id: string, input: UpdateClienteInput): Promise<Cliente> {
    const { data, error } = await supabase.functions.invoke<Cliente>(
      'atualizar-cliente',
      { body: { id, ...input } }
    );
    if (error) throw error;
    if (!data) throw new Error('Nenhum dado retornado pela Edge Function');
    return data;
  },

  async desativar(id: string): Promise<void> {
    const { error } = await supabase.functions.invoke(
      'desativar-cliente',
      { body: { id } }
    );
    if (error) throw error;
  },

};
