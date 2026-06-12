import React, { useState } from 'react';
import { Layers, ChevronRight, BookOpen, Clock, CalendarCheck } from 'lucide-react';
import DiarioClasse from './DiarioClasse';

interface Disciplina {
  id: number;
  nome: string;
  professor: string;
  horasRealizadas: number;
  cargaHoraria: number;
}

interface Modulo {
  id: number;
  nome: string;
  disciplinas: Disciplina[];
}

const modulosMock: Modulo[] = [
  {
    id: 1,
    nome: 'Módulo 1 - Fundamentos',
    disciplinas: [
      { 
        id: 101, 
        nome: 'Anatomia e Fisiologia', 
        professor: 'Dr. Ricardo Silva', 
        horasRealizadas: 8, 
        cargaHoraria: 40
      },
      { 
        id: 102, 
        nome: 'Ética Profissional', 
        professor: 'Profa. Ana Costa', 
        horasRealizadas: 2, 
        cargaHoraria: 20
      },
    ]
  },
  {
    id: 2,
    nome: 'Módulo 2 - Procedimentos',
    disciplinas: [
      { 
        id: 201, 
        nome: 'Técnicas Básicas', 
        professor: 'Me. Carlos Mendes', 
        horasRealizadas: 0, 
        cargaHoraria: 60
      }
    ]
  }
];

const TurmaDiarios: React.FC = () => {
  const [activeModuloNome, setActiveModuloNome] = useState('');
  const [activeDisciplina, setActiveDisciplina] = useState<Disciplina | null>(null);

  const handleOpenDiario = (disciplina: Disciplina, moduloNome: string) => {
    setActiveModuloNome(moduloNome);
    setActiveDisciplina(disciplina);
  };

  const handleBack = () => {
    setActiveDisciplina(null);
  };

  if (activeDisciplina) {
    return <DiarioClasse disciplina={activeDisciplina} moduloNome={activeModuloNome} onBack={handleBack} />;
  }

  return (
    <div className="animate-fadeIn">
      <h3 className="text-lg font-bold text-[#001a33] mb-6">Diários de Classe</h3>
      
      <div className="space-y-10">
        {modulosMock.map((modulo) => (
          <div key={modulo.id} className="animate-fadeIn">
            <div className="flex items-center gap-3 mb-5 px-2">
              <div className="p-2 bg-slate-200/50 text-slate-500 rounded-lg">
                 <Layers size={16} />
              </div>
              <h4 className="font-bold text-slate-700 text-sm uppercase tracking-widest">{modulo.nome}</h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
               {modulo.disciplinas.map(disc => (
                  <div key={disc.id} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-500/5 transition-all flex flex-col group">
                     <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300">
                           <BookOpen size={24} />
                        </div>
                        <span className="px-3 py-1 bg-slate-50 text-slate-500 rounded-lg text-[10px] font-bold uppercase tracking-wider border border-slate-100">
                           {disc.horasRealizadas}H / {disc.cargaHoraria}H Realizadas
                        </span>
                     </div>
                     
                     <h5 className="font-black text-[#001a33] text-lg mb-1 leading-tight">{disc.nome}</h5>
                     <p className="text-sm font-medium text-slate-500 mb-6">Docente: <span className="text-slate-700 font-bold">{disc.professor}</span></p>
                     
                     <div className="mt-auto space-y-3">
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                           <div 
                              className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                              style={{ width: `${(disc.horasRealizadas / disc.cargaHoraria) * 100}%` }}
                           ></div>
                        </div>
                        
                        <div className="flex pt-4">
                           <button 
                              onClick={() => handleOpenDiario(disc, modulo.nome)}
                              className="w-full py-3 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
                           >
                              <BookOpen size={14} /> Acessar Diário
                           </button>
                        </div>
                     </div>
                  </div>
               ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TurmaDiarios;
