import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BookOpen, Sparkles, Folder, FileText, Lock } from 'lucide-react';

import FileExplorer from '../../gestor/biblioteca/components/FileExplorer';
import UploadModal from '../../gestor/biblioteca/components/UploadModal';
import QuickPreviewModal from '../../gestor/biblioteca/components/QuickPreviewModal';
import { bibliotecaService } from '../../gestor/biblioteca/biblioteca.service';
import { LibraryDocument } from '../../gestor/biblioteca/biblioteca.types';

interface BibliotecaPageProps {
  professorId: string;
}

type LibraryTab = 'meus-arquivos' | 'institucional';

const BibliotecaPage: React.FC<BibliotecaPageProps> = ({ professorId }) => {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<LibraryTab>('meus-arquivos');
  
  // Upload states
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadPastaId, setUploadPastaId] = useState<string | null>(null);

  // Preview state
  const [previewDoc, setPreviewDoc] = useState<LibraryDocument | null>(null);

  const handleUploadSubmit = async (uploadData: any) => {
    // Force the teacherId to be the logged-in professor's ID
    const docData = {
      ...uploadData,
      teacherId: professorId,
      authorName: sessionStorage.getItem('logged_user_name') || 'Professor'
    };
    await bibliotecaService.uploadDocument(docData);
    queryClient.invalidateQueries({ queryKey: ['library-documents'] });
  };

  const handleOpenUpload = (pastaId: string | null) => {
    setUploadPastaId(pastaId);
    setIsUploadOpen(true);
  };

  const handleOpenPreview = (doc: LibraryDocument) => {
    setPreviewDoc(doc);
    bibliotecaService.incrementAcessos(doc.id);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn min-h-[600px] pb-12 space-y-8 text-xs font-sans">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b border-slate-100 pb-6">
        <div>
          <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="text-purple-600" />
            Biblioteca Pedagógica
          </h2>
          <p className="text-xs text-slate-450 font-medium">Gerencie apostilas e planos de aula ou acesse manuais institucionais.</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white p-1.5 rounded-[2rem] border border-slate-150 shadow-sm flex gap-1 w-full max-w-md">
          <button
              onClick={() => setActiveTab('meus-arquivos')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  activeTab === 'meus-arquivos' 
                  ? 'bg-purple-600 text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
              <Folder size={14} /> Meus Arquivos
          </button>
          <button
              onClick={() => setActiveTab('institucional')}
              className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-wider transition-all ${
                  activeTab === 'institucional' 
                  ? 'bg-[#001a33] text-white shadow-md' 
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
          >
              <Lock size={14} /> Manuais da Instituição
          </button>
      </div>

      {/* Content Area */}
      <div className="min-h-[450px]">
        {activeTab === 'meus-arquivos' ? (
          <div className="space-y-4">
            <div className="bg-purple-50/50 border border-purple-100 p-5 rounded-[2rem] flex items-center gap-4 shadow-sm mb-4">
              <div className="p-3 bg-purple-100 text-purple-750 rounded-2xl">
                <Sparkles size={20} className="text-purple-700" />
              </div>
              <div>
                <h4 className="font-black text-purple-900 uppercase">Meu Repositório de Aula</h4>
                <p className="text-[11px] font-medium text-slate-600 leading-normal">
                  Nesta aba você tem total controle sobre seus arquivos. Crie subpastas, faça uploads e gerencie as regras de liberação para seus alunos.
                </p>
              </div>
            </div>

            <FileExplorer 
              teacherId={professorId} 
              onPreviewClick={handleOpenPreview}
              onNewUploadClick={handleOpenUpload}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-blue-50/40 border border-blue-100 p-5 rounded-[2rem] flex items-center gap-4 shadow-sm mb-4">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
                <FileText size={20} />
              </div>
              <div>
                <h4 className="font-black text-blue-900 uppercase">Documentos Compartilhados pela Gestão</h4>
                <p className="text-[11px] font-medium text-slate-600 leading-normal">
                  Manuais de docente, calendário letivo de exames e normativas pedagógicas disponibilizadas pela coordenação. (Apenas Leitura)
                </p>
              </div>
            </div>

            <FileExplorer 
              teacherId={null} 
              readOnly={true}
              allowedAudiences={['PROFESSORES', 'TODOS']}
              onPreviewClick={handleOpenPreview}
            />
          </div>
        )}
      </div>

      {/* Upload Modal Wrapper */}
      <UploadModal 
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUpload={handleUploadSubmit}
        pastaId={uploadPastaId}
        teacherId={professorId}
      />

      {/* Quick Preview Modal Wrapper */}
      <QuickPreviewModal 
        isOpen={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        document={previewDoc}
      />

    </div>
  );
};

export default BibliotecaPage;
