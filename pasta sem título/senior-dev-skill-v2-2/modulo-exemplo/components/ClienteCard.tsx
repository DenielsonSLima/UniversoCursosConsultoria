// ClienteCard.tsx
//
// ✅ REGRA #1  — Componente NÃO faz chamadas de API. Recebe tudo via props.
// ✅ SRP       — Responsabilidade única: exibir um cliente + ações de callback
// ✅ Tipagem   — Sem `any`. Props explícitas e obrigatórias/opcionais definidas.
// ✅ UI "burro"— Não importa stores, services ou hooks de negócio.

import type { Cliente } from '../clientes.types';

interface ClienteCardProps {
  cliente: Cliente;
  onEditar?: (cliente: Cliente) => void;
  onDesativar?: (id: string) => void;
}

export function ClienteCard({ cliente, onEditar, onDesativar }: ClienteCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
      {/* Informações */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{cliente.nome}</span>
          {/* Badge de status */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              cliente.ativo
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {cliente.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        <p className="text-sm text-gray-500 truncate mt-0.5">{cliente.email}</p>
        {cliente.telefone && (
          <p className="text-sm text-gray-400 mt-0.5">{cliente.telefone}</p>
        )}
      </div>

      {/* Ações — callbacks propagados da página, não chamadas diretas */}
      <div className="flex items-center gap-2 shrink-0">
        {onEditar && (
          <button
            onClick={() => onEditar(cliente)}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium px-3 py-1 rounded hover:bg-blue-50 transition-colors"
          >
            Editar
          </button>
        )}
        {onDesativar && cliente.ativo && (
          <button
            onClick={() => onDesativar(cliente.id)}
            className="text-sm text-red-500 hover:text-red-700 font-medium px-3 py-1 rounded hover:bg-red-50 transition-colors"
          >
            Desativar
          </button>
        )}
      </div>
    </div>
  );
}
