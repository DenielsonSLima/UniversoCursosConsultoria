// File: modules/gestor/financeiro/despesas/components/CategoriaFinanceiraInlineModal.tsx
// Mini-modal inline para criar nova categoria financeira sem sair da tela

import React, { useState, useRef, useEffect } from 'react';
import { X, Loader2, Check } from 'lucide-react';
import { CategoriaFinanceiraTipo } from '../despesas.queryKeys';
import { useCreateCategoriaFinanceiraMutation } from '../hooks/useCategoriasFinanceirasQuery';

const toUpper = (value: string) => value.toLocaleUpperCase('pt-BR');

interface CategoriaFinanceiraInlineModalProps {
  tipo: CategoriaFinanceiraTipo;
  onCriada: (id: string, nome: string) => void;
  onClose: () => void;
  accent?: 'rose' | 'emerald';
}

const CategoriaFinanceiraInlineModal: React.FC<CategoriaFinanceiraInlineModalProps> = ({
  tipo,
  onCriada,
  onClose,
  accent = 'rose',
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
      const cat = await createMutation.mutateAsync({ nome: toUpper(nome.trim()), tipo });
      onCriada(cat.id, cat.nome);
    } catch {
      // erro tratado pela mutation
    }
  };

  const tipoLabel: Record<CategoriaFinanceiraTipo, string> = {
    DESPESA_FIXA: 'FIXA',
    DESPESA_VARIAVEL: 'VARIÁVEL',
    OUTRO_DEBITO: 'OUTRO DÉBITO',
    OUTRO_CREDITO: 'OUTRO CRÉDITO',
  };
  const accentClasses = accent === 'emerald'
    ? {
        title: 'text-emerald-600',
        focus: 'focus:ring-emerald-500',
        button: 'bg-emerald-600 hover:bg-emerald-700',
      }
    : {
        title: 'text-rose-600',
        focus: 'focus:ring-rose-500',
        button: 'bg-rose-600 hover:bg-rose-700',
      };

  return (
    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 animate-fadeIn">
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-black uppercase tracking-wider ${accentClasses.title}`}>
          NOVA CATEGORIA {tipoLabel[tipo]}
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
          placeholder="NOME DA CATEGORIA..."
          value={nome}
          onChange={(e) => setNome(toUpper(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') onClose();
          }}
          className={`flex-1 px-3 py-2 text-sm uppercase bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 outline-none transition-all ${accentClasses.focus}`}
        />
        <button
          onClick={handleSave}
          disabled={!nome.trim() || createMutation.isPending}
          className={`flex items-center gap-1.5 px-4 py-2 text-white rounded-xl text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${accentClasses.button}`}
        >
          {createMutation.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Check size={14} />
          )}
          SALVAR
        </button>
      </div>

      {createMutation.isError && (
        <p className="mt-2 text-xs text-red-500 font-medium">
          ERRO AO CRIAR CATEGORIA. TENTE NOVAMENTE.
        </p>
      )}
    </div>
  );
};

export default CategoriaFinanceiraInlineModal;
