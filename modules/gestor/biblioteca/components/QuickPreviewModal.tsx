// File: modules/gestor/biblioteca/components/QuickPreviewModal.tsx

import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Download, ZoomIn, ZoomOut, AlertCircle } from 'lucide-react';
import { LibraryDocument } from '../biblioteca.types';

interface QuickPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: LibraryDocument | null;
}

const QuickPreviewModal: React.FC<QuickPreviewModalProps> = ({ isOpen, onClose, document }) => {
  if (!isOpen || !document) return null;
  if (typeof window === 'undefined') return null;

  const isMockUrl = document.url === '#' || document.url.startsWith('data:') || !document.url.startsWith('http');

  const renderPreviewContent = () => {
    switch (document.fileType) {
      case 'IMG':
        return (
          <div className="flex items-center justify-center p-4 bg-slate-900 rounded-2xl h-[60vh] overflow-auto select-none">
            <img 
              src={isMockUrl ? 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=600&auto=format&fit=crop' : document.url} 
              alt={document.title} 
              className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-300"
            />
          </div>
        );
      case 'PDF':
        if (isMockUrl) {
          return (
            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl h-[60vh] space-y-4">
              <div className="w-16 h-16 bg-red-100 text-red-650 rounded-full flex items-center justify-center text-red-600">
                <FileText size={32} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Leitor PDF Simulado</p>
                <p className="text-xs text-slate-400 font-bold uppercase">Ambiente de Desenvolvimento Local</p>
              </div>
              <div className="w-full max-w-md p-6 bg-white rounded-xl border border-slate-150 space-y-3 font-serif text-slate-700 text-xs leading-relaxed shadow-sm">
                <p className="font-bold border-b border-slate-100 pb-1.5 text-center uppercase tracking-wide font-sans text-[10px] text-slate-400">Conteúdo do Arquivo: {document.title}</p>
                <p><b>Seção I - Diretrizes Gerais:</b> Este documento estabelece as normas pedagógicas e de acompanhamento curricular para as disciplinas práticas e teóricas da instituição.</p>
                <p><b>Seção II - Avaliações:</b> O aproveitamento escolar será apurado mediante acompanhamento contínuo e avaliações periódicas cumulativas estabelecidas pelo conselho docente.</p>
              </div>
            </div>
          );
        }
        return (
          <iframe
            src={document.url}
            title={document.title}
            className="w-full h-[60vh] rounded-2xl border border-slate-250 shadow-inner"
          />
        );
      case 'DOC':
      case 'XLS':
        if (isMockUrl) {
          return (
            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl h-[60vh] space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                document.fileType === 'DOC' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
              }`}>
                <FileText size={32} />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-black text-slate-800 uppercase tracking-wide">
                  Leitor de {document.fileType === 'DOC' ? 'Documento Word' : 'Planilha Excel'}
                </p>
                <p className="text-xs text-slate-400 font-bold uppercase">Visualização Simulada</p>
              </div>
              <div className="w-full max-w-lg p-6 bg-white rounded-xl border border-slate-150 space-y-3 shadow-sm">
                <p className="font-bold border-b border-slate-100 pb-2 text-[10px] text-slate-400 uppercase tracking-wider">
                  Visualização rápida de {document.title}
                </p>
                {document.fileType === 'DOC' ? (
                  <div className="space-y-2 text-xs font-serif text-slate-650 leading-relaxed">
                    <p className="font-bold text-slate-800 text-center text-sm">TERMO ADITIVO DE MATRICULA E CONTRATO</p>
                    <p>Por este instrumento aditivo, fica pactuado o ajuste de matérias e cronograma letivo.</p>
                    <p>Cláusula 1ª - Fica acordada a liberação de disciplinas práticas adicionais para conclusão do módulo.</p>
                  </div>
                ) : (
                  <div className="space-y-1 text-xs font-mono">
                    <div className="grid grid-cols-4 gap-2 bg-slate-50 p-1.5 font-bold border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[9px] text-center">
                      <span>Ref</span><span>Categoria</span><span>Descrição</span><span>Status</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 p-1.5 border-b border-slate-100 text-center">
                      <span>001</span><span>Pedagógico</span><span>Aulas Práticas</span><span className="text-emerald-650 font-bold">OK</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 p-1.5 border-b border-slate-100 text-center">
                      <span>002</span><span>Geral</span><span>Normativas 2024</span><span className="text-emerald-650 font-bold">OK</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        }
        return (
          <iframe
            src={`https://docs.google.com/gview?url=${encodeURIComponent(document.url)}&embedded=true`}
            title={document.title}
            className="w-full h-[60vh] rounded-2xl border border-slate-250 shadow-inner"
          />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl h-[60vh] space-y-3">
            <AlertCircle size={36} className="text-amber-500" />
            <h4 className="font-black uppercase text-sm">Visualização não suportada</h4>
            <p className="text-xs text-center max-w-sm">
              Não conseguimos abrir uma visualização rápida para o formato deste arquivo. Por favor, faça o download para abri-lo localmente.
            </p>
          </div>
        );
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-[#001a33]/65 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>
      
      {/* Container */}
      <div className="relative bg-white rounded-[2rem] w-full max-w-4xl p-6 md:p-8 shadow-2xl animate-fadeIn border border-slate-100 max-h-[90vh] flex flex-col justify-between overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-2.5 py-0.5 rounded-full border border-blue-100">
                Visualização Rápida
              </span>
              <span className="text-[10px] text-slate-400 font-bold uppercase">{document.size}</span>
            </div>
            <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight">{document.title}</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body (Scrollable preview space) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar my-2">
          {renderPreviewContent()}
        </div>

        {/* Footer actions */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center shrink-0">
          <p className="text-[9px] text-slate-450 uppercase font-black tracking-widest">
            Autor: <span className="text-blue-600">{document.authorName}</span> • Criado em: {new Date(document.createdAt).toLocaleDateString('pt-BR')}
          </p>
          <a
            href={document.url === '#' ? undefined : document.url}
            download={document.title}
            onClick={(e) => {
              if (document.url === '#') {
                e.preventDefault();
                alert('O download deste arquivo simulado não está disponível.');
              }
            }}
            className="flex items-center gap-2 bg-[#001a33] hover:bg-blue-900 text-white px-5 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-blue-900/10"
          >
            <Download size={14} /> Baixar Arquivo
          </a>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default QuickPreviewModal;
