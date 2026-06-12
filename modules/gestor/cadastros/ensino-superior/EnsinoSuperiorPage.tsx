
import React from 'react';
import { Building, Settings } from 'lucide-react';

const EnsinoSuperiorPage: React.FC = () => {
  return (
    <div className="animate-fadeIn">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-[#001a33] uppercase tracking-tight">
          Ensino Superior
        </h2>
        <p className="text-slate-500">Gestão de graduações e pós-graduações.</p>
      </div>
      <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 shadow-sm text-center">
         <div className="w-16 h-16 bg-blue-50 text-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Building className="animate-pulse" />
         </div>
         <p className="text-slate-500 font-medium">A área de ensino superior está sendo preparada.</p>
      </div>
    </div>
  );
};

export default EnsinoSuperiorPage;
