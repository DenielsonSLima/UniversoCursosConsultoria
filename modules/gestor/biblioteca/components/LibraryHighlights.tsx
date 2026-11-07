import React from 'react';
import { Award, Calendar, Clock, Eye } from 'lucide-react';
import type { LibraryDocument } from '../biblioteca.types';

interface LibraryHighlightsProps {
  topAccessed: LibraryDocument[];
  topRecent: LibraryDocument[];
  isTopLoading: boolean;
  isRecentLoading: boolean;
  getFileIcon: (type: string) => React.ReactNode;
  handleOpenPreview: (document: LibraryDocument) => void;
}

const LibraryHighlights: React.FC<LibraryHighlightsProps> = ({
  topAccessed, topRecent, isTopLoading, isRecentLoading, getFileIcon, handleOpenPreview,
}) => (
          <div className="biblioteca-highlights grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fadeIn">
            
            {/* Top 10 Mais Acessados */}
            <div className="biblioteca-highlight-panel bg-white p-6 rounded-[2.5rem] border border-slate-150 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                  <Award size={18} className="text-amber-500" /> Mais Acessados (Top 10)
                </h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Materiais mais consultados pelos estudantes e docentes.</p>
              </div>

              <div className="space-y-3">
                {isTopLoading ? (
                  <div className="py-10 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">Carregando acessos...</div>
                ) : topAccessed.length > 0 ? (
                  topAccessed.map((doc, idx) => (
                    <div 
                      key={doc.id}
                      className="biblioteca-highlight-row p-3.5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 truncate mr-4">
                        <span className="text-xs font-black text-slate-350 w-4">{idx + 1}</span>
                        {getFileIcon(doc.fileType)}
                        <div className="truncate">
                          <p className="text-xs font-bold text-[#001a33] truncate">{doc.title}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{doc.size} • Autor: {doc.authorName}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-black text-slate-550 text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Eye size={10} className="text-blue-500" /> {doc.acessos} views
                        </span>
                        <button 
                          onClick={() => handleOpenPreview(doc)}
                          className="p-2 text-slate-450 hover:text-blue-650 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all shrink-0"
                          title="Visualização Rápida"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase border border-dashed border-slate-200 rounded-[2.5rem]">
                    Nenhum documento acessado ainda.
                  </div>
                )}
              </div>
            </div>

            {/* Top 10 Últimos Enviados */}
            <div className="biblioteca-highlight-panel bg-white p-6 rounded-[2.5rem] border border-slate-150 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-black text-[#001a33] uppercase tracking-tight flex items-center gap-2">
                  <Clock size={18} className="text-blue-500" /> Últimos Enviados (Top 10)
                </h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase mt-1">Materiais publicados recentemente no acervo.</p>
              </div>

              <div className="space-y-3">
                {isRecentLoading ? (
                  <div className="py-10 text-center text-slate-400 text-xs font-bold uppercase animate-pulse">Carregando recentes...</div>
                ) : topRecent.length > 0 ? (
                  topRecent.map((doc, idx) => (
                    <div 
                      key={doc.id}
                      className="biblioteca-highlight-row p-3.5 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-white hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3 truncate mr-4">
                        <span className="text-xs font-black text-slate-350 w-4">{idx + 1}</span>
                        {getFileIcon(doc.fileType)}
                        <div className="truncate">
                          <p className="text-xs font-bold text-[#001a33] truncate">{doc.title}</p>
                          <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                            {doc.size} • Enviado em: {new Date(doc.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Calendar size={10} className="text-emerald-500" /> Recente
                        </span>
                        <button 
                          onClick={() => handleOpenPreview(doc)}
                          className="p-2 text-slate-450 hover:text-blue-650 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-all shrink-0"
                          title="Visualização Rápida"
                        >
                          <Eye size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs font-bold uppercase border border-dashed border-slate-200 rounded-[2.5rem]">
                    Nenhum documento recente publicado.
                  </div>
                )}
              </div>
            </div>

          </div>
);

export default LibraryHighlights;
