// File: modules/gestor/cadastros/components/CursoGradeCurricularDetails.tsx

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Clock, Save, 
  BookOpen, Layers, Plus, Trash2, CornerDownRight, Loader2, X, Calendar
} from 'lucide-react';
import { Curso, Modulo, Disciplina, Aula } from '../cadastros.types';
import { cadastrosService } from '../cadastros.service';
import { supabase } from '../../../../lib/supabase';

interface CursoGradeCurricularDetailsProps {
  curso: Curso;
  onBack: () => void;
  onUpdate: () => void;
}

// Configurações dinâmicas de estilo e texto por modalidade
const getModalidadeConfig = (modalidade: Curso['modalidade']) => {
  switch (modalidade) {
    case 'TECNICO':
      return {
        themeColor: 'emerald',
        textColor: 'text-emerald-600',
        bgColor: 'bg-emerald-50/50',
        borderColor: 'border-emerald-200',
        hoverBorderColor: 'hover:border-emerald-400',
        hoverBgColor: 'hover:bg-emerald-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Grade'
      };
    case 'LIVRE':
      return {
        themeColor: 'amber',
        textColor: 'text-amber-600',
        bgColor: 'bg-amber-50/50',
        borderColor: 'border-amber-200',
        hoverBorderColor: 'hover:border-amber-400',
        hoverBgColor: 'hover:bg-amber-50',
        labelDisciplina: 'Tópico',
        labelAula: 'Aula/Atividade',
        labelSave: 'Salvar Conteúdo'
      };
    case 'ESPECIALIZACAO':
      return {
        themeColor: 'rose',
        textColor: 'text-rose-600',
        bgColor: 'bg-rose-50/50',
        borderColor: 'border-rose-200',
        hoverBorderColor: 'hover:border-rose-400',
        hoverBgColor: 'hover:bg-rose-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Especialização'
      };
    case 'EAD':
      return {
        themeColor: 'purple',
        textColor: 'text-purple-600',
        bgColor: 'bg-purple-50/50',
        borderColor: 'border-purple-200',
        hoverBorderColor: 'hover:border-purple-400',
        hoverBgColor: 'hover:bg-purple-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Módulo',
        labelSave: 'Salvar Grade EAD'
      };
    case 'SUPERIOR':
      return {
        themeColor: 'blue',
        textColor: 'text-blue-800',
        bgColor: 'bg-blue-50/50',
        borderColor: 'border-blue-200',
        hoverBorderColor: 'hover:border-blue-400',
        hoverBgColor: 'hover:bg-blue-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula/Conteúdo',
        labelSave: 'Salvar Grade'
      };
    default:
      return {
        themeColor: 'slate',
        textColor: 'text-slate-600',
        bgColor: 'bg-slate-50/50',
        borderColor: 'border-slate-200',
        hoverBorderColor: 'hover:border-slate-400',
        hoverBgColor: 'hover:bg-slate-50',
        labelDisciplina: 'Disciplina',
        labelAula: 'Aula',
        labelSave: 'Salvar'
      };
  }
};

// Helper para analisar e converter preços em formato brasileiro (BRL) para float
const parseBRLPrice = (valStr: string): number | null => {
  const clean = valStr.trim();
  if (clean === '') return null;

  // Se tiver tanto ponto quanto vírgula (ex: 1.250,50 ou 1,250.50)
  if (clean.includes('.') && clean.includes(',')) {
    if (clean.indexOf('.') < clean.indexOf(',')) {
      return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
    } else {
      return parseFloat(clean.replace(/,/g, ''));
    }
  }

  // Se tiver apenas vírgula (ex: 299,90)
  if (clean.includes(',')) {
    return parseFloat(clean.replace(',', '.'));
  }

  // Se tiver apenas ponto
  if (clean.includes('.')) {
    const parts = clean.split('.');
    const lastPart = parts[parts.length - 1];
    if (lastPart.length === 2 || lastPart.length === 1) {
      return parseFloat(clean);
    } else if (lastPart.length === 3) {
      return parseFloat(clean.replace(/\./g, ''));
    }
    return parseFloat(clean);
  }

  // Apenas números (ex: 299)
  return parseFloat(clean);
};

const CursoGradeCurricularDetails: React.FC<CursoGradeCurricularDetailsProps> = ({ curso, onBack, onUpdate }) => {
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Abas e KPIs
  const [activeTab, setActiveTab] = useState<'grade' | 'turmas' | 'publico'>('grade');
  const [kpis, setKpis] = useState<{
    carga_horaria_total: number;
    carga_horaria_cadastrada: number;
    carga_horaria_restante: number;
  } | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);
  
  // Turmas vinculadas
  const [turmasVinculadas, setTurmasVinculadas] = useState<any[]>([]);
  const [loadingTurmas, setLoadingTurmas] = useState(false);

  // Configurações de publicação
  const [publicarSite, setPublicarSite] = useState(false);
  const [imagemUrl, setImagemUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [imagemDetalhe1, setImagemDetalhe1] = useState('');
  const [imagemDetalhe2, setImagemDetalhe2] = useState('');
  const [isUploadingD1, setIsUploadingD1] = useState(false);
  const [isUploadingD2, setIsUploadingD2] = useState(false);
  const [valorCurso, setValorCurso] = useState('');
  const [isSavingValor, setIsSavingValor] = useState(false);

  // Estados para inputs de novos itens
  const [newModuloName, setNewModuloName] = useState('');
  const [addingDiscToModId, setAddingDiscToModId] = useState<string | null>(null);
  const [newDiscName, setNewDiscName] = useState('');
  const [newDiscHoras, setNewDiscHoras] = useState('');
  const [newDiscTeoria, setNewDiscTeoria] = useState('');
  const [newDiscPratica, setNewDiscPratica] = useState('');
  const [newDiscEstagio, setNewDiscEstagio] = useState('');
  const [newDiscDesc, setNewDiscDesc] = useState('');

  // Obter configurações visuais com base no tipo de curso
  const config = getModalidadeConfig(curso.modalidade);

  // Carregar dados iniciais do Supabase
  useEffect(() => {
    loadGrade();
    loadKpis();
    loadTurmas();
    setPublicarSite(curso.publicar_site || false);
    setImagemUrl(curso.imagem_url || '');
    setImagemDetalhe1(curso.imagem_detalhe_1 || '');
    setImagemDetalhe2(curso.imagem_detalhe_2 || '');
    setValorCurso(curso.valor !== null && curso.valor !== undefined ? curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
  }, [curso.id, curso.publicar_site, curso.imagem_url, curso.imagem_detalhe_1, curso.imagem_detalhe_2, curso.valor]);

  const loadGrade = async () => {
    setLoading(true);
    try {
      const data = await cadastrosService.getGrade(curso.id);
      setModulos(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar grade do banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  const loadKpis = async () => {
    setLoadingKpis(true);
    try {
      const data = await cadastrosService.getCursoGradeKpis(curso.id);
      setKpis(data);
    } catch (err) {
      console.error('Erro ao buscar KPIs da grade:', err);
    } finally {
      setLoadingKpis(false);
    }
  };

  const loadTurmas = async () => {
    setLoadingTurmas(true);
    try {
      const { data, error } = await supabase
        .from('turmas')
        .select('*, polos(nome)')
        .eq('curso_id', curso.id)
        .order('codigo', { ascending: true });
        
      if (error) throw error;
      setTurmasVinculadas(data || []);
    } catch (err) {
      console.error('Erro ao buscar turmas:', err);
    } finally {
      setLoadingTurmas(false);
    }
  };

  // --- CONTROLE PÚBLICO (SITE) ---
  const handleTogglePublicarSite = async () => {
    const nextVal = !publicarSite;
    setPublicarSite(nextVal);
    try {
      await cadastrosService.updateCurso({
        ...curso,
        publicar_site: nextVal,
        imagem_url: imagemUrl || null,
        imagem_detalhe_1: imagemDetalhe1 || null,
        imagem_detalhe_2: imagemDetalhe2 || null,
        valor: parseBRLPrice(valorCurso)
      });
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar visibilidade do curso.');
      setPublicarSite(!nextVal);
    }
  };

  const handleSaveValorCurso = async (newVal: string) => {
    const parsedVal = parseBRLPrice(newVal);
    if (parsedVal !== null && isNaN(parsedVal)) {
      alert('Erro: Por favor, insira um valor numérico válido.');
      return;
    }
    setIsSavingValor(true);
    try {
      await cadastrosService.updateCurso({
        ...curso,
        publicar_site: publicarSite,
        imagem_url: imagemUrl || null,
        imagem_detalhe_1: imagemDetalhe1 || null,
        imagem_detalhe_2: imagemDetalhe2 || null,
        valor: parsedVal
      });
      setValorCurso(parsedVal !== null ? parsedVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar o preço do curso.');
    } finally {
      setIsSavingValor(false);
    }
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                resolve(file);
              }
            },
            'image/webp',
            0.8
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const uploadImageGeneric = async (file: File, target: 'capa' | 'd1' | 'd2') => {
    if (target === 'capa') setIsUploading(true);
    if (target === 'd1') setIsUploadingD1(true);
    if (target === 'd2') setIsUploadingD2(true);
    try {
      const compressedBlob = await compressImage(file);
      const compressedFile = new File([compressedBlob], `curso_${target}_${Date.now()}.webp`, {
        type: 'image/webp'
      });

      const filePath = `cursos/curso_${target}_${Date.now()}.webp`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, compressedFile, {
          cacheControl: '31536000',
          upsert: true
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      const nextUrl = urlData.publicUrl;
      
      let newCapa = imagemUrl;
      let newD1 = imagemDetalhe1;
      let newD2 = imagemDetalhe2;

      if (target === 'capa') {
        setImagemUrl(nextUrl);
        newCapa = nextUrl;
      } else if (target === 'd1') {
        setImagemDetalhe1(nextUrl);
        newD1 = nextUrl;
      } else if (target === 'd2') {
        setImagemDetalhe2(nextUrl);
        newD2 = nextUrl;
      }

      await cadastrosService.updateCurso({
        ...curso,
        publicar_site: publicarSite,
        imagem_url: newCapa || null,
        imagem_detalhe_1: newD1 || null,
        imagem_detalhe_2: newD2 || null,
        valor: parseBRLPrice(valorCurso)
      });
      onUpdate();
    } catch (err: any) {
      console.error('Erro ao fazer upload:', err);
      alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      if (target === 'capa') setIsUploading(false);
      if (target === 'd1') setIsUploadingD1(false);
      if (target === 'd2') setIsUploadingD2(false);
    }
  };

  const removeImageGeneric = async (target: 'capa' | 'd1' | 'd2') => {
    if (confirm('Tem certeza de que deseja remover esta imagem?')) {
      let newCapa = imagemUrl;
      let newD1 = imagemDetalhe1;
      let newD2 = imagemDetalhe2;

      if (target === 'capa') {
        setImagemUrl('');
        newCapa = '';
      } else if (target === 'd1') {
        setImagemDetalhe1('');
        newD1 = '';
      } else if (target === 'd2') {
        setImagemDetalhe2('');
        newD2 = '';
      }

      try {
        await cadastrosService.updateCurso({
          ...curso,
          publicar_site: publicarSite,
          imagem_url: newCapa || null,
          imagem_detalhe_1: newD1 || null,
          imagem_detalhe_2: newD2 || null,
          valor: parseBRLPrice(valorCurso)
        });
        onUpdate();
      } catch (err) {
        console.error(err);
        alert('Erro ao remover imagem.');
      }
    }
  };

  const handleUploadImagem = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImageGeneric(file, 'capa');
  };

  const handleRemoverImagem = () => {
    removeImageGeneric('capa');
  };

  const handleUploadImagemD1 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImageGeneric(file, 'd1');
  };

  const handleRemoverImagemD1 = () => {
    removeImageGeneric('d1');
  };

  const handleUploadImagemD2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadImageGeneric(file, 'd2');
  };

  const handleRemoverImagemD2 = () => {
    removeImageGeneric('d2');
  };

  // --- MÓDULOS ---
  const handleAddModulo = () => {
    if (!newModuloName.trim()) return;
    const novoModulo: Modulo = {
      id: `temp-mod-${Math.random().toString(36).substr(2, 9)}`,
      nome: newModuloName,
      disciplinas: []
    };
    setModulos(prev => [...prev, novoModulo]);
    setNewModuloName('');
  };

  const handleRemoveModulo = (moduloId: string) => {
    if (confirm('Remover este módulo e todo seu conteúdo?')) {
      setModulos(prev => prev.filter(m => m.id !== moduloId));
    }
  };

  // --- DISCIPLINAS ---
  const handleAddDisciplina = (moduloId: string) => {
    if (!newDiscName.trim()) return;
    
    let horas = 0;
    let t = 0;
    let p = 0;
    let e = 0;
    
    if (curso.modalidade === 'TECNICO') {
      t = parseInt(newDiscTeoria) || 0;
      p = parseInt(newDiscPratica) || 0;
      e = parseInt(newDiscEstagio) || 0;
      horas = t + p + e;
    } else {
      horas = parseInt(newDiscHoras) || 0;
    }

    const novaDisciplina: Disciplina = {
      id: `temp-disc-${Math.random().toString(36).substr(2, 9)}`,
      nome: newDiscName,
      cargaHoraria: horas,
      cargaHorariaTeoria: t,
      cargaHorariaPratica: p,
      cargaHorariaEstagio: e,
      descricao: newDiscDesc.trim() || undefined,
      aulas: []
    };

    setModulos(prev => prev.map(m => {
      if (m.id === moduloId) return { ...m, disciplinas: [...m.disciplinas, novaDisciplina] };
      return m;
    }));
    setNewDiscName('');
    setNewDiscHoras('');
    setNewDiscTeoria('');
    setNewDiscPratica('');
    setNewDiscEstagio('');
    setNewDiscDesc('');
    setAddingDiscToModId(null);
  };

  const handleRemoveDisciplina = (moduloId: string, disciplinaId: string) => {
    if (confirm(`Remover ${config.labelDisciplina.toLowerCase()}?`)) {
      setModulos(prev => prev.map(m => {
        if (m.id === moduloId) return { ...m, disciplinas: m.disciplinas.filter(d => d.id !== disciplinaId) };
        return m;
      }));
    }
  };

  // --- PERSISTÊNCIA ---
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Salva a grade no Supabase
      await cadastrosService.saveGrade(curso.id, modulos);
      
      // 2. Recarrega os KPIs no Postgres via RPC e notifica listagem
      await loadKpis();
      onUpdate();

      setIsSaving(false);
      alert('Grade curricular salva no Supabase com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar grade no banco de dados.');
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fadeIn">
      {/* Header Fixo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className={`p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-${config.themeColor}-600 hover:border-${config.themeColor}-200 transition-colors`}>
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-2xl font-black text-[#001a33]">
              {curso.nome}{' '}
              <span className="text-sm bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-bold ml-2">
                v{curso.versao}
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-medium max-w-xl truncate">
              {curso.descricao || 'Formação profissionalizante regulamentada.'}
            </p>
          </div>
        </div>
        
        {activeTab === 'grade' && (
          <button 
            onClick={handleSave} 
            disabled={isSaving || loading} 
            className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20 disabled:opacity-70"
          >
            <Save size={16} /> {isSaving ? 'Salvando...' : config.labelSave}
          </button>
        )}
      </div>

      {/* KPIs Cards */}
      {loadingKpis ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-2xl h-24 animate-pulse"></div>
          ))}
        </div>
      ) : kpis ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Card 1: Carga Horária Total */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carga Total do Curso</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-black text-[#001a33]">{kpis.carga_horaria_total}</span>
              <span className="text-xs font-bold text-slate-500">horas</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Definido no cadastro do curso</p>
          </div>

          {/* Card 2: Carga Horária Cadastrada */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carga Cadastrada</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-black text-emerald-600">{kpis.carga_horaria_cadastrada}</span>
              <span className="text-xs font-bold text-emerald-600">horas</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-1">Soma das disciplinas da grade</p>
          </div>

          {/* Card 3: Carga Horária Restante */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Carga Restante</span>
            <div className="flex items-baseline gap-1 mt-2">
              <span className={`text-2xl font-black ${
                kpis.carga_horaria_restante < 0 
                  ? 'text-red-500' 
                  : kpis.carga_horaria_restante === 0 
                  ? 'text-emerald-600' 
                  : 'text-amber-500'
              }`}>{kpis.carga_horaria_restante}</span>
              <span className={`text-xs font-bold ${
                kpis.carga_horaria_restante < 0 
                  ? 'text-red-500' 
                  : kpis.carga_horaria_restante === 0 
                  ? 'text-emerald-600' 
                  : 'text-amber-500'
              }`}>horas</span>
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-1">
              {kpis.carga_horaria_restante < 0 
                ? 'Excesso de horas na grade!' 
                : kpis.carga_horaria_restante === 0 
                ? 'Grade concluída e exata' 
                : 'Horas pendentes de cadastro'}
            </p>
          </div>
        </div>
      ) : null}

      {/* Tab Switcher */}
      <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-md border border-slate-200">
        <button 
          onClick={() => setActiveTab('grade')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            activeTab === 'grade' 
              ? `bg-white text-${config.themeColor}-600 shadow-sm` 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Grade Curricular
        </button>
        <button 
          onClick={() => setActiveTab('turmas')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            activeTab === 'turmas' 
              ? `bg-white text-${config.themeColor}-600 shadow-sm` 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Turmas ({turmasVinculadas.length})
        </button>
        <button 
          onClick={() => setActiveTab('publico')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            activeTab === 'publico' 
              ? `bg-white text-${config.themeColor}-600 shadow-sm` 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Público (Site)
        </button>
      </div>

      {activeTab === 'turmas' ? (
        loadingTurmas ? (
          <div className="flex justify-center items-center py-20 flex-1">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : turmasVinculadas.length === 0 ? (
          <div className="text-center py-20 bg-slate-50 rounded-[2rem] border border-dashed border-slate-300">
             <Layers className="text-slate-300 mx-auto mb-4" size={48} />
             <p className="text-slate-500 font-bold">Nenhuma turma vinculada a este curso.</p>
             <p className="text-xs text-slate-400 mt-1">Este curso pode ser excluído com segurança.</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm divide-y divide-slate-100">
            {turmasVinculadas.map((t, index) => {
              const isEven = index % 2 === 0;
              const itemBg = isEven ? 'bg-white' : `${config.bgColor}`;
              return (
                <div key={t.id} className={`${itemBg} p-5 transition-colors flex flex-col gap-3`}>
                  {/* Linha 1: Código + Nome (Esquerda) e Status Badge (Direita) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono font-bold text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">
                        {t.codigo}
                      </span>
                      <span className="font-black text-slate-800 text-sm">
                        {t.nome}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                        t.status === 'EM_ANDAMENTO' 
                          ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                          : 'bg-slate-50 text-slate-600 border border-slate-200'
                      }`}>
                        {t.status === 'EM_ANDAMENTO' ? 'Em Andamento' : 'Finalizada'}
                      </span>
                    </div>
                  </div>

                  {/* Linha 2: Polo, Turno, Período (Esquerda) e Vagas (Direita) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100/50 text-xs text-slate-500 font-medium">
                    <div className="flex items-center gap-4 flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="font-bold text-slate-400">Polo:</span>{' '}
                        <span className="text-slate-700 font-bold">{t.polos?.nome || 'Matriz'}</span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1">
                        <span className="font-bold text-slate-400">Turno:</span>{' '}
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[10px]">
                          {t.turno}
                        </span>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1">
                        <span className="font-bold text-slate-400">Período:</span>{' '}
                        <span className="text-slate-600 font-bold">
                          {t.data_inicio ? new Date(t.data_inicio).toLocaleDateString('pt-BR') : '-'} até{' '}
                          {t.data_previsao_termino ? new Date(t.data_previsao_termino).toLocaleDateString('pt-BR') : '-'}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1 rounded-xl border border-slate-100 w-fit">
                      <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider">Vagas:</span>
                      <span className="text-sm font-black text-slate-700">{t.vagas_totais}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : activeTab === 'publico' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-20 animate-fadeIn">
          {/* Coluna 1: Visibilidade e Upload */}
          <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm space-y-8">
            <h4 className="font-bold text-[#001a33] text-lg border-b border-slate-100 pb-4">
              Configurações de Publicação
            </h4>

            {/* Toggle de Visibilidade */}
            <div className="flex items-start justify-between gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-200">
              <div className="space-y-1">
                <span className="font-bold text-sm text-slate-800 block">Exibir no Site Público</span>
                <span className="text-xs text-slate-400 font-medium block leading-relaxed">
                  Permite que visitantes do site visualizem a grade, duração e se pré-inscrevam no curso.
                </span>
              </div>
              <button 
                onClick={handleTogglePublicarSite}
                className={`w-14 h-8 rounded-full p-1 transition-colors shrink-0 flex items-center ${
                  publicarSite ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <div 
                  className={`bg-white w-6 h-6 rounded-full shadow-md transform transition-transform ${
                    publicarSite ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Valor do Curso (Preço Comercial) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                Valor do Curso (Preço Comercial)
              </label>
              <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2 border border-slate-200 focus-within:border-blue-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <span className="text-slate-500 font-black text-sm">R$</span>
                <input 
                  type="text"
                  placeholder="Ex: 299,90 (Deixe em branco para 'Sob Consulta')"
                  className="w-full bg-transparent border-none outline-none text-sm font-bold text-slate-800 placeholder-slate-400 py-2.5"
                  value={valorCurso}
                  onChange={(e) => setValorCurso(e.target.value)}
                  onBlur={() => {
                    const parsed = parseBRLPrice(valorCurso);
                    setValorCurso(parsed !== null && !isNaN(parsed) ? parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveValorCurso(valorCurso)}
                />
                <button
                  type="button"
                  disabled={isSavingValor}
                  onClick={() => handleSaveValorCurso(valorCurso)}
                  className="px-4 py-2 bg-[#001a33] hover:bg-blue-600 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-colors shadow-sm shrink-0 disabled:opacity-70 flex items-center gap-1.5"
                >
                  {isSavingValor ? (
                    <>
                      <Loader2 className="animate-spin" size={12} />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    'Salvar'
                  )}
                </button>
              </div>
              <p className="text-[9px] text-slate-400 font-medium leading-normal">
                Insira o preço comercial para divulgação pública no site. Digite o valor com duas casas decimais e clique em Salvar (ex: 299,90). Deixe em branco para ocultar o preço no catálogo e exibir apenas o formulário de contato.
              </p>
            </div>

            {/* Upload de Capa */}
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                Imagem de Capa do Curso
              </label>
              <div className="border-2 border-dashed border-slate-200 rounded-3xl p-8 text-center bg-slate-50 flex flex-col items-center justify-center gap-4 relative overflow-hidden group hover:bg-slate-100/50 transition-colors">
                {imagemUrl ? (
                  <>
                    <img 
                      src={imagemUrl} 
                      alt="Capa do Curso" 
                      className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm animate-fadeIn"
                    />
                    <div className="flex gap-2">
                      <label className="px-4 py-2 bg-[#001a33] hover:bg-blue-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                        {isUploading ? 'Fazendo Upload...' : 'Alterar Imagem'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleUploadImagem}
                          disabled={isUploading}
                          className="hidden"
                        />
                      </label>
                      <button 
                        onClick={handleRemoverImagem}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200"
                      >
                        Remover
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-200 shadow-inner">
                      <Layers size={24} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">Selecione a imagem de capa</p>
                      <p className="text-xs text-slate-400 mt-1 font-medium">Formato recomendado 16:9</p>
                    </div>
                    <label className="px-5 py-2.5 bg-[#001a33] hover:bg-blue-900 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                      {isUploading ? 'Fazendo Upload...' : 'Selecionar Imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImagem}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                  </>
                )}
              </div>
            </div>

            {/* Imagens de Detalhes Adicionais */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                Fotos Adicionais (Galeria na Página Pública)
              </label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Foto Detalhe 1 */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Foto Adicional 1</span>
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50 flex flex-col items-center justify-center gap-2 h-44 relative overflow-hidden group hover:bg-slate-100/50 transition-colors">
                    {imagemDetalhe1 ? (
                      <>
                        <img 
                          src={imagemDetalhe1} 
                          alt="Detalhe 1" 
                          className="h-20 rounded-xl object-cover border border-slate-200 shadow-sm animate-fadeIn"
                        />
                        <div className="flex gap-1.5 mt-2">
                          <label className="px-2.5 py-1.5 bg-[#001a33] hover:bg-blue-900 text-white text-[9px] font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all">
                            {isUploadingD1 ? 'Upload...' : 'Trocar'}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleUploadImagemD1}
                              disabled={isUploadingD1}
                              className="hidden"
                            />
                          </label>
                          <button 
                            onClick={handleRemoverImagemD1}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all border border-red-200"
                          >
                            Remover
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center border border-slate-200 shadow-inner">
                          <Plus size={16} />
                        </div>
                        <label className="px-3 py-1.5 bg-[#001a33] hover:bg-blue-900 text-white text-[9px] font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all mt-2">
                          {isUploadingD1 ? 'Upload...' : 'Adicionar Foto'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleUploadImagemD1}
                            disabled={isUploadingD1}
                            className="hidden"
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>

                {/* Foto Detalhe 2 */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Foto Adicional 2</span>
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50 flex flex-col items-center justify-center gap-2 h-44 relative overflow-hidden group hover:bg-slate-100/50 transition-colors">
                    {imagemDetalhe2 ? (
                      <>
                        <img 
                          src={imagemDetalhe2} 
                          alt="Detalhe 2" 
                          className="h-20 rounded-xl object-cover border border-slate-200 shadow-sm animate-fadeIn"
                        />
                        <div className="flex gap-1.5 mt-2">
                          <label className="px-2.5 py-1.5 bg-[#001a33] hover:bg-blue-900 text-white text-[9px] font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all">
                            {isUploadingD2 ? 'Upload...' : 'Trocar'}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleUploadImagemD2}
                              disabled={isUploadingD2}
                              className="hidden"
                            />
                          </label>
                          <button 
                            onClick={handleRemoverImagemD2}
                            className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[9px] font-bold uppercase tracking-wider rounded-lg transition-all border border-red-200"
                          >
                            Remover
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center border border-slate-200 shadow-inner">
                          <Plus size={16} />
                        </div>
                        <label className="px-3 py-1.5 bg-[#001a33] hover:bg-blue-900 text-white text-[9px] font-bold uppercase tracking-wider rounded-lg cursor-pointer transition-all mt-2">
                          {isUploadingD2 ? 'Upload...' : 'Adicionar Foto'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleUploadImagemD2}
                            disabled={isUploadingD2}
                            className="hidden"
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Coluna 2: Preview do Card */}
          <div className="space-y-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
              Visualização Prévia (Site Público)
            </label>
            
            <div className="max-w-sm mx-auto w-full bg-white border border-slate-200 rounded-[2rem] p-6 shadow-md flex flex-col justify-between min-h-[380px]">
              <div>
                {/* Imagem de Capa do Curso */}
                <div className="h-40 w-full bg-slate-50 rounded-2xl overflow-hidden mb-4 border border-slate-100 shrink-0 flex items-center justify-center">
                  {imagemUrl ? (
                    <img src={imagemUrl} alt={curso.nome} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Sem Imagem de Capa</span>
                  )}
                </div>

                {/* Logo do Parceiro e Badge */}
                <div className="flex justify-between items-center gap-4 mb-4">
                  <div className="h-9 w-24 bg-slate-50 border border-slate-100 rounded-xl p-1.5 flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src="/LogoUniverso.png"
                      alt="Universo"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-md uppercase tracking-wider">
                    {curso.area || 'Saúde'}
                  </span>
                </div>

                {/* Nome do Curso */}
                <h3 className="text-base font-black text-[#001a33] leading-snug mb-1">
                  {curso.nome}
                </h3>

                {/* Descrição */}
                <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-medium">
                  {curso.descricao || 'Formação profissionalizante de alto nível.'}
                </p>
              </div>

              {/* Informações comerciais */}
              <div className="flex items-center gap-3 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl mt-4">
                <Clock size={14} className="text-emerald-500" />
                <span className="font-bold">{curso.carga_horaria}h</span>
                <span className="text-slate-300">|</span>
                <Calendar size={14} className="text-blue-500" />
                <span className="font-bold">{(curso as any).duracao_meses || (curso.carga_horaria >= 1200 ? 24 : 18)} Meses</span>
              </div>

              {(() => {
                const normalized = valorCurso.replace(/\./g, '').replace(',', '.').trim();
                const parsedVal = normalized === '' ? 0 : parseFloat(normalized);
                return parsedVal > 0 ? (
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Investimento</span>
                    <div className="bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full flex items-center gap-1 shadow-sm">
                      <span className="text-[8px] text-emerald-800 font-bold uppercase tracking-wider">A partir de</span>
                      <span className="text-xs font-black text-emerald-600">
                        R$ {parsedVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        </div>
      ) : (
        loading ? (
          <div className="flex justify-center items-center py-20 flex-1">
            <Loader2 className="animate-spin text-blue-600" size={32} />
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-8 pb-20">
            {/* Renderização dos Módulos */}
            {modulos.map((modulo) => (
              <div key={modulo.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
                
                {/* Header do Módulo */}
                <div className={`${config.bgColor} px-6 py-4 border-b border-slate-100 flex justify-between items-center`}>
                  <div className="flex items-center gap-3">
                    <div className={`p-2 bg-white rounded-lg ${config.textColor} border border-slate-100 shadow-sm`}>
                      <Layers size={18} />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#001a33]">{modulo.nome}</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                        {modulo.disciplinas.length} {modulo.disciplinas.length === 1 ? config.labelDisciplina : config.labelDisciplina + 's'} • {modulo.disciplinas.reduce((acc, d) => acc + d.cargaHoraria, 0)}h Totais
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleRemoveModulo(modulo.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Lista de Disciplinas/Tópicos do Módulo */}
                <div className="p-4 space-y-4">
                  {modulo.disciplinas.length === 0 && (
                    <div className="text-center py-6 text-slate-400 text-xs uppercase">Nenhuma {config.labelDisciplina.toLowerCase()} neste módulo</div>
                  )}

                  {modulo.disciplinas.map((disc) => (
                    <div key={disc.id} className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow bg-slate-50/30">
                      {/* Cabeçalho da Disciplina */}
                      <div className="px-5 py-4 flex justify-between items-center">
                        <div className="flex flex-col text-slate-700">
                          <div className="flex items-center gap-2">
                            <BookOpen size={16} className={config.textColor} />
                            <span className="font-bold text-sm">{disc.nome}</span>
                          </div>
                          {curso.modalidade === 'TECNICO' && (
                            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase tracking-wider pl-6 mt-1.5">
                              <span>Teoria: <strong className="text-slate-700">{disc.cargaHorariaTeoria || 0}h</strong></span>
                              <span>•</span>
                              <span>Prática: <strong className="text-slate-700">{disc.cargaHorariaPratica || 0}h</strong></span>
                              <span>•</span>
                              <span>Estágio: <strong className="text-slate-700">{disc.cargaHorariaEstagio || 0}h</strong></span>
                            </div>
                          )}
                          {disc.descricao && (
                            <p className="text-xs text-slate-400 font-medium pl-6 mt-1">
                              {disc.descricao}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            {curso.modalidade === 'TECNICO' ? (
                              <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-2xl border border-slate-200 shadow-sm">
                                <div className="flex flex-col items-center">
                                  <span className="text-[9px] font-black text-slate-400 select-none">T</span>
                                  <input 
                                    type="number"
                                    title="Teoria"
                                    className="w-10 text-center text-xs font-black text-[#001a33] outline-none"
                                    value={disc.cargaHorariaTeoria || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      setModulos(prev => prev.map(m => {
                                        if (m.id === modulo.id) {
                                          return {
                                            ...m,
                                            disciplinas: m.disciplinas.map(d => {
                                              if (d.id === disc.id) {
                                                const newT = val;
                                                const newP = d.cargaHorariaPratica || 0;
                                                const newE = d.cargaHorariaEstagio || 0;
                                                return { 
                                                  ...d, 
                                                  cargaHorariaTeoria: newT,
                                                  cargaHoraria: newT + newP + newE 
                                                };
                                              }
                                              return d;
                                            })
                                          };
                                        }
                                        return m;
                                      }));
                                    }}
                                  />
                                </div>
                                <span className="text-slate-300 font-bold select-none">|</span>
                                <div className="flex flex-col items-center">
                                  <span className="text-[9px] font-black text-slate-400 select-none">P</span>
                                  <input 
                                    type="number"
                                    title="Prática"
                                    className="w-10 text-center text-xs font-black text-[#001a33] outline-none"
                                    value={disc.cargaHorariaPratica || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      setModulos(prev => prev.map(m => {
                                        if (m.id === modulo.id) {
                                          return {
                                            ...m,
                                            disciplinas: m.disciplinas.map(d => {
                                              if (d.id === disc.id) {
                                                const newT = d.cargaHorariaTeoria || 0;
                                                const newP = val;
                                                const newE = d.cargaHorariaEstagio || 0;
                                                return { 
                                                  ...d, 
                                                  cargaHorariaPratica: newP,
                                                  cargaHoraria: newT + newP + newE 
                                                };
                                              }
                                              return d;
                                            })
                                          };
                                        }
                                        return m;
                                      }));
                                    }}
                                  />
                                </div>
                                <span className="text-slate-300 font-bold select-none">|</span>
                                <div className="flex flex-col items-center">
                                  <span className="text-[9px] font-black text-slate-400 select-none">E</span>
                                  <input 
                                    type="number"
                                    title="Estágio"
                                    className="w-10 text-center text-xs font-black text-[#001a33] outline-none"
                                    value={disc.cargaHorariaEstagio || 0}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value) || 0;
                                      setModulos(prev => prev.map(m => {
                                        if (m.id === modulo.id) {
                                          return {
                                            ...m,
                                            disciplinas: m.disciplinas.map(d => {
                                              if (d.id === disc.id) {
                                                const newT = d.cargaHorariaTeoria || 0;
                                                const newP = d.cargaHorariaPratica || 0;
                                                const newE = val;
                                                return { 
                                                  ...d, 
                                                  cargaHorariaEstagio: newE,
                                                  cargaHoraria: newT + newP + newE 
                                                };
                                              }
                                              return d;
                                            })
                                          };
                                        }
                                        return m;
                                      }));
                                    }}
                                  />
                                </div>
                                <span className="text-slate-300 font-bold select-none">|</span>
                                <div className="flex flex-col items-center bg-[#001a33] text-white px-2 py-0.5 rounded-lg select-none">
                                  <span className="text-[7px] font-black uppercase tracking-widest text-slate-300">Total</span>
                                  <span className="text-xs font-black">{disc.cargaHoraria || 0}h</span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <input 
                                  type="number"
                                  title="Carga Horária"
                                  className="w-16 text-center text-xs font-bold text-[#001a33] bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                                  value={disc.cargaHoraria || 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setModulos(prev => prev.map(m => {
                                      if (m.id === modulo.id) {
                                        return {
                                          ...m,
                                          disciplinas: m.disciplinas.map(d => {
                                            if (d.id === disc.id) {
                                              return { ...d, cargaHoraria: val };
                                            }
                                            return d;
                                          })
                                        };
                                      }
                                      return m;
                                    }));
                                  }}
                                />
                                <span className="text-xs font-bold text-slate-400">h</span>
                              </>
                            )}
                          </div>
                          <button onClick={() => handleRemoveDisciplina(modulo.id, disc.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Adicionar Disciplina ao Módulo */}
                  <div className="mt-4 pt-4 border-t border-slate-100 border-dashed">
                    {addingDiscToModId === modulo.id ? (
                      <div className="flex flex-col gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <input 
                            autoFocus
                            type="text" 
                            placeholder={`Nome da Nova ${config.labelDisciplina} *`}
                            className="flex-grow px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold animate-fadeIn"
                            value={newDiscName}
                            onChange={(e) => setNewDiscName(e.target.value)}
                          />
                          {curso.modalidade === 'TECNICO' ? (
                            <div className="flex gap-2">
                              <input 
                                type="number" 
                                placeholder="Teoria (T) *"
                                className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold text-center"
                                value={newDiscTeoria}
                                onChange={(e) => setNewDiscTeoria(e.target.value)}
                              />
                              <input 
                                type="number" 
                                placeholder="Prática (P) *"
                                className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold text-center"
                                value={newDiscPratica}
                                onChange={(e) => setNewDiscPratica(e.target.value)}
                              />
                              <input 
                                type="number" 
                                placeholder="Estágio (E) *"
                                className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-xs font-bold text-center"
                                value={newDiscEstagio}
                                onChange={(e) => setNewDiscEstagio(e.target.value)}
                              />
                            </div>
                          ) : (
                            <input 
                              type="number" 
                              placeholder="Horas *"
                              className="w-24 px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm font-bold text-center"
                              value={newDiscHoras}
                              onChange={(e) => setNewDiscHoras(e.target.value)}
                            />
                          )}
                        </div>
                        <input 
                          type="text" 
                          placeholder={`Descrição da ${config.labelDisciplina} (Opcional)`}
                          className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 text-sm"
                          value={newDiscDesc}
                          onChange={(e) => setNewDiscDesc(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddDisciplina(modulo.id); }}
                        />
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => handleAddDisciplina(modulo.id)} className="px-4 py-2 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase hover:bg-blue-900">
                            Adicionar
                          </button>
                          <button onClick={() => setAddingDiscToModId(null)} className="px-3 py-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-200 text-xs font-bold uppercase">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setAddingDiscToModId(modulo.id)}
                        className={`w-full py-2 border border-dashed border-slate-300 rounded-xl text-slate-400 text-xs font-bold uppercase ${config.hoverBorderColor} ${config.textColor} ${config.hoverBgColor} transition-all flex items-center justify-center gap-2`}
                      >
                        <Plus size={14} /> Nova {config.labelDisciplina} neste Módulo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Criar Novo Módulo */}
            <div className="bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200 p-6 flex items-center justify-center gap-3">
              <input 
                type="text" 
                placeholder="Nome do Novo Módulo (Ex: Módulo III)"
                className="w-64 px-4 py-2 rounded-xl border border-slate-200 outline-none focus:border-blue-500 text-sm bg-white"
                value={newModuloName}
                onChange={(e) => setNewModuloName(e.target.value)}
              />
              <button onClick={handleAddModulo} className="px-4 py-2 bg-[#001a33] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-blue-900 transition-colors">
                <Plus size={14} /> Criar Módulo
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
};

export default CursoGradeCurricularDetails;
