import React from 'react';
import { ArrowRight, Building2, CheckCircle2 } from 'lucide-react';

interface ProfessorPoloSelectorProps {
  polos: Array<{ id: string; nome: string }>;
  professorName: string;
  selectedPoloId: string;
  errorMessage: string;
  isLeaving: boolean;
  onSelect: (poloId: string) => void;
  onConfirm: () => void;
  onBack: () => void | Promise<void>;
}

const ProfessorPoloSelector: React.FC<ProfessorPoloSelectorProps> = ({
  polos,
  professorName,
  selectedPoloId,
  errorMessage,
  isLeaving,
  onSelect,
  onConfirm,
  onBack,
}) => (
  <div className="w-full max-w-md animate-fadeIn rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-200/70 sm:p-8">
    {errorMessage ? (
      <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-xs font-bold leading-relaxed text-red-600">
        {errorMessage}
      </p>
    ) : null}
    <div className="mb-8 text-center lg:text-left">
      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4 mx-auto lg:mx-0">
        <Building2 size={24} />
      </div>
      <h2 className="text-2xl font-black text-[#001a33] mb-2 uppercase tracking-tight">Escolha a Unidade</h2>
      <p className="text-slate-500 text-sm">
        Olá, <strong className="text-blue-700">{professorName}</strong>! Selecione em qual polo deseja realizar seus lançamentos no momento:
      </p>
    </div>

    <div className="space-y-3 mb-8">
      {polos.map((polo) => {
        const isSelected = selectedPoloId === polo.id;
        return (
          <button
            key={polo.id}
            type="button"
            onClick={() => onSelect(polo.id)}
            disabled={isLeaving}
            className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all text-left group disabled:cursor-not-allowed disabled:opacity-60 ${
              isSelected
                ? 'border-blue-500 bg-blue-50/50 shadow-md ring-2 ring-blue-100'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl transition-colors ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                <Building2 size={18} />
              </div>
              <div>
                <p className={`font-bold text-sm ${isSelected ? 'text-[#001a33]' : 'text-slate-700'}`}>{polo.nome}</p>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-0.5">
                  {polo.nome.toLowerCase().includes('matriz') ? 'Sede Central' : 'Filial'}
                </p>
              </div>
            </div>
            {isSelected ? <CheckCircle2 className="text-blue-600" size={18} /> : <div className="w-5 h-5 rounded-full border border-slate-200" />}
          </button>
        );
      })}
    </div>

    <div className="space-y-3">
      <button
        type="button"
        onClick={onConfirm}
        disabled={isLeaving || !selectedPoloId}
        className="w-full bg-[#001a33] hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-900/20 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 group transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>Confirmar e Acessar</span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
      </button>
      <button
        type="button"
        onClick={() => void onBack()}
        disabled={isLeaving}
        className="w-full bg-white border border-slate-200 text-slate-500 hover:text-slate-800 py-3.5 rounded-xl transition-all uppercase tracking-widest text-[10px] font-black text-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLeaving ? 'Encerrando sessão...' : 'Voltar para Login'}
      </button>
    </div>
  </div>
);

export default ProfessorPoloSelector;
