// clientes.types.ts
// ✅ Regra IDL: Tipos separados em arquivo próprio
// ✅ Sem `any` — tipagem rigorosa
// ✅ Tipos de domínio separados de tipos de input/output

// ─── Tipos de Domínio ──────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  organization_id: string;
  nome: string;
  email: string;
  telefone: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export type StatusCliente = 'ativo' | 'inativo';

// ─── Tipos de Input (formulários e APIs) ──────────────────────────────────

export interface CreateClienteInput {
  nome: string;       // obrigatório
  email: string;      // obrigatório
  telefone?: string;  // opcional
}

export interface UpdateClienteInput {
  nome?: string;
  email?: string;
  telefone?: string;
  ativo?: boolean;
}

// ─── Tipos de Query ───────────────────────────────────────────────────────

export interface GetClientesParams {
  organizationId: string;
  pagina?: number;
  itensPorPagina?: number;
  busca?: string;
}

// ─── Tipos de Resposta ────────────────────────────────────────────────────

export interface PaginatedClientes {
  data: Cliente[];
  total: number;
  pagina: number;
  totalPaginas: number;
}
