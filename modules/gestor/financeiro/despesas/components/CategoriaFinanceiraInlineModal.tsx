// File: modules/gestor/financeiro/despesas/components/CategoriaFinanceiraInlineModal.tsx
// Mini-modal inline para criar nova categoria financeira sem sair da tela

import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Loader2, Check } from 'lucide-react';
import { DespesaTipo } from '../despesas.queryKeys';
import { useCreateCategoriaFinanceiraMutation } from '../hooks/useCategoriasFinanceirasQuery';

interface CategoriaFinanceiraInlineModalProps {
  tipo: DespesaTipo;
  onCriada: (id: string, nome: string) => void;
  onClose: () => void;
}

const CategoriaFinanceiraInlineModal: React.FC<CategoriaFinanceiraInlineModalProps> = ({
  tipo,
  onCriada,
  onClose,
}) => {
  const [nome, setNome] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateCategoriaFinanceiraMutation();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = async () => {
    if (!nome.trim()) return;
    try {
      const cat = await createMutation.mutateAsync({ nome: nome.trim(), tipo });
      onCriada(cat.id, cat.nome);
    } catch {
      // erro tratado pela mutation
    }
  };

  const tipoLabel: Record<DespesaTipo, string> = {
    DESPESA_FIXA: 'Fixa',
    DESPESA_VARIAVEL: 'Variável',
    OUTRO_DEBITO: 'Outro Débito',
  };

  return (
    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-fadeIn">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-black uppercase tracking-wider text-rose-600">
          Nova categoria {tipoLabel[tipo]}
        </span>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          placeholder="Nome da categoria..."
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') onClose();
          }}
          className="flex-1 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-rose-500 outline-none transition-all"
        />
        <button
          onClick={handleSave}
          disabled={!nome.trim() || createMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          Salvar
        </button>
      </div>

      {createMutation.isError && (
        <p className="mt-2 text-xs text-red-500 font-medium">
          Erro ao criar categoria. Tente novamente.
        </p>
      )}
    </div>
  );
};

export default CategoriaFinanceiraInlineModal;
