import React, { ReactNode, useEffect, useState } from 'react';
import { ArrowRight, Building2, FileText, Settings } from 'lucide-react';
import { polosService } from '../../../configuracoes/polos/polos.service';
import DeclaracaoEditor from '../declaracao/components/DeclaracaoEditor';
import DeclaracaoQrConfig from '../declaracao/components/DeclaracaoQrConfig';

interface EditableDocumentPageProps {
  title: string;
  description: string;
  documentTitle: string;
  editorTitle: string;
  icon: ReactNode;
  accent: {
    text: string;
    soft: string;
    solid: string;
    border: string;
  };
  service: {
    getTemplate: (poloId: string) => Promise<any>;
    saveTemplate: (poloId: string, data: any) => Promise<boolean>;
    getQrConfig: () => Promise<any>;
    saveQrConfig: (config: any) => Promise<boolean>;
  };
  variables: Array<{ code: string; label: string }>;
  validationPrefix: string;
  defaultValidityDays?: number;
  showValidity?: boolean;
  restrictionLabel?: string;
  modalityScope?: 'TECNICO';
}

const EditableDocumentPage: React.FC<EditableDocumentPageProps> = ({
  title,
  description,
  documentTitle,
  editorTitle,
  icon,
  accent,
  service,
  variables,
  validationPrefix,
  defaultValidityDays = 90,
  showValidity = false,
  restrictionLabel,
  modalityScope
}) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [selectedPolo, setSelectedPolo] = useState<any | null>(null);
  const [isConfiguringQr, setIsConfiguringQr] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    polosService.getAll().then((data) => {
      setPolos(data);
      if (modalityScope) {
        const matriz = data.find((polo) => polo.is_matriz) || data[0];
        if (matriz) setSelectedPolo({ ...matriz, id: modalityScope });
      }
      setLoading(false);
    });
  }, [modalityScope]);

  if (isConfiguringQr) {
    return (
      <DeclaracaoQrConfig
        service={service}
        onBack={() => setIsConfiguringQr(false)}
      />
    );
  }

  if (selectedPolo) {
    return (
      <div>
        {modalityScope && (
          <div className={`mb-5 flex items-center justify-between rounded-2xl border ${accent.border} ${accent.soft} px-5 py-4`}>
            <div>
              <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${accent.text}`}>Modelo por modalidade</p>
              <p className="mt-1 font-black text-[#001a33]">Cursos Técnicos</p>
            </div>
            <span className={`rounded-full border ${accent.border} bg-white px-3 py-1 text-[10px] font-black uppercase ${accent.text}`}>
              Único para todos os polos
            </span>
          </div>
        )}
        <DeclaracaoEditor
          polo={selectedPolo}
          onBack={() => modalityScope ? undefined : setSelectedPolo(null)}
          service={service}
          editorTitle={editorTitle}
          documentTitle={documentTitle}
          variables={variables}
          validationPrefix={validationPrefix}
          defaultValidityDays={defaultValidityDays}
          showValidity={showValidity}
          migrateDeclarationDefaults={false}
          hideBackButton={!!modalityScope}
          scopeLabel={modalityScope ? 'Cursos Técnicos' : undefined}
        />
      </div>
    );
  }

  return (
    <div className="animate-fadeIn">
      <div className="mb-8 flex flex-col md:flex-row justify-between md:items-end gap-4">
        <div>
          <div className={`flex items-center gap-2 mb-2 ${accent.text}`}>
            {icon}
            <span className="text-xs font-bold uppercase tracking-[0.2em]">Modelos de Documentos</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">{title}</h2>
            {restrictionLabel && (
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${accent.soft} ${accent.text} border ${accent.border}`}>
                {restrictionLabel}
              </span>
            )}
          </div>
          <p className="text-slate-500 font-medium mt-1">{description}</p>
        </div>

        <button
          onClick={() => setIsConfiguringQr(true)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-[#001a33] hover:text-white transition-colors border border-slate-200"
        >
          <Settings size={16} /> Configurar QR Code
        </button>
      </div>

      <div className="mb-6">
        <h3 className="text-xl font-bold text-[#001a33]">Selecione a Unidade</h3>
        <p className="text-slate-500 text-sm">Cada polo pode manter seu próprio cabeçalho, conteúdo e posicionamento.</p>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">Carregando unidades...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {polos.map((polo) => (
            <button
              key={polo.id}
              onClick={() => setSelectedPolo(polo)}
              className="group bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-blue-900/10 hover:-translate-y-1 transition-all duration-300 text-left"
            >
              <div className="flex items-start justify-between mb-6">
                <div className={`w-14 h-14 ${accent.soft} ${accent.text} rounded-2xl flex items-center justify-center border ${accent.border} transition-colors`}>
                  <Building2 size={24} />
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${polo.ativo ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                  {polo.ativo ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <h4 className="text-lg font-black text-[#001a33] mb-1 transition-colors">
                {polo.nomeFantasia}
              </h4>
              <p className="text-xs text-slate-500 font-medium mb-6">{polo.cidade} - {polo.uf}</p>

              <div className="pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <FileText size={14} /> Editar, mover e organizar
                </span>
                <ArrowRight size={16} className="text-slate-300 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EditableDocumentPage;
