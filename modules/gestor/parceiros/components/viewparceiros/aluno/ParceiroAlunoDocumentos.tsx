// File: modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoDocumentos.tsx

import React, { useState, useEffect } from 'react';
import { FileText, Upload, CheckCircle2, AlertCircle, Download, Eye, Loader } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { parceirosService } from '../../../parceiros.service';

interface ParceiroAlunoDocumentosProps {
  alunoId: string;
}

const ParceiroAlunoDocumentos: React.FC<ParceiroAlunoDocumentosProps> = ({ alunoId }) => {
  const queryClient = useQueryClient();
  const [uploadingName, setUploadingName] = useState<string | null>(null);

  // 1. Carregar documentos usando React Query
  const { data: docs = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['documentos', alunoId],
    queryFn: () => parceirosService.getDocumentos(alunoId),
    enabled: !!alunoId,
  });

  // 2. Realtime para a tabela documentos_aluno deste aluno
  useEffect(() => {
    if (!alunoId) return;

    const channel = supabase
      .channel(`documentos_realtime_${alunoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documentos_aluno',
          filter: `aluno_id=eq.${alunoId}`,
        },
        (payload) => {
          console.log('[Realtime] Mudança detectada em documentos do aluno:', payload);
          queryClient.invalidateQueries({ queryKey: ['documentos', alunoId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [alunoId, queryClient]);

  // 3. Mutação para upload de documento
  const uploadMutation = useMutation({
    mutationFn: ({ docName, file }: { docName: string; file: File }) =>
      parceirosService.uploadDocumento(alunoId, docName, file),
    onSuccess: (url, variables) => {
      queryClient.invalidateQueries({ queryKey: ['documentos', alunoId] });
      alert(`Documento "${variables.docName}" enviado e vinculado com sucesso!`);
    },
    onError: (err: any) => {
      alert('Erro ao enviar o documento. Verifique as configurações de storage.');
      console.error(err);
    }
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, docName: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingName(docName);
      await uploadMutation.mutateAsync({ docName, file });
    } finally {
      setUploadingName(null);
    }
  };

  const triggerFileInput = (docName: string) => {
    const el = document.getElementById(`file-input-${docName.replace(/[^a-zA-Z0-9]/g, '_')}`) as HTMLInputElement;
    if (el) el.click();
  };

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'entregue') {
      return (
        <div className="flex items-center gap-1.5 text-emerald-600 text-[10px] font-bold uppercase tracking-widest mt-1">
          <CheckCircle2 size={12} /> Entregue
        </div>
      );
    }
    if (s === 'rejeitado') {
      return (
        <div className="flex items-center gap-1.5 text-red-500 text-[10px] font-bold uppercase tracking-widest mt-1">
          <AlertCircle size={12} /> Rejeitado
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-orange-550 text-[10px] font-bold uppercase tracking-widest mt-1">
        <AlertCircle size={12} /> Pendente
      </div>
    );
  };

  return (
    <div className="animate-fadeIn space-y-6">
      <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-6">
        <div>
          <h3 className="text-xl font-black text-[#001a33] tracking-tight uppercase">Checklist de Documentação</h3>
          <p className="text-slate-500 text-xs mt-0.5">Gerencie os arquivos entregues pelo aluno para validação da secretaria</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400 font-medium">Carregando documentos...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20 text-slate-400 font-medium border border-dashed border-slate-200 rounded-2xl">
          Nenhum checklist de documentos encontrado para este aluno.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {docs.map((doc) => {
            const isUploading = uploadingName === doc.nome;
            const inputId = `file-input-${doc.nome.replace(/[^a-zA-Z0-9]/g, '_')}`;

            return (
              <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between shadow-sm hover:shadow-md transition-shadow gap-4">
                
                {/* Inputs do tipo file ocultos para upload */}
                <input
                  type="file"
                  id={inputId}
                  className="hidden"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={(e) => handleFileChange(e, doc.nome)}
                />

                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <div className={`p-3 rounded-xl shrink-0 ${doc.status === 'entregue' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-400'}`}>
                    <FileText size={24} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm md:text-base">{doc.nome}</h4>
                    {getStatusBadge(doc.status)}
                    {doc.observacao && (
                      <p className="text-[10px] text-slate-500 italic mt-1">Obs: {doc.observacao}</p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  {isUploading ? (
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider py-2 px-4 border border-slate-100 rounded-xl bg-slate-50">
                      <Loader className="animate-spin" size={14} /> Enviando...
                    </div>
                  ) : doc.status === 'pendente' || !doc.arquivoUrl ? (
                    <button 
                      onClick={() => triggerFileInput(doc.nome)}
                      className="flex items-center gap-2 px-4 py-2 bg-[#001a33] text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors shrink-0"
                    >
                      <Upload size={14} /> Vincular Arquivo
                    </button>
                  ) : (
                    <>
                      <a 
                        href={doc.arquivoUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-blue-100 transition-colors shrink-0"
                      >
                        <Eye size={14} /> Visualizar
                      </a>
                      <a 
                        href={doc.arquivoUrl}
                        download
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 text-slate-700 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors shrink-0"
                      >
                        <Download size={14} /> Baixar
                      </a>
                      <button 
                        onClick={() => triggerFileInput(doc.nome)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-505 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-50 hover:text-slate-800 transition-colors shrink-0 outline-none"
                        title="Substituir Arquivo"
                      >
                        <Upload size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ParceiroAlunoDocumentos;
