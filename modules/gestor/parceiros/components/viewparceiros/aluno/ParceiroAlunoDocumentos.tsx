
// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoDocumentos.tsx

import React, { useState } from 'react';
import { FileText, Upload, CheckCircle2, AlertCircle, Download, Eye, X } from 'lucide-react';

interface DocItem {
  id: string;
  name: string;
  status: 'entregue' | 'pendente';
  fileUrl?: string;
  fileName?: string;
}

const ParceiroAlunoDocumentos: React.FC = () => {
  const [docs, setDocs] = useState<DocItem[]>([
    { id: '1', name: 'RG (Frente e Verso) ou CNH', status: 'entregue', fileUrl: 'https://images.unsplash.com/photo-1623030386708-efef4d9cf76f?w=600&h=400&fit=crop', fileName: 'rg_frente_verso.jpg' },
    { id: '2', name: 'CPF', status: 'entregue', fileUrl: 'https://images.unsplash.com/photo-1623030386708-efef4d9cf76f?w=600&h=400&fit=crop', fileName: 'cpf.pdf' },
    { id: '3', name: 'Comprovante de Residência', status: 'pendente' },
    { id: '4', name: 'Histórico Escolar', status: 'pendente' },
    { id: '5', name: 'Certidão de Nascimento/Casamento', status: 'entregue', fileUrl: 'https://images.unsplash.com/photo-1623030386708-efef4d9cf76f?w=600&h=400&fit=crop', fileName: 'certidao.jpg' },
    { id: '6', name: 'Foto 3x4', status: 'pendente' },
  ]);

  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

  const handleUpload = (id: string) => {
    // Mock upload action
    setDocs(docs.map(doc => {
      if (doc.id === id) {
        return { 
          ...doc, 
          status: 'entregue', 
          fileUrl: 'https://images.unsplash.com/photo-1623030386708-efef4d9cf76f?w=600&h=400&fit=crop',
          fileName: 'novo_documento_upload.jpg'
        };
      }
      return doc;
    }));
  };

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-black text-[#001a33] tracking-tight">Documentação do Aluno</h3>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {docs.map((doc) => (
            <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between shadow-sm hover:shadow-md transition-shadow gap-4">
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className={`p-3 rounded-xl shrink-0 ${doc.status === 'entregue' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                        <FileText size={24} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm md:text-base">{doc.name}</h4>
                      {doc.status === 'entregue' ? (
                          <div className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-bold uppercase tracking-widest mt-1">
                              <CheckCircle2 size={12} /> Entregue • {doc.fileName}
                          </div>
                      ) : (
                          <div className="flex items-center gap-1.5 text-orange-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                              <AlertCircle size={12} /> Pendente
                          </div>
                      )}
                    </div>
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    {doc.status === 'pendente' ? (
                      <button 
                        onClick={() => handleUpload(doc.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-[#001a33] text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors shrink-0"
                      >
                        <Upload size={14} /> Vincular Arquivo
                      </button>
                    ) : (
                      <>
                        <button 
                          onClick={() => setPreviewDoc(doc)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors shrink-0"
                        >
                          <Eye size={14} /> Visualizar
                        </button>
                        <button 
                          className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors shrink-0"
                        >
                          <Download size={14} /> Baixar
                        </button>
                        <button 
                          onClick={() => handleUpload(doc.id)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-50 hover:text-slate-800 transition-colors shrink-0 outline-none"
                          title="Atualizar Documento"
                        >
                          <Upload size={14} />
                        </button>
                      </>
                    )}
                </div>
            </div>
        ))}
      </div>

      {/* Modal Quick View */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-[#001a33] text-lg">{previewDoc.name}</h3>
                <p className="text-xs text-slate-500 font-medium">{previewDoc.fileName}</p>
              </div>
              <button 
                onClick={() => setPreviewDoc(null)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-6 overflow-auto flex items-center justify-center min-h-[300px]">
              {/* Fake visualizer for image/pdf */}
              {previewDoc.fileName?.endsWith('.pdf') ? (
                <div className="w-full max-w-2xl bg-white h-[600px] shadow-lg flex flex-col items-center justify-center text-slate-400">
                  <FileText size={64} className="mb-4 opacity-50" />
                  <p className="font-bold">Visualizador de PDF Mockado</p>
                </div>
              ) : (
                <img 
                  src={previewDoc.fileUrl} 
                  alt={previewDoc.name} 
                  className="max-w-full max-h-[70vh] rounded-lg shadow-lg object-contain"
                />
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
               <button 
                 onClick={() => setPreviewDoc(null)}
                 className="px-6 py-2.5 bg-[#001a33] text-white rounded-xl text-sm font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors"
               >
                 Fechar
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoDocumentos;
