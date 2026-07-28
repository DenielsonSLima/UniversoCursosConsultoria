import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { polosService } from '../../../configuracoes/polos/polos.service';
import DeclaracaoEditor from '../../modelos-documentos/declaracao/components/DeclaracaoEditor';
import {
  studentTemplatePreviewService,
  type StudentTemplatePreview,
} from '../student-template-preview.service';

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
  const [studentPreviewPool, setStudentPreviewPool] = useState<StudentTemplatePreview[]>([]);
  const [studentPreview, setStudentPreview] = useState<StudentTemplatePreview | null>(null);
  const [studentPreviewLoading, setStudentPreviewLoading] = useState(false);
  const [studentPreviewError, setStudentPreviewError] = useState('');

  useEffect(() => {
    let isMounted = true;

    polosService.getAll()
      .then((polos) => {
        if (!isMounted) return;
        const activePoloId = window.sessionStorage.getItem('current_polo_id')
          || window.sessionStorage.getItem('active_polo_id');
        const polo = polos.find(item => item.id === activePoloId)
          || polos.find(item => item.is_matriz)
          || polos[0];
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

  const choosePreviewStudent = (pool: StudentTemplatePreview[]) => {
    if (!pool.length) return null;
    if (pool.length === 1) return pool[0];
    const alternatives = pool.filter(item => item.enrollmentId !== studentPreview?.enrollmentId);
    const candidates = alternatives.length ? alternatives : pool;
    return candidates[Math.floor(Math.random() * candidates.length)];
  };

  const handleLoadStudentPreview = async () => {
    if (!referencePolo || studentPreviewLoading) return;
    setStudentPreviewLoading(true);
    setStudentPreviewError('');
    try {
      const pool = studentPreviewPool.length
        ? studentPreviewPool
        : await studentTemplatePreviewService.getPool(referencePolo);
      setStudentPreviewPool(pool);
      const selected = choosePreviewStudent(pool);
      if (!selected) {
        setStudentPreview(null);
        setStudentPreviewError('Nenhum aluno com matrícula foi encontrado nesta unidade.');
        return;
      }
      setStudentPreview(selected);
    } catch (previewError) {
      console.error('[DirectDocumentEditor] Erro ao carregar aluno para prévia:', previewError);
      setStudentPreviewError('Não foi possível carregar os dados de pré-visualização.');
    } finally {
      setStudentPreviewLoading(false);
    }
  };

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
      studentPreview={studentPreview}
      studentPreviewLoading={studentPreviewLoading}
      studentPreviewError={studentPreviewError}
      onLoadStudentPreview={() => void handleLoadStudentPreview()}
      onClearStudentPreview={() => {
        setStudentPreview(null);
        setStudentPreviewError('');
      }}
    />
  );
};

export default DirectDocumentEditor;
