
import React, { useState, useEffect } from 'react';
import { FileText, Download, Trash2, Globe, MapPin, Lock, Users, Briefcase } from 'lucide-react';
import { LibraryDocument } from '../biblioteca.types';
import { bibliotecaService } from '../biblioteca.service';

interface InstitutionalLibraryProps {
  searchTerm: string;
  refreshTrigger: number;
}

const InstitutionalLibrary: React.FC<InstitutionalLibraryProps> = ({ searchTerm, refreshTrigger }) => {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocs();
  }, [refreshTrigger]);

  const loadDocs = async () => {
    setLoading(true);
    const data = await bibliotecaService.getInstitutionalDocuments();
    setDocuments(data);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este documento?')) {
        await bibliotecaService.deleteDocument(id);
        loadDocs();
    }
  };

  const filteredDocs = documents.filter(doc => 
    doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getFileIcon = (type: string) => {
    switch(type) {
        case 'PDF': return <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs border border-red-100">PDF</div>;
        case 'DOC': return <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">DOC</div>;
        case 'XLS': return <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs border border-emerald-100">XLS</div>;
        default: return <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center font-bold text-xs border border-slate-100">FILE</div>;
    }
  };

  const getAudienceBadge = (audience: string) => {
    switch(audience) {
        case 'ALUNOS': return <span className="flex items-center gap-1 bg-cyan-50 text-cyan-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-cyan-100"><Users size={10} /> Alunos</span>;
        case 'PROFESSORES': return <span className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-purple-100"><Briefcase size={10} /> Profs</span>;
        case 'INTERNO': return <span className="flex items-center gap-1 bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-slate-200"><Lock size={10} /> Interno</span>;
        default: return <span className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-100"><Globe size={10} /> Público</span>;
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando acervo...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-fadeIn">
      {filteredDocs.length === 0 ? (
        <div className="col-span-full py-16 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
            <FileText className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500 font-medium">Nenhum documento encontrado.</p>
        </div>
      ) : (
        filteredDocs.map((doc) => (
            <div key={doc.id} className="bg-white rounded-3xl border border-slate-100 p-5 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 group flex flex-col justify-between h-full relative overflow-hidden">
                
                {/* Header Card */}
                <div className="flex justify-between items-start mb-4">
                    {getFileIcon(doc.fileType)}
                    <div className="flex flex-col items-end gap-1">
                        {getAudienceBadge(doc.targetAudience)}
                        {doc.scope === 'GLOBAL' ? (
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                                <Globe size={10} /> Global
                            </span>
                        ) : (
                            <span className="text-[9px] text-orange-500 font-bold uppercase tracking-wider flex items-center gap-1 bg-orange-50 px-1.5 py-0.5 rounded">
                                <MapPin size={10} /> {doc.poloName}
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="mb-6">
                    <h4 className="font-bold text-[#001a33] text-sm leading-snug mb-2 line-clamp-2" title={doc.title}>
                        {doc.title}
                    </h4>
                    <p className="text-xs text-slate-500 line-clamp-2 min-h-[2.5em]">
                        {doc.description || 'Sem descrição.'}
                    </p>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                    <div className="text-[10px] text-slate-400 font-medium">
                        {new Date(doc.createdAt).toLocaleDateString('pt-BR')} • {doc.size}
                    </div>
                    <div className="flex gap-1">
                        <button className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Baixar">
                            <Download size={16} />
                        </button>
                        <button 
                            onClick={() => handleDelete(doc.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" 
                            title="Excluir"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                </div>
            </div>
        ))
      )}
    </div>
  );
};

export default InstitutionalLibrary;
