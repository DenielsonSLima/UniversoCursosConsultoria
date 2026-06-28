
// File: modules/gestor/cadastros/modelos-documentos/declaracao/DeclaracaoPage.tsx

import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import DeclaracaoList from './components/DeclaracaoList';
import DeclaracaoEditor from './components/DeclaracaoEditor';
import DeclaracaoQrConfig from './components/DeclaracaoQrConfig';

const DeclaracaoPage: React.FC = () => {
  const [selectedPolo, setSelectedPolo] = useState<any | null>(null);
  const [isConfiguringQr, setIsConfiguringQr] = useState(false);

  // Se estiver configurando QR Code
  if (isConfiguringQr) {
    return <DeclaracaoQrConfig onBack={() => setIsConfiguringQr(false)} />;
  }

  // Se um polo foi selecionado para edição
  if (selectedPolo) {
    return (
      <DeclaracaoEditor 
        polo={selectedPolo} 
        onBack={() => setSelectedPolo(null)} 
        scopeLabel="Todos os polos"
      />
    );
  }

  // Visualização padrão (Lista)
  return (
    <div className="animate-fadeIn">
      {/* Header Comum */}
      <div className="mb-8 flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
            <div className="flex items-center gap-2 mb-2 text-blue-600">
                <FileText size={20} />
                <span className="text-xs font-bold uppercase tracking-[0.2em]">Modelos de Documentos</span>
            </div>
            <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
                Declaração de Matrícula
            </h2>
            <p className="text-slate-500 font-medium mt-1">
                Configure um modelo único; os dados do polo são preenchidos automaticamente na emissão.
            </p>
        </div>
      </div>

      <DeclaracaoList 
        onSelectPolo={setSelectedPolo} 
        onConfigureQr={() => setIsConfiguringQr(true)}
        sharedTemplate
        sharedTitle="Declaração de Matrícula / Cursando"
        accent="emerald"
      />
    </div>
  );
};

export default DeclaracaoPage;
