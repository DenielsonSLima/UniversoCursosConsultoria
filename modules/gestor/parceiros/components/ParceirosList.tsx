
// File: modules/gestor/parceiros/components/ParceirosList.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import PFCard from './cards/PFCard';
import PJCard from './cards/PJCard';
import AlunoCard from './cards/AlunoCard';
import ProfessorCard from './cards/ProfessorCard';
import { parceirosService } from '../parceiros.service';

interface ParceirosListProps {
  activeTab: 'todos' | 'professores' | 'alunos' | 'pj' | 'pf';
  searchTerm?: string;
  statusFilter?: string;
  cursoFilter?: string;
  turmaFilter?: string;
  onSelectParceiro?: (parceiro: any) => void;
}

const ParceirosList: React.FC<ParceirosListProps> = ({ 
  activeTab, 
  searchTerm = '', 
  statusFilter = 'todos',
  cursoFilter = 'todos',
  turmaFilter = 'todas',
  onSelectParceiro 
}) => {
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Busca dados reais do banco de dados baseados na aba ativa
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await parceirosService.getAll(activeTab);
        setAllItems(data);
        setPage(1); // Reseta para pagina 1 ao trocar de aba
      } catch (err) {
        console.error('Erro ao buscar parceiros do banco:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [activeTab]);

  // Aplicar filtros
  const items = useMemo(() => {
    return allItems.filter(item => {
      // 1. Filtro de Status
      if (statusFilter !== 'todos' && item.status !== statusFilter) {
        return false;
      }
      // 2. Filtro de Buscas
      if (searchTerm) {
        const lowerTerm = searchTerm.toLowerCase();
        const contentStr = `${item.nome} ${item.cpf || ''} ${item.cnpj || ''} ${item.cidade || ''}`.toLowerCase();
        if (!contentStr.includes(lowerTerm)) {
          return false;
        }
      }
      // 3. Filtro de Curso (apenas alunos e professores)
      if (cursoFilter !== 'todos') {
        if (item.tipo !== 'Aluno' && item.tipo !== 'Professor') {
          return false;
        }
        if (item.cursoId !== cursoFilter) {
          return false;
        }
      }
      // 4. Filtro de Turma (apenas alunos e professores)
      if (turmaFilter !== 'todas') {
        if (item.tipo !== 'Aluno' && item.tipo !== 'Professor') {
          return false; 
        }
        if (item.turmaId !== turmaFilter) {
          return false;
        }
      }
      return true;
    });
  }, [allItems, searchTerm, statusFilter, cursoFilter, turmaFilter]);

  // Paginação simplificada 
  const itemsPerPage = 20;
  const totalPages = Math.ceil(items.length / itemsPerPage) || 1;
  const currPageItems = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const renderCard = (item: any) => {
    const handleSelect = () => onSelectParceiro && onSelectParceiro(item);
    
    switch (activeTab) {
      case 'alunos':
        return <AlunoCard key={item.id} data={item} onClick={handleSelect} />;
      case 'professores':
        return <ProfessorCard key={item.id} data={item} onClick={handleSelect} />;
      case 'pj':
        return <PJCard key={item.id} data={item} onClick={handleSelect} />;
      case 'pf':
        return <PFCard key={item.id} data={item} onClick={handleSelect} />;
      default:
        // Render based on item.tipo
        if (item.tipo === 'Aluno') return <AlunoCard key={item.id} data={item} onClick={handleSelect} />;
        if (item.tipo === 'Professor') return <ProfessorCard key={item.id} data={item} onClick={handleSelect} />;
        if (item.tipo === 'PJ') return <PJCard key={item.id} data={item} onClick={handleSelect} />;
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
      {loading ? (
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
