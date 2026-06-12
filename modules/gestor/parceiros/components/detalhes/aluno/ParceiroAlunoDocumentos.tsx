// File: modules/gestor/parceiros/components/detalhes/aluno/ParceiroAlunoDocumentos.tsx

import React, { useState, useEffect } from 'react';
import { FileText, Upload, CheckCircle2, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import { parceirosService } from '../../../../parceiros.service';

interface ParceiroAlunoDocumentosProps {
  alunoId: string;
}

const ParceiroAlunoDocumentos: React.FC<ParceiroAlunoDocumentosProps> = ({ alunoId }) => {
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingDocName, setUploadingDocName] = useState<string | null>(null);

  const loadDocs = async () => {
    try {
      setLoading(true);
      const list = await parceirosService.getDocumentos(alunoId);
      setDocs(list);
    } catch (err) {
      console.error('Erro ao carregar documentos do aluno:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, [alunoId]);

  const handleFileUpload = async (docName: string, file: File) => {
    try {
      setUploadingDocName(docName);
      await parceirosService.uploadDocumento(alunoId, docName, file);
      // Recarrega a lista
      const list = await parceirosService.getDocumentos(alunoId);
      setDocs(list);
      alert('Documento enviado e cadastrado com sucesso!');
    } catch (err) {
      alert('Erro ao realizar upload do arquivo.');
      console.error(err);
    } finally {
      setUploadingDocName(null);
    }
  };

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-[#001a33]">Checklist de Matrícula</h3>
          <p className="text-xs text-slate-500 font-medium">Controle de documentação obrigatória do estudante.</p>
        </div>
        <button 
          onClick={loadDocs}
          className="flex items-center gap-2 text-xs font-bold text-slate-650 bg-slate-100 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar Checklist
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="animate-spin text-blue-650 mx-auto mb-2" size={28} />
          <p className="text-slate-500 text-xs font-medium">Buscando documentos do aluno...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docs.map((doc) => (
            <div key={doc.id} className="bg-white border border-slate-150 p-4 rounded-2xl flex flex-col justify-between gap-4 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
              
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${doc.status === 'entregue' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-slate-700 block leading-tight">{doc.nome}</span>
                    <span className="text-[10px] text-slate-400 font-medium mt-1 block">
                      {doc.status === 'entregue' ? 'Arquivo PDF/Imagem em nuvem' : 'Pendente para matrícula'}
                    </span>
                  </div>
                </div>
                
                {doc.status === 'entregue' ? (
                  <div className="flex items-center gap-1 text-emerald-600 text-xs font-bold uppercase tracking-wide">
                    <CheckCircle2 size={14} /> Entregue
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-orange-500 text-xs font-bold uppercase tracking-wide">
                    <AlertCircle size={14} /> Pendente
                  </div>
                )}
              </div>

              {/* Botões de Ações */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1">
                <div>
                  {doc.arquivoUrl ? (
                    <a 
                      href={doc.arquivoUrl}
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs font-bold text-blue-650 hover:underline hover:text-blue-800"
                    >
                      <Eye size={12} /> Visualizar
                    </a>
                  ) : (
                    <span className="text-[10px] text-slate-400 font-medium">Nenhum arquivo enviado</span>
                  )}
                </div>

                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#001a33] bg-slate-50 hover:bg-[#001a33] hover:text-white px-3.5 py-2 rounded-xl transition-all cursor-pointer border border-slate-200">
                  {uploadingDocName === doc.nome ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Upload size={12} />
                      {doc.status === 'entregue' ? 'Reenviar' : 'Enviar'}
                    </>
                  )}
                  <input 
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    disabled={uploadingDocName !== null}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(doc.nome, file);
                    }}
                  />
                </label>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoDocumentos;
