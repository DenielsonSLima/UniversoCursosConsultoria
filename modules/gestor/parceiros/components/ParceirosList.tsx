
// File: modules/gestor/parceiros/components/ParceirosList.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import PFCard from './cards/PFCard';
import PJCard from './cards/PJCard';
import AlunoCard from './cards/AlunoCard';
import ProfessorCard from './cards/ProfessorCard';
import { parceirosService } from '../parceiros.service';

interface ParceirosListProps {
  items: any[];
  isLoading: boolean;
  onSelectParceiro?: (parceiro: any) => void;
}

const ParceirosList: React.FC<ParceirosListProps> = ({ 
  items, 
  isLoading,
  onSelectParceiro 
}) => {
  const [page, setPage] = useState(1);

  // Reseta para a página 1 ao alterar a quantidade de itens (filtros)
  useEffect(() => {
    setPage(1);
  }, [items.length]);

  // Paginação simplificada 
  const itemsPerPage = 20;
  const totalPages = Math.ceil(items.length / itemsPerPage) || 1;
  const currPageItems = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const renderCard = (item: any) => {
    const handleSelect = () => onSelectParceiro && onSelectParceiro(item);
    
    switch (item.tipo) {
      case 'Aluno':
        return <AlunoCard key={item.id} data={item} onClick={handleSelect} />;
      case 'Professor':
        return <ProfessorCard key={item.id} data={item} onClick={handleSelect} />;
      case 'PJ':
        return <PJCard key={item.id} data={item} onClick={handleSelect} />;
      case 'PF':
      default:
        return <PFCard key={item.id} data={item} onClick={handleSelect} />;
    }
  };

  return (
    <div>
      {/* 
        Grid Configurado para:
        - Mobile: 1 coluna
        - Tablet: 2 colunas
        - Desktop Pequeno: 3 colunas
        - Desktop Grande (XL): 4 colunas
      */}
      {isLoading ? (
        <div className="py-20 text-center col-span-full">
          <RefreshCw className="animate-spin text-[#4169E1] mx-auto mb-4" size={36} />
          <p className="text-slate-500 font-medium">Buscando registros do banco de dados...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-12 animate-fadeIn w-full">
          {currPageItems.length > 0 ? (
            currPageItems.map((item) => renderCard(item))
          ) : (
            <div className="col-span-full py-10 flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-100 shadow-sm text-slate-500 w-full">
               <p className="font-medium text-center">Nenhum parceiro encontrado com os filtros selecionados.</p>
            </div>
          )}
        </div>
      )}

      {/* Paginação */}
      {items.length > 0 && (
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="mb-4 md:mb-0">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Exibindo <span className="text-[#001a33]">{(page - 1) * itemsPerPage + 1}-{Math.min(page * itemsPerPage, items.length)}</span> de <span className="text-[#001a33]">{items.length}</span> resultados
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-[#001a33] hover:text-white hover:border-[#001a33] disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-500"
          >
            <ChevronLeft size={18} />
          </button>
          
          <div className="flex gap-1 overflow-x-auto max-w-[200px] sm:max-w-none">
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1;
              return (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl text-xs font-bold transition-all shrink-0 ${
                  page === p 
                    ? 'bg-[#4169E1] text-white shadow-lg shadow-blue-500/30' 
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {p}
              </button>
              );
            })}
          </div>

          <button 
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 hover:bg-[#001a33] hover:text-white hover:border-[#001a33] disabled:opacity-30 disabled:cursor-not-allowed transition-all text-slate-500"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      )}
    </div>
  );
};

export default ParceirosList;
