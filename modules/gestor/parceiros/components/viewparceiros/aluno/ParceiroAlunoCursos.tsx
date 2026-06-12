// File: modules/gestor/parceiros/components/viewparceiros/aluno/ParceiroAlunoCursos.tsx

import React from 'react';
import { BookOpen, GraduationCap, Clock, Award } from 'lucide-react';

const ParceiroAlunoCursos: React.FC = () => {
  const cursos = [
    {
      id: '1',
      nome: 'Inglês Intermediário - B1',
      turma: 'ING-B1-T2023',
      status: 'Cursando',
      progresso: 65,
      inicio: '10/02/2023',
      previsaoFim: '15/12/2023',
    },
    {
      id: '2',
      nome: 'Espanhol Básico - A1',
      turma: 'ESP-A1-T2022',
      status: 'Concluído',
      progresso: 100,
      inicio: '05/02/2022',
      previsaoFim: '10/12/2022',
    }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Cursando': return 'bg-blue-100 text-blue-700';
      case 'Concluído': return 'bg-emerald-100 text-emerald-700';
      case 'Trancado': return 'bg-orange-100 text-orange-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-2 mb-6 text-[#001a33]">
        <BookOpen size={24} />
        <h3 className="font-black uppercase tracking-wide">Cursos do Aluno</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cursos.map((curso) => (
          <div key={curso.id} className="border border-slate-200 rounded-2xl p-6 hover:shadow-lg transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-bold text-slate-800 text-lg mb-1">{curso.nome}</h4>
                <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                  <GraduationCap size={16} />
                  <span>Turma: {curso.turma}</span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${getStatusColor(curso.status)}`}>
                {curso.status}
              </span>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Clock size={16} className="text-slate-400" />
                  <span>Início: <strong>{curso.inicio}</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Award size={16} className="text-slate-400" />
                  <span>Término: <strong>{curso.previsaoFim}</strong></span>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span className="text-slate-500 uppercase">Progresso</span>
                  <span className="text-blue-600">{curso.progresso}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className={`h-2.5 rounded-full ${curso.status === 'Concluído' ? 'bg-emerald-500' : 'bg-blue-600'}`} 
                    style={{ width: `${curso.progresso}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParceiroAlunoCursos;
