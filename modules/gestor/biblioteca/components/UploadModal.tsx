// File: modules/gestor/biblioteca/components/UploadModal.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  Globe,
  MapPin,
  Users,
  Lock,
  Check,
  Search,
  Calendar,
  Layers,
  FileText,
  Image as ImageIcon,
  ArrowLeft,
  ArrowRight,
  Eye,
  GraduationCap,
  UserRound,
  ClipboardCheck,
  Clock
} from 'lucide-react';
import { TargetAudience, Scope } from '../biblioteca.types';
import { polosService } from '../../configuracoes/polos/polos.service';
import { bibliotecaService } from '../biblioteca.service';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (data: any) => void;
  pastaId: string | null;
  teacherId: string | null;
  restrictToTeacherScope?: boolean;
}

type WizardStep = 0 | 1 | 2 | 3;
type AccessMode = 'PUBLICO' | 'ALUNOS' | 'PROFESSORES' | 'CURSOS' | 'TURMAS' | 'INTERNO' | 'PRIVADO';
type AvailabilityMode = 'FREE' | 'PERIOD';

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
    const ext = fileName.split('.').pop()?.toUpperCase() || 'OTHER';
    let fileType: 'PDF' | 'DOC' | 'XLS' | 'IMG' | 'OTHER' = 'OTHER';
    if (['PDF'].includes(ext)) fileType = 'PDF';
    if (['DOC', 'DOCX'].includes(ext)) fileType = 'DOC';
    if (['XLS', 'XLSX'].includes(ext)) fileType = 'XLS';
    if (['JPG', 'PNG', 'JPEG', 'GIF', 'WEBP'].includes(ext)) fileType = 'IMG';
    return { ext, fileType };
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

  const accessOptions: Array<{
    mode: AccessMode;
    title: string;
    description: string;
    icon: React.ElementType;
  }> = isProfessorUpload ? [
    {
      mode: 'PRIVADO',
      title: 'Somente para mim',
      description: 'Arquivo privado no seu repositório docente.',
      icon: Lock
    },
    {
      mode: 'TURMAS',
      title: 'Turmas vinculadas',
      description: 'Libere para alunos das turmas ativas em que você leciona.',
      icon: Layers
    }
  ] : [
    {
      mode: 'PUBLICO',
      title: 'Publico para todos',
      description: 'Disponivel para qualquer perfil permitido no portal.',
      icon: Globe
    },
    {
      mode: 'ALUNOS',
      title: 'Somente alunos',
      description: 'Todos os alunos ativos podem acessar.',
      icon: Users
    },
    {
      mode: 'PROFESSORES',
      title: 'Somente professores',
      description: 'Material restrito ao corpo docente.',
      icon: UserRound
    },
    {
      mode: 'CURSOS',
      title: 'Cursos especificos',
      description: 'Selecione um ou mais cursos.',
      icon: GraduationCap
    },
    {
      mode: 'TURMAS',
      title: 'Turmas especificas',
      description: 'Selecione uma ou mais turmas.',
      icon: Layers
    },
    {
      mode: 'INTERNO',
      title: 'Equipe interna',
      description: 'Somente gestao e usuarios internos.',
      icon: Lock
    }
  ];

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
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const { ext } = detectFileType(selectedFile.name);
      const allowedExtensions = ['PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'JPG', 'PNG', 'JPEG', 'GIF', 'WEBP'];
      if (selectedFile.size > 10 * 1024 * 1024) {
        alert('Arquivo excede 10MB. Selecione um arquivo menor.');
        e.target.value = '';
        return;
      }
      if (!allowedExtensions.includes(ext)) {
        alert('Formato não suportado. Use PDF, DOC/DOCX, XLS/XLSX ou JPG/PNG/GIF/WEBP.');
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
    const validationMessage = validateStep(currentStep);
    if (validationMessage) {
      alert(validationMessage);
      return;
    }

    setCurrentStep(prev => Math.min(prev + 1, 3) as WizardStep);
  };

  const goBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0) as WizardStep);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    for (const step of [0, 1, 2] as WizardStep[]) {
      const validationMessage = validateStep(step);
      if (validationMessage) {
        alert(validationMessage);
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
      alert('Não foi possível publicar o documento. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPreview = () => {
    if (!formData.file) {
      return (
        <div className="h-full min-h-[280px] rounded-2xl border border-dashed border-slate-250 bg-slate-50 flex flex-col items-center justify-center text-center p-6">
          <Eye size={24} className="text-slate-350 mb-3" />
          <p className="text-xs font-black uppercase tracking-wider text-slate-500">Preview do arquivo</p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xs">A visualizacao aparece assim que o upload for selecionado.</p>
        </div>
      );
    }

    const { fileType, ext } = detectFileType(formData.file.name);

    if (fileType === 'IMG' && filePreviewUrl) {
      return (
        <div className="h-full min-h-[280px] rounded-2xl border border-slate-200 bg-slate-950 overflow-hidden flex items-center justify-center">
          <img src={filePreviewUrl} alt="Preview do documento" className="w-full h-full object-contain" />
        </div>
      );
    }

    if (fileType === 'PDF' && filePreviewUrl) {
      return (
        <div className="h-full min-h-[280px] rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden">
          <object data={filePreviewUrl} type="application/pdf" className="w-full h-full min-h-[280px]">
            <div className="h-full min-h-[280px] flex items-center justify-center text-center p-6">
              <FileText size={28} className="text-red-500 mb-3" />
              <p className="text-xs font-bold text-slate-600">Preview de PDF indisponivel neste navegador.</p>
            </div>
          </object>
        </div>
      );
    }

    return (
      <div className="h-full min-h-[280px] rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center p-6">
        {fileType === 'IMG' ? <ImageIcon size={30} className="text-emerald-500 mb-3" /> : <FileText size={30} className="text-blue-500 mb-3" />}
        <p className="text-sm font-black text-[#001a33] uppercase">{ext}</p>
        <p className="text-xs font-bold text-slate-600 mt-1 max-w-xs truncate">{formData.file.name}</p>
        <p className="text-[11px] text-slate-400 mt-2">Este formato sera salvo normalmente, mas nao possui preview direto.</p>
      </div>
    );
  };

  const renderSelectionList = (
    type: 'curso' | 'turma',
    items: any[],
    selectedIds: string[],
    onToggle: (id: string) => void
  ) => (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="max-h-56 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {items.map(item => {
          const isSelected = selectedIds.includes(item.id);
          const subtitle = type === 'curso' ? item.modalidade : item.codigo;

          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onToggle(item.id)}
              className={`w-full min-h-11 text-left px-3 py-2 rounded-xl text-xs font-bold uppercase flex justify-between items-center gap-3 transition-all ${
                isSelected
                  ? type === 'curso'
                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                    : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'hover:bg-slate-50 text-slate-650 border border-transparent'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{item.nome}</span>
                {subtitle && <span className="block text-[9px] text-slate-400 font-black mt-0.5">{subtitle}</span>}
              </span>
              {isSelected && <Check size={14} className="shrink-0" />}
            </button>
          );
        })}

        {items.length === 0 && (
          <div className="py-8 text-center text-[11px] text-slate-400 font-bold uppercase">
            Nenhum resultado encontrado.
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#001a33]/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>

      <div className="relative bg-white rounded-[2rem] w-full max-w-5xl shadow-2xl animate-fadeIn border border-slate-100 max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-start gap-5 px-7 py-6 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight">Publicar Documento</h3>
            <p className="text-xs text-slate-500 font-medium">Organize o envio em etapas antes de salvar no acervo.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-50 text-slate-400 hover:text-red-500 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-7 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <div className="grid grid-cols-4 gap-2">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep === index;
              const isDone = currentStep > index;

              return (
                <div key={step.label} className={`h-12 rounded-2xl border px-3 flex items-center gap-2 transition-all ${
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
          <div className="flex-1 overflow-y-auto custom-scrollbar px-7 py-6">
            {currentStep === 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 animate-fadeIn">
                <div className="space-y-5">
                  <div className="relative group">
                    <input
                      type="file"
                      id="file-upload"
                      className="hidden"
                      onChange={handleFileChange}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
                    />
                    <label
                      htmlFor="file-upload"
                      className={`w-full min-h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all text-center px-5 ${
                        formData.file
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-400'
                      }`}
                    >
                      {formData.file ? (
                        <>
                          <div className="w-11 h-11 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                            <Check size={22} />
                          </div>
                          <p className="text-sm font-black text-[#001a33] truncate max-w-full">{formData.file.name}</p>
                          <p className="text-[10px] text-emerald-700 font-black uppercase tracking-wider mt-1">
                            {formatSizeMB(formData.file.size)} MB - Clique para trocar
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="w-11 h-11 bg-white text-slate-400 rounded-full flex items-center justify-center mb-3 shadow-sm group-hover:text-blue-500 transition-colors">
                            <Upload size={22} />
                          </div>
                          <p className="text-sm font-black text-slate-650 group-hover:text-blue-700">Selecionar arquivo</p>
                          <p className="text-[11px] text-slate-400 mt-1">PDF, DOCX, XLS, JPG, PNG ate 10MB</p>
                        </>
                      )}
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Titulo do Documento</label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700 font-medium"
                      placeholder="Ex: Calendario Academico 2026"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Descricao</label>
                    <textarea
                      className="w-full min-h-28 resize-none px-4 py-3 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-500 text-slate-700 font-medium"
                      placeholder="Breve descricao do conteudo"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                </div>

                <div>{renderPreview()}</div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {accessOptions.map(option => {
                    const Icon = option.icon;
                    const isSelected = accessMode === option.mode;

                    return (
                      <button
                        type="button"
                        key={option.mode}
                        onClick={() => setMode(option.mode)}
                        className={`min-h-28 text-left p-4 rounded-2xl border transition-all ${
                          isSelected
                            ? 'border-blue-200 bg-blue-50 shadow-sm'
                            : 'border-slate-150 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                          }`}>
                            <Icon size={18} />
                          </span>
                          {isSelected && <Check size={16} className="text-blue-600" />}
                        </div>
                        <p className="text-xs font-black text-[#001a33] uppercase tracking-wider mt-3">{option.title}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">{option.description}</p>
                      </button>
                    );
                  })}
                </div>

                {!isProfessorUpload && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                        <Globe size={12} /> Abrangencia
                      </label>
                      <select
                        className="w-full px-3 py-3 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-500 cursor-pointer font-black uppercase text-slate-650"
                        value={formData.scope}
                        onChange={(e) => setFormData({ ...formData, scope: e.target.value as Scope, poloId: '' })}
                      >
                        <option value="GLOBAL">Todos os polos</option>
                        <option value="POLO_ESPECIFICO">Polo especifico</option>
                      </select>
                    </div>

                    {formData.scope === 'POLO_ESPECIFICO' && (
                      <div className="md:col-span-2 space-y-2 animate-fadeIn">
                        <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                          <MapPin size={12} /> Polo
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {polos.map(p => {
                            const isSelected = formData.poloId === p.id;

                            return (
                              <button
                                type="button"
                                key={p.id}
                                onClick={() => setFormData({ ...formData, poloId: p.id })}
                                aria-pressed={isSelected}
                                className={`min-h-20 text-left px-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                                  isSelected
                                    ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-50 hover:border-slate-300'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-xs font-black uppercase tracking-wider truncate">
                                    {p.nome}
                                  </span>
                                  <span className="block text-[11px] font-bold text-slate-500 mt-1 truncate">
                                    {getPoloMeta(p)}
                                  </span>
                                </span>
                                {isSelected && <Check size={16} className="shrink-0 text-blue-600" />}
                              </button>
                            );
                          })}

                          {polos.length === 0 && (
                            <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-250 bg-slate-50 p-5 text-center text-[11px] font-bold uppercase text-slate-400">
                              Nenhum polo encontrado.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isProfessorUpload && accessMode === 'PRIVADO' && (
                  <div className="rounded-2xl border border-slate-150 bg-slate-50 p-5 text-xs font-bold text-slate-600 leading-relaxed">
                    Este documento ficará disponível apenas no seu repositório docente. Para liberar aos alunos, escolha a opção de turmas vinculadas.
                  </div>
                )}

                {(accessMode === 'CURSOS' || accessMode === 'TURMAS') && (
                  <div className={`grid grid-cols-1 ${isProfessorUpload ? '' : 'lg:grid-cols-2'} gap-5 animate-fadeIn`}>
                    {!isProfessorUpload && (
                      <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <GraduationCap size={14} className="text-blue-500" /> Cursos ({selectedCursos.length})
                        </label>
                        {selectedCursos.length > 0 && (
                          <button type="button" onClick={() => setSelectedCursos([])} className="text-[10px] font-black uppercase text-slate-400 hover:text-red-500">
                            Limpar
                          </button>
                        )}
                      </div>
                      <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                        <Search size={12} className="text-slate-400 mr-2 shrink-0" />
                        <input
                          type="text"
                          placeholder="Buscar curso..."
                          value={searchCurso}
                          onChange={(e) => setSearchCurso(e.target.value)}
                          className="bg-transparent border-none outline-none w-full font-medium"
                        />
                      </div>
                      {renderSelectionList('curso', filteredCursos, selectedCursos, toggleCurso)}
                    </div>
                    )}

                    {accessMode === 'TURMAS' && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                            <Layers size={14} className="text-emerald-500" /> Turmas ({selectedTurmas.length})
                          </label>
                          {selectedTurmas.length > 0 && (
                            <button type="button" onClick={() => setSelectedTurmas([])} className="text-[10px] font-black uppercase text-slate-400 hover:text-red-500">
                              Limpar
                            </button>
                          )}
                        </div>
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs">
                          <Search size={12} className="text-slate-400 mr-2 shrink-0" />
                          <input
                            type="text"
                            placeholder={isProfessorUpload ? 'Buscar turma vinculada...' : selectedCursos.length > 0 ? 'Buscar turma nos cursos selecionados...' : 'Buscar turma...'}
                            value={searchTurma}
                            onChange={(e) => setSearchTurma(e.target.value)}
                            className="bg-transparent border-none outline-none w-full font-medium"
                          />
                        </div>
                        {isProfessorUpload && turmas.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-slate-250 bg-slate-50 p-5 text-center text-[11px] font-bold uppercase text-slate-400">
                            Nenhuma turma ativa vinculada ao professor.
                          </div>
                        )}
                        {renderSelectionList('turma', filteredTurmas, selectedTurmas, toggleTurma)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setAvailability('FREE')}
                    className={`min-h-32 text-left p-5 rounded-2xl border transition-all ${
                      availabilityMode === 'FREE'
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-150 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                        availabilityMode === 'FREE' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Clock size={18} />
                      </span>
                      {availabilityMode === 'FREE' && <Check size={16} className="text-emerald-600" />}
                    </div>
                    <p className="text-sm font-black text-[#001a33] uppercase mt-4">Livre</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">Disponivel assim que for publicado, sem data final.</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAvailability('PERIOD')}
                    className={`min-h-32 text-left p-5 rounded-2xl border transition-all ${
                      availabilityMode === 'PERIOD'
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-150 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
                        availabilityMode === 'PERIOD' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <Calendar size={18} />
                      </span>
                      {availabilityMode === 'PERIOD' && <Check size={16} className="text-blue-600" />}
                    </div>
                    <p className="text-sm font-black text-[#001a33] uppercase mt-4">Periodo definido</p>
                    <p className="text-xs text-slate-500 font-medium mt-1">Escolha a data inicial e a data final de disponibilidade.</p>
                  </button>
                </div>

                {availabilityMode === 'PERIOD' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 rounded-2xl border border-blue-100 bg-blue-50/60 animate-fadeIn">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Data inicial</label>
                      <input
                        type="date"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                        value={liberacaoData}
                        onChange={(e) => setLiberacaoData(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Data final</label>
                      <input
                        type="date"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-blue-500"
                        value={liberacaoDataFim}
                        onChange={(e) => setLiberacaoDataFim(e.target.value)}
                        min={liberacaoData || undefined}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStep === 3 && (
              <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-6 animate-fadeIn">
                <div>{renderPreview()}</div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-150 p-5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Documento</p>
                    <h4 className="text-lg font-black text-[#001a33] leading-tight">{formData.title || 'Sem titulo'}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-2">{formData.description || 'Sem descricao informada.'}</p>
                    {formData.file && (
                      <p className="text-[11px] text-slate-400 font-bold uppercase mt-3">
                        {formData.file.name} - {formatSizeMB(formData.file.size)} MB
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-150 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Acesso</p>
                      <p className="text-sm font-black text-slate-800">{audienceLabels[formData.targetAudience]}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formData.scope === 'GLOBAL' ? 'Todos os polos' : selectedPoloName}
                      </p>
                      {formData.scope === 'POLO_ESPECIFICO' && selectedPolo && (
                        <p className="text-[11px] text-slate-400 font-bold mt-1">
                          {getPoloMeta(selectedPolo)}
                        </p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-150 p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Disponibilidade</p>
                      <p className="text-sm font-black text-slate-800">
                        {availabilityMode === 'FREE'
                          ? 'Livre'
                          : `${new Date(`${liberacaoData}T00:00:00`).toLocaleDateString('pt-BR')} ate ${getPeriodEndLabel()}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {availabilityMode === 'FREE' ? 'Sem restricao de periodo' : `${getPeriodDays()} dia(s) de acesso`}
                      </p>
                    </div>
                  </div>

                  {(selectedCursoNames.length > 0 || selectedTurmaNames.length > 0) && (
                    <div className="rounded-2xl border border-slate-150 p-4 space-y-3">
                      {selectedCursoNames.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Cursos selecionados</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedCursoNames.map(name => (
                              <span key={name} className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedTurmaNames.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Turmas selecionadas</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedTurmaNames.map(name => (
                              <span key={name} className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-7 py-5 border-t border-slate-100 bg-white shrink-0">
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
