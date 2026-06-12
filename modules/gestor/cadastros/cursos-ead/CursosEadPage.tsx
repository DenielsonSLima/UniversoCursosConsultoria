
import React from 'react';
import { MonitorPlay, Settings } from 'lucide-react';

const CursosEadPage: React.FC = () => {
  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">
          Cursos EAD
        </h2>
        <p className="text-slate-500">Gestão de cursos na modalidade à distância.</p>
      </div>
      <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
         <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MonitorPlay className="animate-pulse" />
         </div>
         <p className="text-slate-500 font-medium">A área de cursos EAD está sendo preparada.</p>
      </div>
    </div>
  );
};

export default CursosEadPage;
