import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ModalExcluirPoloProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  poloNome: string;
}

const ModalExcluirPolo: React.FC<ModalExcluirPoloProps> = ({
  isOpen,
  onClose,
  onConfirm,
  poloNome
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop com Blur */}
      <div 
        className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity animate-fadeIn" 
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl transform transition-all animate-scaleIn border border-slate-100">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6">
            <AlertTriangle size={32} />
          </div>

          <h3 className="text-xl font-black text-[#001a33] mb-2 uppercase tracking-tight">
            Excluir Polo?
          </h3>
          
          <p className="text-slate-500 mb-8 leading-relaxed text-sm">
            Esta ação é permanente. Todos os dados vinculados ao polo <strong className="text-slate-700">{poloNome}</strong> serão perdidos e não poderão ser recuperados.
          </p>

          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 py-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-900/20 transition-all transform active:scale-95"
            >
              Sim, Excluir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalExcluirPolo;
