
import React, { useState, useEffect } from 'react';
import { Users, Folder, ChevronRight, User } from 'lucide-react';
import { bibliotecaService } from '../biblioteca.service';
import { TeacherRepository } from '../biblioteca.types';

const TeacherRepositoryList: React.FC = () => {
  const [teachers, setTeachers] = useState<TeacherRepository[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeachers();
  }, []);

  const loadTeachers = async () => {
    setLoading(true);
    const data = await bibliotecaService.getTeacherRepositories();
    setTeachers(data);
    setLoading(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando professores...</div>;

  return (
    <div className="animate-fadeIn">
      <div className="mb-6 bg-purple-50 border border-purple-100 p-6 rounded-3xl flex items-center gap-4">
        <div className="p-3 bg-purple-100 text-purple-700 rounded-2xl">
            <Users size={24} />
        </div>
        <div>
            <h3 className="text-lg font-bold text-purple-900">Bibliotecas dos Professores</h3>
            <p className="text-sm text-purple-700/80">
                Acesse o conteúdo individual disponibilizado por cada docente.
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teachers.map((teacher) => (
            <div key={teacher.teacherId} className="bg-white p-6 rounded-3xl border border-slate-100 hover:shadow-lg hover:border-purple-200 transition-all cursor-pointer group relative overflow-hidden">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm text-slate-400 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors">
                        <User size={24} />
                    </div>
                    <div>
                        <h4 className="font-bold text-[#001a33] text-sm">{teacher.teacherName}</h4>
                        <p className="text-xs text-slate-500">{teacher.specialty}</p>
                    </div>
                </div>
                
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 bg-slate-50 p-3 rounded-xl group-hover:bg-purple-50 group-hover:text-purple-700 transition-colors">
                    <div className="flex items-center gap-2">
                        <Folder size={14} />
                        {teacher.documentsCount} Arquivos
                    </div>
                    <ChevronRight size={14} />
                </div>
            </div>
        ))}
      </div>
    </div>
  );
};

export default TeacherRepositoryList;
