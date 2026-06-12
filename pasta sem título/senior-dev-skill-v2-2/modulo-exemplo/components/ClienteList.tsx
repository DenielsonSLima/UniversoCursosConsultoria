// ClienteList.tsx
//
// ✅ REGRA #1  — Não faz fetch. Recebe `clientes` como prop da página.
// ✅ SRP       — Renderiza lista + controle de paginação. Só isso.
// ✅ Paginação — Props explícitas de pagina/totalPaginas para navegação.
// ✅ Callbacks — onEditar e onDesativar vêm da página que sabe o que fazer.

import { ClienteCard } from './ClienteCard';
import type { Cliente } from '../clientes.types';

interface ClienteListProps {
  clientes: Cliente[];
  total: number;
  pagina: number;
  totalPaginas: number;
  onPaginaChange: (pagina: number) => void;
  onEditar?: (cliente: Cliente) => void;
  onDesativar?: (id: string) => void;
}

export function ClienteList({
  clientes,
  total,
  pagina,
  totalPaginas,
  onPaginaChange,
  onEditar,
  onDesativar,
}: ClienteListProps) {
  return (
    <div>
      {/* Contador */}
      <p className="text-sm text-gray-500 mb-3">
        {total} {total === 1 ? 'cliente encontrado' : 'clientes encontrados'}
      </p>

      {/* Lista */}
      <div className="flex flex-col gap-2">
        {clientes.map((cliente) => (
          <ClienteCard
            key={cliente.id}
            cliente={cliente}
            onEditar={onEditar}
            onDesativar={onDesativar}
          />
        ))}
      </div>

      {/* Paginação — só aparece se houver mais de 1 página */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-6">
          <button
            onClick={() => onPaginaChange(pagina - 1)}
            disabled={pagina === 0}
            className="px-4 py-2 text-sm rounded border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            ← Anterior
          </button>

          <span className="text-sm text-gray-500">
            Página {pagina + 1} de {totalPaginas}
          </span>

          <button
            onClick={() => onPaginaChange(pagina + 1)}
            disabled={pagina >= totalPaginas - 1}
            className="px-4 py-2 text-sm rounded border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}
