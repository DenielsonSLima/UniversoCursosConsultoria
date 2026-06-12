import React, { useState } from 'react';
import { X, FileText, Table, Download, ArrowLeft } from 'lucide-react';
import PdfTemplate from './templates/PdfTemplate';

interface ParceirosExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filtrosAtuais?: any;
}

const ParceirosExportModal: React.FC<ParceirosExportModalProps> = ({ isOpen, onClose, filtrosAtuais }) => {
  const [activeView, setActiveView] = useState<'opcoes' | 'preview-pdf'>('opcoes');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fadeIn">
      <div className={`bg-white rounded-3xl shadow-xl w-full flex flex-col overflow-hidden transition-all duration-300 ${activeView === 'preview-pdf' ? 'max-w-4xl h-[85vh]' : 'max-w-md'}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-black text-[#001a33] tracking-tighter">
            {activeView === 'opcoes' ? 'Exportar Parceiros' : 'Visualização do PDF'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeView === 'opcoes' ? (
            <div className="space-y-4 animate-fadeIn">
              <p className="text-sm font-medium text-slate-500 mb-6">
                Escolha o formato desejado para exportar a lista de parceiros baseada nos filtros atuais.
              </p>

              <div className="grid gap-3">
                <button 
                  onClick={() => setActiveView('preview-pdf')}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200 hover:border-red-200 hover:bg-red-50 group transition-all text-left"
                >
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#001a33] group-hover:text-red-700">Exportar como PDF</h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Documento formatado para impressão</p>
                  </div>
                </button>

                <button 
                  onClick={() => { alert('Iniciando download do Excel...'); onClose(); }}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50 group transition-all text-left"
                >
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Table size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#001a33] group-hover:text-emerald-700">Exportar como Excel</h3>
                    <p className="text-xs text-slate-500 mt-1 font-medium">Planilha .xlsx para análise de dados</p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col animate-fadeIn">
              <div className="bg-slate-200 flex-1 rounded-2xl overflow-y-auto border border-slate-300 p-4 shadow-inner">
                 <div className="bg-white mx-auto shadow-md min-h-[900px] w-full max-w-[750px] p-10">
                    <PdfTemplate />
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          {activeView === 'preview-pdf' ? (
            <>
              <button 
                onClick={() => setActiveView('opcoes')}
                className="flex items-center gap-2 px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-100 transition-colors uppercase tracking-widest text-xs"
              >
                <ArrowLeft size={16} /> Voltar
              </button>
              <button 
                onClick={() => { alert('Baixando PDF...'); onClose(); }}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 uppercase tracking-widest text-xs"
              >
                <Download size={16} />
                Baixar PDF
              </button>
            </>
          ) : (
            <button 
              onClick={onClose}
              className="px-6 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-100 transition-colors uppercase tracking-widest text-xs"
            >
              Cancelar
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default ParceirosExportModal;
