import React from 'react';
import { Building, GraduationCap, User, Users, X } from 'lucide-react';

type FormType = 'aluno' | 'professor' | 'selection' | 'pf' | 'pj' | null;

interface ParceiroSelectionModalProps {
  onSelect: (form: FormType) => void;
  onClose: () => void;
}

const ParceiroSelectionModal: React.FC<ParceiroSelectionModalProps> = ({ onSelect, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#001a33]/60 backdrop-blur-sm animate-fadeIn">
    <div className="relative bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl border border-slate-100">
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-red-500 transition-colors"
      >
        <X size={24} />
      </button>

      <div className="text-center mb-10 mt-2">
        <h3 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">Novo Registro</h3>
        <p className="text-slate-500 font-medium">Selecione o tipo de cadastro que deseja realizar.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => onSelect('aluno')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <GraduationCap size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-blue-700 text-center">Aluno</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Vínculo de matrícula</span>
        </button>

        <button
          onClick={() => onSelect('professor')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-purple-500 hover:bg-purple-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <Users size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-purple-700 text-center">Professor</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Vínculo docente</span>
        </button>

        <button
          onClick={() => onSelect('pj')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-slate-800 hover:bg-slate-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <Building size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-slate-900 text-center">Pess. Jurídica</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Empresas e filiais</span>
        </button>

        <button
          onClick={() => onSelect('pf')}
          className="group flex flex-col items-center justify-center p-6 rounded-3xl border-2 border-slate-100 hover:border-amber-500 hover:bg-amber-50 transition-all duration-300"
        >
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-sm">
            <User size={32} />
          </div>
          <span className="text-sm font-black text-[#001a33] uppercase tracking-wide group-hover:text-amber-700 text-center">Pess. Física</span>
          <span className="text-[10px] text-slate-400 font-medium mt-1 text-center">Prestad. de Serviço</span>
        </button>
      </div>
    </div>
  </div>
);

export default ParceiroSelectionModal;
