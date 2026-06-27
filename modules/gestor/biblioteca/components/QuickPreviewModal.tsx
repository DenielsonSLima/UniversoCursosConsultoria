// File: modules/gestor/biblioteca/components/QuickPreviewModal.tsx

import React from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Download, AlertCircle, Camera } from 'lucide-react';
import { LibraryDocument } from '../biblioteca.types';

interface QuickPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: LibraryDocument | null;
}

const QuickPreviewModal: React.FC<QuickPreviewModalProps> = ({ isOpen, onClose, document }) => {
  if (!isOpen || !document) return null;
  if (typeof window === 'undefined') return null;

  const normalizedUrl = `${document.url || ''}`.trim();
  const isValidPublicUrl =
    normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://');
  const isMockUrl = !normalizedUrl || normalizedUrl === '#' || normalizedUrl.startsWith('data:') || !isValidPublicUrl;
  const fileTitle = `${document.title || 'documento'}`.toLowerCase();
  const fileUrlBase = normalizedUrl.split('?')[0].toLowerCase();
  const extensionHint = (() => {
    const titleExt = fileTitle.split('.').pop() || '';
    const urlExt = fileUrlBase.split('.').pop() || '';
    return titleExt || urlExt || '';
  })();

  const isImageFile = () => {
    if (document.fileType === 'IMG') return true;
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extensionHint);
  };

  const isPdfFile = () => {
    if (document.fileType === 'PDF') return true;
    return extensionHint === 'pdf';
  };

  const fileTypeTag = (() => {
    if (isPdfFile()) return 'PDF';
    if (isImageFile()) return 'IMG';
    return document.fileType;
  })();

  const renderPreviewContent = () => {
    switch (fileTypeTag) {
      case 'IMG':
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl h-[60vh] space-y-4">
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
              <Camera size={28} />
            </div>
            {isMockUrl ? (
              <>
                <p className="text-sm font-black text-slate-800 uppercase tracking-wide">Visualização de Imagem Indisponível</p>
                <p className="text-xs text-slate-400 font-bold uppercase">
                  A pré-visualização é liberada no próprio sistema quando o arquivo está publicado corretamente.
                </p>
              </>
            ) : (
              <img 
                src={normalizedUrl} 
                alt={document.title} 
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-300"
              />
            )}
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
                <p className="text-xs text-slate-400 font-bold uppercase">Ambiente interno de pré-visualização</p>
              </div>
              <div className="w-full max-w-md p-6 bg-white rounded-xl border border-slate-150 space-y-3 font-serif text-slate-700 text-xs leading-relaxed shadow-sm">
                <p className="font-bold border-b border-slate-100 pb-1.5 text-center uppercase tracking-wide font-sans text-[10px] text-slate-400">
                  Pré-visualização não disponível para este documento
                </p>
                <p className="leading-relaxed">
                  O arquivo foi recebido e validado no sistema, mas não foi possível renderizar um preview embutido no momento.
                </p>
                <p className="leading-relaxed">
                  Use o botão "Baixar Arquivo" para abrir o conteúdo completo no seu dispositivo.
                </p>
              </div>
            </div>
          );
        }
        return (
          <iframe
            src={normalizedUrl}
            title={document.title}
            className="w-full h-[60vh] rounded-2xl border border-slate-250 shadow-inner"
          />
        );
      case 'DOC':
      case 'XLS':
        return (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-2xl h-[60vh] space-y-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              document.fileType === 'DOC' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
              <FileText size={32} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-black text-slate-800 uppercase tracking-wide">
                {document.fileType === 'DOC' ? 'Pré-Visualização de Documento' : 'Pré-Visualização de Planilha'}
              </p>
              <p className="text-xs text-slate-400 font-bold uppercase">
                Conteúdo não encontrado no preview.
              </p>
            </div>
          <p className="text-xs text-slate-500 text-center max-w-lg">
              Este é um recurso interno. Para visualizar integralmente, faça o download do arquivo.
            </p>
            <div className="w-full max-w-lg p-6 bg-white rounded-xl border border-slate-150 space-y-3 shadow-sm">
              <p className="font-bold border-b border-slate-100 pb-2 text-[10px] text-slate-400 uppercase tracking-wider">
                {document.title}
              </p>
              <p className="text-xs text-slate-650 leading-relaxed">
                Prévia simplificada disponível no painel do sistema. O arquivo foi enviado para download e pode ser aberto no programa apropriado do seu dispositivo.
              </p>
            </div>
            {!isMockUrl && (
              <a
                href={normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                <Download size={12} />
                Abrir arquivo
              </a>
            )}
          </div>
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
            href={isMockUrl ? undefined : normalizedUrl}
            download={isMockUrl ? undefined : document.title}
            onClick={(e) => {
              if (isMockUrl) {
                e.preventDefault();
                alert('O download não está disponível para este documento.');
              }
            }}
            className="flex items-center gap-2 bg-[#001a33] hover:bg-blue-900 text-white px-5 py-2.5 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-blue-900/10"
            onKeyDown={(e) => isMockUrl ? e.preventDefault() : undefined}
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
