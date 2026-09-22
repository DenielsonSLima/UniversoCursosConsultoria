import React, { useMemo, useState } from 'react';
import { CreditCard, Handshake, Search, Settings, User } from 'lucide-react';

const MOCK_SEARCH_DATA = [
  { id: 1, type: 'student', title: 'Ana Clara Souza', subtitle: 'Enfermagem - Matutino', module: 'cadastros-alunos' },
  { id: 2, type: 'student', title: 'João Pedro Alves', subtitle: 'Radiologia - Noturno', module: 'cadastros-alunos' },
  { id: 3, type: 'financial', title: 'Pagamento Pendente', subtitle: 'Mensalidade Fev/2026 - Marcos Silva', module: 'financeiro' },
  { id: 4, type: 'financial', title: 'Fluxo de Caixa', subtitle: 'Relatório diário de entradas', module: 'caixa' },
  { id: 5, type: 'module', title: 'Emitir Declaração', subtitle: 'Acesso rápido à Secretaria', module: 'secretaria' },
  { id: 6, type: 'module', title: 'Cadastrar Novo Aluno', subtitle: 'Atalho para Parceiros', module: 'parceiros-novo-aluno' },
  { id: 7, type: 'partner', title: 'Prefeitura de Japoatã', subtitle: 'Convênio Ativo', module: 'parceiros' },
];

export const useGestorSearch = (canOpenModule: (moduleId: string) => boolean) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return MOCK_SEARCH_DATA.filter(item => canOpenModule(item.module) && (
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(searchQuery.toLowerCase())
    ));
  }, [canOpenModule, searchQuery]);
  return { searchQuery, setSearchQuery, searchResults, isSearchFocused, setIsSearchFocused };
};

export const getResultIcon = (type: string) => {
  switch (type) {
    case 'student': return <User size={16} className="text-blue-500" />;
    case 'financial': return <CreditCard size={16} className="text-emerald-500" />;
    case 'module': return <Settings size={16} className="text-slate-500" />;
    case 'partner': return <Handshake size={16} className="text-purple-500" />;
    default: return <Search size={16} />;
  }
};
