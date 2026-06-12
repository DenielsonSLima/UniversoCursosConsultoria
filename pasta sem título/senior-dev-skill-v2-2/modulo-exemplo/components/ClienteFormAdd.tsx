// ClienteFormAdd.tsx
//
// ✅ REGRA #1  — NÃO chama service diretamente. Recebe onSubmit como prop.
//               Quem chama o service é o hook useCriarCliente() na página.
// ✅ SRP       — Responsabilidade: coletar e validar dados. Só isso.
// ✅ Validação — No cliente (UX) E depois no servidor (Edge Function com Zod).
// ✅ Feedback  — Botão desabilitado durante envio. Campos bloqueados.

import { useState } from 'react';
import type { CreateClienteInput } from '../clientes.types';

interface ClienteFormAddProps {
  onSubmit: (input: CreateClienteInput) => void;
  carregando?: boolean;
}

// Validação local — espelha o schema Zod da Edge Function
function validar(dados: CreateClienteInput): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!dados.nome.trim()) erros.nome = 'Nome é obrigatório';
  if (dados.nome.trim().length < 2) erros.nome = 'Nome deve ter pelo menos 2 caracteres';
  if (!dados.email.trim()) erros.email = 'E-mail é obrigatório';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) erros.email = 'E-mail inválido';
  if (dados.telefone && !/^\+?[\d\s\-()]{8,}$/.test(dados.telefone)) {
    erros.telefone = 'Telefone inválido';
  }
  return erros;
}

export function ClienteFormAdd({ onSubmit, carregando = false }: ClienteFormAddProps) {
  const [campos, setCampos] = useState<CreateClienteInput>({ nome: '', email: '', telefone: '' });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tocado, setTocado] = useState<Record<string, boolean>>({});

  const atualizar = (campo: keyof CreateClienteInput, valor: string) => {
    const novo = { ...campos, [campo]: valor };
    setCampos(novo);
    // Revalida em tempo real após primeiro toque
    if (tocado[campo]) {
      setErros(validar(novo));
    }
  };

  const marcarTocado = (campo: string) => {
    setTocado((prev) => ({ ...prev, [campo]: true }));
    setErros(validar(campos));
  };

  const handleSubmit = () => {
    const todosErros = validar(campos);
    if (Object.keys(todosErros).length > 0) {
      setErros(todosErros);
      setTocado({ nome: true, email: true, telefone: true });
      return;
    }
    // ✅ Passa dados para a página — quem decide o que fazer é a página
    onSubmit({
      nome: campos.nome.trim(),
      email: campos.email.trim().toLowerCase(),
      telefone: campos.telefone?.trim() || undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Nome */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Nome <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={campos.nome}
          onChange={(e) => atualizar('nome', e.target.value)}
          onBlur={() => marcarTocado('nome')}
          disabled={carregando}
          placeholder="Nome completo"
          className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900
                     text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {erros.nome && <p className="text-xs text-red-500 mt-1">{erros.nome}</p>}
      </div>

      {/* E-mail */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          E-mail <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={campos.email}
          onChange={(e) => atualizar('email', e.target.value)}
          onBlur={() => marcarTocado('email')}
          disabled={carregando}
          placeholder="email@empresa.com"
          className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900
                     text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {erros.email && <p className="text-xs text-red-500 mt-1">{erros.email}</p>}
      </div>

      {/* Telefone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Telefone <span className="text-gray-400 font-normal">(opcional)</span>
        </label>
        <input
          type="tel"
          value={campos.telefone}
          onChange={(e) => atualizar('telefone', e.target.value)}
          onBlur={() => marcarTocado('telefone')}
          disabled={carregando}
          placeholder="(11) 99999-9999"
          className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-gray-900
                     text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500
                     disabled:opacity-60 disabled:cursor-not-allowed"
        />
        {erros.telefone && <p className="text-xs text-red-500 mt-1">{erros.telefone}</p>}
      </div>

      {/* Botão */}
      <button
        onClick={handleSubmit}
        disabled={carregando}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed
                   text-white font-medium py-2 px-4 rounded-md text-sm transition-colors mt-2"
      >
        {carregando ? 'Salvando...' : 'Criar Cliente'}
      </button>
    </div>
  );
}
