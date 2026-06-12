
// File: modules/gestor/secretaria/components/SecretariaDashboard.tsx

import React from 'react';
import { 
  Search, 
  FileText, 
  ScrollText, 
  CreditCard, 
  ArrowRightLeft, 
  Printer
} from 'lucide-react';

interface SecretariaDashboardProps {
  onNavigate: (module: string) => void;
}

const SecretariaDashboard: React.FC<SecretariaDashboardProps> = ({ onNavigate }) => {
  const cards = [
    {
      id: 'alunos',
      title: 'Busca de Aluno 360º',
      desc: 'Visualize financeiro, acadêmico e dados cadastrais em um só lugar.',
      icon: <Search size={32} />,
      color: 'bg-blue-600',
      textColor: 'text-blue-600',
      bgLight: 'bg-blue-50'
    },
    {
      id: 'declaracao',
      title: 'Emitir Declarações',
      desc: 'Declaração de matrícula, frequência e conclusão de curso.',
      icon: <FileText size={32} />,
      color: 'bg-emerald-600',
      textColor: 'text-emerald-600',
      bgLight: 'bg-emerald-50'
    },
    {
      id: 'boletim',
      title: 'Boletins Escolares',
      desc: 'Emissão individual ou em lote por turma.',
      icon: <ScrollText size={32} />,
      color: 'bg-indigo-600',
      textColor: 'text-indigo-600',
      bgLight: 'bg-indigo-50'
    },
    {
      id: 'carteirinha',
      title: 'Carteirinhas',
      desc: 'Geração de carteirinhas estudantis com QR Code.',
      icon: <CreditCard size={32} />,
      color: 'bg-purple-600',
      textColor: 'text-purple-600',
      bgLight: 'bg-purple-50'
    },
    {
      id: 'transferencia',
      title: 'Transferência',
      desc: 'Processo de transferência externa e emissão de guia.',
      icon: <ArrowRightLeft size={32} />,
      color: 'bg-orange-500',
      textColor: 'text-orange-600',
      bgLight: 'bg-orange-50'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
      {cards.map((card) => (
        <button
          key={card.id}
          onClick={() => onNavigate(card.id)}
          className="group flex flex-col items-start p-8 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/10 hover:-translate-y-1 transition-all duration-300 text-left relative overflow-hidden"
        >
          {/* Decorative Circle */}
          <div className={`absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-0 group-hover:opacity-10 transition-opacity ${card.color}`}></div>

          <div className={`p-4 rounded-2xl ${card.bgLight} ${card.textColor} mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300`}>
            {card.icon}
          </div>

          <h3 className="text-xl font-black text-[#001a33] mb-2 group-hover:text-blue-700 transition-colors">
            {card.title}
          </h3>
          
          <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">
            {card.desc}
          </p>

          <div className="mt-auto w-full pt-4 border-t border-slate-50 flex justify-between items-center text-xs font-bold uppercase tracking-widest text-slate-400 group-hover:text-blue-600 transition-colors">
            <span>Acessar</span>
            <Printer size={16} />
          </div>
        </button>
      ))}
    </div>
  );
};

export default SecretariaDashboard;
