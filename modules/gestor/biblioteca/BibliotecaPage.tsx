
import React, { useState } from 'react';
import { 
  BookOpen, 
  Search, 
  Plus, 
  LayoutGrid, 
  Users 
} from 'lucide-react';
import InstitutionalLibrary from './components/InstitutionalLibrary';
import TeacherRepositoryList from './components/TeacherRepository';
import UploadModal from './components/UploadModal';
import { bibliotecaService } from './biblioteca.service';

const BibliotecaPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'institucional' | 'professores'>('institucional');
  const [searchTerm, setSearchTerm] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUpload = async (data: any) => {
    await bibliotecaService.uploadDocument(data);
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fadeIn min-h-screen">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4 border-b border-slate-100 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2 text-blue-600">
            <BookOpen size={20} />
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Gestão Acadêmica</span>
          </div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Biblioteca Digital
          </h2>
          <p className="text-slate-500 font-medium">
            Gerenciamento de acervo, documentos e materiais didáticos.
          </p>
        </div>

        {activeTab === 'institucional' && (
            <button 
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
            >
                <Plus size={16} /> Novo Documento
            </button>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
        <div className="bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm flex gap-1 w-full md:w-auto">
            <button
                onClick={() => setActiveTab('institucional')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === 'institucional' 
                    ? 'bg-[#001a33] text-white shadow-lg' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
            >
                <LayoutGrid size={16} /> Acervo Institucional
            </button>
            <button
                onClick={() => setActiveTab('professores')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    activeTab === 'professores' 
                    ? 'bg-purple-600 text-white shadow-lg' 
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
            >
                <Users size={16} /> Bibliotecas dos Professores
            </button>
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-80 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
            <input 
                type="text" 
                placeholder="Pesquisar documentos..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-sm font-medium transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-[500px]">
        {activeTab === 'institucional' ? (
            <InstitutionalLibrary 
                searchTerm={searchTerm} 
                refreshTrigger={refreshTrigger} 
            />
        ) : (
            <TeacherRepositoryList />
        )}
      </div>

      {/* Modal Upload */}
      <UploadModal 
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUpload}
      />

    </div>
  );
};

export default BibliotecaPage;
