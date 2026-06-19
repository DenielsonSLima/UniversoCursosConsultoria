// File: modules/gestor/cadastros/modelos-documentos/estagio/EstagioPage.tsx

import React, { useState } from 'react';
import { Briefcase } from 'lucide-react';
import EstagioList from './components/EstagioList';
import EstagioEditor from './components/EstagioEditor';
import EstagioQrConfig from './components/EstagioQrConfig';

const EstagioPage: React.FC = () => {
  const [selectedPolo, setSelectedPolo] = useState<any | null>(null);
  const [isConfiguringQr, setIsConfiguringQr] = useState(false);

  // Se estiver configurando QR Code
  if (isConfiguringQr) {
    return <EstagioQrConfig onBack={() => setIsConfiguringQr(false)} />;
  }

  // Se um polo foi selecionado para edição
  if (selectedPolo) {
    return (
      <EstagioEditor 
        polo={selectedPolo} 
        onBack={() => setSelectedPolo(null)} 
      />
    );
  }

  // Visualização padrão (Lista)
  return (
    <div className="animate-fadeIn">
      {/* Header Comum */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <div className="flex items-center gap-2 mb-2 text-teal-600">
                <Briefcase size={20} />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Modelos de Documentos</span>
            </div>
            <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
                Termo de Estágio
            </h2>
            <p className="text-slate-500 font-medium mt-1">
                Configure os modelos de termo de compromisso de estágio supervisionado para cada unidade.
            </p>
        </div>
      </div>

      <EstagioList 
        onSelectPolo={setSelectedPolo} 
        onConfigureQr={() => setIsConfiguringQr(true)}
      />
    </div>
  );
};

export default EstagioPage;
