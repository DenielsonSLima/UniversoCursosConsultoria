// File: modules/gestor/biblioteca/components/UploadModal.tsx

import React, { useState, useEffect } from 'react';
import './biblioteca-upload.css';
import { createPortal } from 'react-dom';
import { X, Upload, Lock, Check, Calendar, ArrowLeft, ArrowRight, ClipboardCheck } from 'lucide-react';
import { TargetAudience, Scope } from '../biblioteca.types';
import { polosService } from '../../configuracoes/polos/polos.service';
import { bibliotecaService } from '../biblioteca.service';
import {
  detectLibraryFileType,
  getFileExtension
} from './file-preview/filePreview.utils';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: any) => void;
  pastaId: string | null;
  teacherId: string | null;
  restrictToTeacherScope?: boolean;
}

import type { WizardStep, AccessMode, AvailabilityMode } from './uploadWizard.types';
import { getUploadAccessOptions } from './uploadWizard.options';
import { UploadFilePreview } from './UploadWizardPreviews';
import UploadWizardSteps from './UploadWizardSteps';

const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUpload,
  pastaId,
  teacherId,
  restrictToTeacherScope = false
}) => {
  const [polos, setPolos] = useState<any[]>([]);
  const [cursos, setCursos] = useState<any[]>([]);
  const [turmas, setTurmas] = useState<any[]>([]);

  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [accessMode, setAccessMode] = useState<AccessMode>('ALUNOS');
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>('FREE');
  const [filePreviewUrl, setFilePreviewUrl] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetAudience: 'ALUNOS' as TargetAudience,
    scope: 'GLOBAL' as Scope,
    poloId: '',
    file: null as File | null
  });

  const [selectedCursos, setSelectedCursos] = useState<string[]>([]);
  const [selectedTurmas, setSelectedTurmas] = useState<string[]>([]);
  const [liberacaoTipo, setLiberacaoTipo] = useState<'IMEDIATO' | 'POR_DATA' | 'DISCIPLINA_INICIO'>('IMEDIATO');
  const [liberacaoData, setLiberacaoData] = useState('');
  const [liberacaoDataFim, setLiberacaoDataFim] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [searchCurso, setSearchCurso] = useState('');
  const [searchTurma, setSearchTurma] = useState('');
  const isProfessorUpload = Boolean(restrictToTeacherScope && teacherId);

  useEffect(() => {
    polosService.getAll().then(setPolos);
    if (isProfessorUpload && teacherId) {
      bibliotecaService.getTeacherActiveTurmas(teacherId).then((teacherTurmas) => {
        setTurmas(teacherTurmas);
        const cursoIds = Array.from(new Set(teacherTurmas.map((turma: any) => turma.curso_id).filter(Boolean)));
        if (cursoIds.length === 0) {
          setCursos([]);
          return;
        }
        bibliotecaService.getCursos().then((allCursos) => {
          setCursos(allCursos.filter((curso: any) => cursoIds.includes(curso.id)));
        });
      });
      return;
    }

    bibliotecaService.getCursos().then(setCursos);
    bibliotecaService.getTurmas().then(setTurmas);
  }, [teacherId, isProfessorUpload]);

  useEffect(() => {
    if (isOpen) {
      setValidationError('');
      setCurrentStep(0);
      setAccessMode(isProfessorUpload ? 'PRIVADO' : 'ALUNOS');
      setAvailabilityMode('FREE');
      setFormData({
        title: '',
        description: '',
        targetAudience: isProfessorUpload ? 'INTERNO' : 'ALUNOS',
        scope: 'GLOBAL',
        poloId: '',
        file: null
      });
      setSelectedCursos([]);
      setSelectedTurmas([]);
      setLiberacaoTipo('IMEDIATO');
      setLiberacaoData('');
      setLiberacaoDataFim('');
      setSearchCurso('');
      setSearchTurma('');
    }
  }, [isOpen, isProfessorUpload]);

  useEffect(() => {
    if (!formData.file) {
      setFilePreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(formData.file);
    setFilePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [formData.file]);

  if (!isOpen) return null;
  if (typeof window === 'undefined') return null;

  const steps = [
    { label: 'Arquivo', icon: Upload },
    { label: 'Acesso', icon: Lock },
    { label: 'Periodo', icon: Calendar },
    { label: 'Revisao', icon: ClipboardCheck }
  ];

  const formatSizeMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

  const detectFileType = (fileName: string) => {
    const ext = getFileExtension(fileName).toUpperCase() || 'OTHER';
    return { ext, fileType: detectLibraryFileType(fileName) };
  };

  const filteredCursos = cursos.filter(c =>
    c.nome.toLowerCase().includes(searchCurso.toLowerCase())
  );

  const filteredTurmas = turmas.filter(t => {
    const turmaNome = `${t.nome || ''} ${t.codigo || ''}`.toLowerCase();
    const matchesSearch = turmaNome.includes(searchTurma.toLowerCase());
    const matchesCourse = isProfessorUpload || selectedCursos.length === 0 || selectedCursos.includes(t.curso_id);
    return matchesSearch && matchesCourse;
  });

  const selectedCursoNames = selectedCursos.map(id => cursos.find(c => c.id === id)?.nome || id);
  const selectedTurmaNames = selectedTurmas.map(id => turmas.find(t => t.id === id)?.nome || id);
  const selectedPolo = polos.find(p => p.id === formData.poloId);
  const selectedPoloName = selectedPolo?.nome || '';
  const getPoloMeta = (polo: any) => {
    const cnpj = polo?.cnpj || 'CNPJ não informado';
    const cidade = polo?.cidade || 'Cidade não informada';
    const uf = polo?.uf || polo?.estado || 'UF';
    return `${cnpj} • ${cidade}/${uf}`;
  };

  const audienceLabels: Record<TargetAudience, string> = {
    TODOS: 'Publico para todos',
    ALUNOS: 'Somente alunos',
    PROFESSORES: 'Somente professores',
    INTERNO: 'Somente equipe interna'
  };

  const accessOptions = getUploadAccessOptions(isProfessorUpload);

  const setMode = (mode: AccessMode) => {
    setAccessMode(mode);

    const targetAudience: TargetAudience =
      mode === 'PUBLICO' ? 'TODOS' :
      mode === 'PROFESSORES' ? 'PROFESSORES' :
      mode === 'INTERNO' || mode === 'PRIVADO' ? 'INTERNO' :
      'ALUNOS';

    setFormData(prev => ({
      ...prev,
      targetAudience,
      scope: isProfessorUpload ? 'GLOBAL' : prev.scope,
      poloId: isProfessorUpload ? '' : prev.poloId
    }));

    if (mode === 'PUBLICO' || mode === 'ALUNOS' || mode === 'PROFESSORES' || mode === 'INTERNO' || mode === 'PRIVADO') {
      setSelectedCursos([]);
      setSelectedTurmas([]);
    }

    if (mode === 'CURSOS') {
      setSelectedTurmas([]);
    }
  };

  const toggleCurso = (id: string) => {
    setSelectedCursos(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const toggleTurma = (id: string) => {
    setSelectedTurmas(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError('');
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const { ext } = detectFileType(selectedFile.name);
      const allowedExtensions = ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'JPG', 'PNG', 'JPEG', 'GIF', 'WEBP'];
      if (selectedFile.size > 10 * 1024 * 1024) {
        setValidationError('Arquivo excede 10MB. Selecione um arquivo menor.');
        e.target.value = '';
        return;
      }
      if (!allowedExtensions.includes(ext)) {
        setValidationError('Formato não suportado. Use PDF, DOC/DOCX, XLS/XLSX ou JPG/PNG/GIF/WEBP.');
        e.target.value = '';
        return;
      }
      setFormData(prev => ({
        ...prev,
        file: selectedFile,
        title: prev.title || selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.')) || selectedFile.name
      }));
    }
  };

  const setAvailability = (mode: AvailabilityMode) => {
    setAvailabilityMode(mode);
    if (mode === 'FREE') {
      setLiberacaoTipo('IMEDIATO');
      setLiberacaoData('');
      setLiberacaoDataFim('');
      return;
    }

    setLiberacaoTipo('POR_DATA');
  };

  const getPeriodDays = () => {
    if (availabilityMode !== 'PERIOD' || !liberacaoData || !liberacaoDataFim) return null;

    const start = new Date(`${liberacaoData}T00:00:00`);
    const end = new Date(`${liberacaoDataFim}T00:00:00`);
    const diff = end.getTime() - start.getTime();
    if (Number.isNaN(diff) || diff < 0) return null;

    return Math.max(1, Math.floor(diff / (24 * 60 * 60 * 1000)) + 1);
  };

  const getPeriodEndLabel = () => {
    const days = getPeriodDays();
    if (!days || !liberacaoData) return '';

    const start = new Date(`${liberacaoData}T00:00:00`);
    const end = new Date(start.getTime() + (days - 1) * 24 * 60 * 60 * 1000);
    return end.toLocaleDateString('pt-BR');
  };

  const validateStep = (step: WizardStep) => {
    if (step === 0) {
      if (!formData.file) return 'Selecione um arquivo para publicar.';
      if (!formData.title.trim()) return 'Informe o título do documento.';
    }

    if (step === 1) {
      if (formData.scope === 'POLO_ESPECIFICO' && !formData.poloId) {
        return 'Selecione o polo para esta abrangência.';
      }
      if (accessMode === 'CURSOS' && selectedCursos.length === 0) {
        return 'Selecione ao menos um curso.';
      }
      if (accessMode === 'TURMAS' && selectedTurmas.length === 0) {
        return 'Selecione ao menos uma turma.';
      }
      if (isProfessorUpload && accessMode === 'TURMAS') {
        const allowedIds = new Set(turmas.map((turma) => turma.id));
        const invalidSelection = selectedTurmas.some((turmaId) => !allowedIds.has(turmaId));
        if (invalidSelection) {
          return 'Selecione apenas turmas ativas vinculadas ao professor.';
        }
      }
    }

    if (step === 2 && availabilityMode === 'PERIOD') {
      if (!liberacaoData || !liberacaoDataFim) return 'Informe a data inicial e a data final.';
      if (!getPeriodDays()) return 'A data final precisa ser igual ou posterior à data inicial.';
    }

    return '';
  };

  const goNext = () => {
    setValidationError('');
    const validationMessage = validateStep(currentStep);
    if (validationMessage) {
      setValidationError(validationMessage);
      return;
    }

    setCurrentStep(prev => Math.min(prev + 1, 3) as WizardStep);
  };

  const goBack = () => {
    setValidationError('');
    setCurrentStep(prev => Math.max(prev - 1, 0) as WizardStep);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setValidationError('');

    for (const step of [0, 1, 2] as WizardStep[]) {
      const validationMessage = validateStep(step);
      if (validationMessage) {
        setValidationError(validationMessage);
        setCurrentStep(step);
        return;
      }
    }

    if (!formData.file) return;

    const { fileType } = detectFileType(formData.file.name);
    const poloSelected = polos.find(p => p.id === formData.poloId);
    const selectedTeacherTurmas = isProfessorUpload
      ? turmas.filter((turma) => selectedTurmas.includes(turma.id))
      : [];
    const uploadCursoIds = isProfessorUpload
      ? Array.from(new Set(selectedTeacherTurmas.map((turma) => turma.curso_id).filter(Boolean)))
      : selectedCursos;
    const uploadTurmaIds = isProfessorUpload && accessMode === 'PRIVADO'
      ? []
      : selectedTurmas;
    const parsedDiasValidade = availabilityMode === 'PERIOD'
      ? getPeriodDays()
      : null;

    setIsSubmitting(true);
    try {
      await onUpload({
        title: formData.title.trim(),
        description: formData.description.trim(),
        fileType,
        size: `${formatSizeMB(formData.file.size)} MB`,
        sizeBytes: formData.file.size,
        url: '',
        file: formData.file,
        targetAudience: isProfessorUpload && accessMode === 'PRIVADO' ? 'INTERNO' : formData.targetAudience,
        scope: isProfessorUpload ? 'GLOBAL' : formData.scope,
        poloId: isProfessorUpload || formData.scope === 'GLOBAL' ? null : formData.poloId || null,
        poloName: isProfessorUpload || formData.scope === 'GLOBAL' ? undefined : poloSelected?.nome,
        pastaId: pastaId || null,
        teacherId: teacherId || null,
        cursoIds: uploadCursoIds,
        turmaIds: uploadTurmaIds,
        disciplinaIds: [],
        enforceTeacherScope: isProfessorUpload,
        liberacaoTipo,
        liberacaoData: availabilityMode === 'PERIOD' && liberacaoData
          ? new Date(`${liberacaoData}T00:00:00`).toISOString()
          : null,
        liberacaoDisciplinaId: null,
        liberacaoDiasValidade: parsedDiasValidade
      });
      onClose();
    } catch (err) {
      setValidationError('Não foi possível publicar o documento. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="biblioteca-upload-overlay fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={() => { if (!isSubmitting) onClose(); }}></div>

      <div className="biblioteca-dialog biblioteca-upload-dialog relative bg-white rounded-[2rem] w-full max-w-5xl shadow-2xl animate-fadeIn border border-slate-100 max-h-[92vh] overflow-hidden flex flex-col">
        <div className="biblioteca-upload-header flex justify-between items-start gap-5 px-7 py-6 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Publicar Documento</h3>
            <p className="text-xs text-slate-500 font-medium">Organize o envio em etapas antes de salvar no acervo.</p>
          </div>
          <button disabled={isSubmitting} onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        {validationError && <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{validationError}</p>}
        <div className="biblioteca-upload-navigation px-7 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="biblioteca-upload-stepper grid grid-cols-4 gap-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === index;
              const isDone = currentStep > index;

              return (
                <div key={step.label} className={`biblioteca-upload-step h-12 rounded-2xl border px-3 flex items-center gap-2 transition-all ${
                  isActive
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : isDone
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-150 bg-white text-slate-400'
                }`}>
                  <span className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-blue-600 text-white' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                  }`}>
                    {isDone ? <Check size={14} /> : <Icon size={14} />}
                  </span>
                  <span className="text-[11px] font-black uppercase tracking-wider truncate">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="biblioteca-upload-content flex-1 overflow-y-auto custom-scrollbar px-7 py-6">
            <UploadWizardSteps {...{
              currentStep, formData, setFormData, handleFileChange, formatSizeMB,
              accessOptions, accessMode, setMode, isProfessorUpload, polos,
              getPoloMeta, selectedCursos, setSelectedCursos, searchCurso, setSearchCurso,
              filteredCursos, toggleCurso, selectedTurmas, setSelectedTurmas, searchTurma,
              setSearchTurma, turmas, filteredTurmas, toggleTurma, availabilityMode,
              setAvailability, liberacaoData, setLiberacaoData, liberacaoDataFim, setLiberacaoDataFim,
              audienceLabels, selectedPoloName, selectedPolo, getPeriodEndLabel, getPeriodDays,
              selectedCursoNames, selectedTurmaNames,
            }} preview={<UploadFilePreview file={formData.file} filePreviewUrl={filePreviewUrl} />} />
          </div>

          <div className="biblioteca-upload-footer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-7 py-5 border-t border-slate-100 bg-white shrink-0">
            <button
              type="button"
              onClick={currentStep === 0 ? onClose : goBack}
              className="px-5 py-3 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              {currentStep === 0 ? 'Cancelar' : <><ArrowLeft size={15} /> Voltar</>}
            </button>

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={goNext}
                className="px-6 py-3 bg-[#001a33] text-white hover:bg-blue-900 rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-lg flex items-center justify-center gap-2"
              >
                Avancar <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-7 py-3 bg-[#001a33] text-white rounded-xl font-black uppercase text-xs tracking-wider transition-colors shadow-lg flex items-center justify-center gap-2 ${
                  isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-900'
                }`}
              >
                <Upload size={16} /> {isSubmitting ? 'Enviando...' : 'Publicar Documento'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default UploadModal;
