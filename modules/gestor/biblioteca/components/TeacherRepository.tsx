// File: modules/gestor/biblioteca/components/TeacherRepository.tsx

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Folder, ChevronRight, User, ArrowLeft } from 'lucide-react';
import { bibliotecaService } from '../biblioteca.service';
import { TeacherRepository, LibraryDocument } from '../biblioteca.types';
import FileExplorer from './FileExplorer';

interface TeacherRepositoryListProps {
  onPreviewClick: (doc: LibraryDocument) => void;
  onNewUploadClick: (pastaId: string | null, teacherId: string | null) => void;
}

const TeacherRepositoryList: React.FC<TeacherRepositoryListProps> = ({ 
  onPreviewClick,
  onNewUploadClick 
}) => {
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherRepository | null>(null);

  // Fetch teachers list dynamically
  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ['library-teacher-repositories'],
    queryFn: () => bibliotecaService.getTeacherRepositories()
  });

  if (isLoading) return <div className="p-8 text-center text-slate-500">Carregando bibliotecas dos docentes...</div>;

  // If a teacher is selected, render their FileExplorer
  if (selectedTeacher) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSelectedTeacher(null)}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-250 transition-all"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h3 className="text-lg font-black text-[#001a33] uppercase">Biblioteca de: {selectedTeacher.teacherName}</h3>
            <p className="text-xs text-slate-400 font-bold uppercase">{selectedTeacher.specialty}</p>
          </div>
        </div>

        <FileExplorer 
          teacherId={selectedTeacher.teacherId} 
          onPreviewClick={onPreviewClick}
          onNewUploadClick={(pastaId) => onNewUploadClick(pastaId, selectedTeacher.teacherId)}
        />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Information Banner */}
      <div className="mb-6 bg-purple-50 border border-purple-100 p-6 rounded-[2rem] flex items-center gap-4 shadow-sm">
        <div className="p-3.5 bg-purple-100 text-purple-700 rounded-2xl">
            <Users size={24} />
        </div>
        <div>
            <h3 className="text-lg font-black text-purple-900 uppercase">Bibliotecas dos Professores</h3>
            <p className="text-xs font-medium text-purple-700 leading-relaxed">
                Acesse e gerencie o conteúdo individual disponibilizado por cada docente. Novos acessos criados como Professor ganham uma pasta automaticamente.
            </p>
        </div>
      </div>

      {/* Teachers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teachers.map((teacher) => (
            <div 
              key={teacher.teacherId} 
              onClick={() => setSelectedTeacher(teacher)}
              className="bg-white p-6 rounded-3xl border border-slate-150 hover:shadow-xl hover:border-purple-200 transition-all cursor-pointer group relative overflow-hidden flex flex-col justify-between"
            >
                <div className="flex items-center gap-4 mb-6">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm text-slate-400 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors shrink-0">
                        <User size={20} />
                    </div>
                    <div className="truncate">
                        <h4 className="font-bold text-[#001a33] text-sm truncate">{teacher.teacherName}</h4>
                        <p className="text-xs text-slate-400 font-bold uppercase truncate">{teacher.specialty}</p>
                    </div>
                </div>
                
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 bg-slate-50 p-3.5 rounded-2xl group-hover:bg-purple-50 group-hover:text-purple-700 transition-all duration-350 mt-auto">
                    <div className="flex items-center gap-2">
                        <Folder size={14} />
                        {teacher.documentsCount} Arquivos
                    </div>
                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </div>
            </div>
        ))}

        {teachers.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-405 border border-dashed border-slate-200 rounded-[2rem] text-xs font-bold uppercase">
            Nenhum professor ativo cadastrado no sistema.
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherRepositoryList;
