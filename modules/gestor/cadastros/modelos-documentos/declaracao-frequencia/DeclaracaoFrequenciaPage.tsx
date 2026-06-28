import React, { useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import DeclaracaoList from '../declaracao/components/DeclaracaoList';
import DeclaracaoEditor from '../declaracao/components/DeclaracaoEditor';
import DeclaracaoQrConfig from '../declaracao/components/DeclaracaoQrConfig';
import { declaracaoFrequenciaService } from './declaracao-frequencia.service';

const DeclaracaoFrequenciaPage: React.FC = () => {
  const [selectedPolo, setSelectedPolo] = useState<any | null>(null);
  const [isConfiguringQr, setIsConfiguringQr] = useState(false);

  if (isConfiguringQr) {
    return (
      <DeclaracaoQrConfig
        service={declaracaoFrequenciaService}
        onBack={() => setIsConfiguringQr(false)}
      />
    );
  }

  if (selectedPolo) {
    return (
      <DeclaracaoEditor
        polo={selectedPolo}
        service={declaracaoFrequenciaService}
        editorTitle="Editor da Declaração de Frequência"
        documentTitle="Declaração de Frequência"
        validationPrefix="FREQ"
        onBack={() => setSelectedPolo(null)}
        scopeLabel="Todos os polos"
      />
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-sky-600">
          <BadgeCheck size={20} />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Modelos de Documentos</span>
        </div>
        <h2 className="text-3xl font-black uppercase tracking-tight text-[#001a33]">
          Declaração de Frequência
        </h2>
        <p className="mt-1 font-medium text-slate-500">
          Configure um modelo único; os dados do polo são preenchidos automaticamente na emissão.
        </p>
      </div>

      <DeclaracaoList
        onSelectPolo={setSelectedPolo}
        onConfigureQr={() => setIsConfiguringQr(true)}
        sharedTemplate
        sharedTitle="Declaração de Frequência"
        accent="sky"
      />
    </div>
  );
};

export default DeclaracaoFrequenciaPage;
