import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle, X } from 'lucide-react';

interface ModalInativarPoloProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  poloNome: string;
  statusAtual: 'ativo' | 'inativo';
}

const ModalInativarPolo: React.FC<ModalInativarPoloProps> = ({
  isOpen,
  onClose,
  onConfirm,
  poloNome,
  statusAtual
}) => {
  const titleId = useId();
  if (!isOpen || typeof document === 'undefined') return null;

  const isInactivating = statusAtual === 'ativo';

  return createPortal(
    <div className="config-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop com Blur */}
      <div 
        className="config-polo-backdrop absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity animate-fadeIn" 
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="config-dialog config-polo-confirm relative bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl transform transition-all animate-scaleIn border border-slate-100">
        <button 
          onClick={onClose}
          aria-label="Fechar confirmação do polo"
          className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
          {isInactivating ? (
            <>
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center mb-6">
                <AlertCircle size={32} />
              </div>
              <h3 id={titleId} className="text-xl font-black text-[#001a33] mb-2 uppercase tracking-tight">
                Inativar Polo?
              </h3>
              <p className="text-slate-500 mb-8 leading-relaxed text-sm">
                Ao inativar o polo <strong className="text-slate-700">{poloNome}</strong>, ele ficará temporariamente indisponível para novas matrículas e movimentações. O histórico atual continuará preservado.
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                <CheckCircle size={32} />
              </div>
              <h3 id={titleId} className="text-xl font-black text-[#001a33] mb-2 uppercase tracking-tight">
                Ativar Polo?
              </h3>
              <p className="text-slate-500 mb-8 leading-relaxed text-sm">
                Deseja reativar o polo <strong className="text-slate-700">{poloNome}</strong> e torná-lo totalmente operacional novamente no sistema?
              </p>
            </>
          )}

          <div className="config-dialog-footer flex gap-3 w-full">
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
              className={`flex-1 py-3.5 rounded-xl text-white font-bold text-xs uppercase tracking-wider shadow-lg transition-all transform active:scale-95 ${
                isInactivating 
                  ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-900/20' 
                  : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/20'
              }`}
            >
              {isInactivating ? 'Sim, Inativar' : 'Sim, Ativar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  , document.body);
};

export default ModalInativarPolo;
