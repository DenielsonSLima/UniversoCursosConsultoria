import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { polosService } from '../../../configuracoes/polos/polos.service';
import DeclaracaoEditor from '../../modelos-documentos/declaracao/components/DeclaracaoEditor';

interface DirectDocumentEditorProps {
  onBack: () => void;
  service: {
    getTemplate: (poloId: string) => Promise<any>;
    saveTemplate: (poloId: string, data: any) => Promise<boolean>;
    getQrConfig: () => Promise<any>;
    saveQrConfig: (config: any) => Promise<boolean>;
  };
  editorTitle: string;
  documentTitle: string;
  variables: Array<{ code: string; label: string }>;
  validationPrefix: string;
  enableEnrollmentSettings?: boolean;
}

const DirectDocumentEditor: React.FC<DirectDocumentEditorProps> = ({
  onBack,
  service,
  editorTitle,
  documentTitle,
  variables,
  validationPrefix,
  enableEnrollmentSettings = false,
}) => {
  const [referencePolo, setReferencePolo] = useState<any | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    polosService.getAll()
      .then((polos) => {
        if (!isMounted) return;
        const polo = polos.find((item) => item.is_matriz) || polos[0];
        if (!polo) {
          setError('Cadastre uma unidade antes de configurar este modelo.');
          return;
        }
        setReferencePolo(polo);
      })
      .catch(() => {
        if (isMounted) setError('Não foi possível carregar a unidade de referência.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
        <AlertTriangle className="mb-3 text-amber-600" size={30} />
        <p className="font-bold text-amber-900">{error}</p>
        <button
          type="button"
          onClick={onBack}
          className="mt-5 rounded-xl bg-[#001a33] px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white"
        >
          Voltar
        </button>
      </div>
    );
  }

  if (!referencePolo) {
    return (
      <div className="flex min-h-80 items-center justify-center gap-3 text-xs font-black uppercase tracking-widest text-slate-500">
        <Loader2 className="animate-spin text-blue-600" size={24} />
        Carregando editor visual...
      </div>
    );
  }

  return (
    <DeclaracaoEditor
      polo={referencePolo}
      onBack={onBack}
      service={service}
      editorTitle={editorTitle}
      documentTitle={documentTitle}
      variables={variables}
      validationPrefix={validationPrefix}
      showValidity={false}
      migrateDeclarationDefaults={false}
      scopeLabel="Todos os polos"
      enableEnrollmentSettings={enableEnrollmentSettings}
    />
  );
};

export default DirectDocumentEditor;
