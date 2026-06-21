// File: modules/gestor/cadastros/cursos-ead/components/EadCourseWizard.tsx

import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Clock, Save, Plus, Trash2, Loader2, Play, FileUp, 
  HelpCircle, Award, Sparkles, MonitorPlay, ChevronRight, ChevronLeft, 
  BookOpen, CheckCircle2, DollarSign, Image, FileText 
} from 'lucide-react';
import { supabase } from '../../../../../lib/supabase';
import { Curso, EadConfig, EadCronogramaItem, EadConteudoItem, EadProva, EadQuestao } from '../../cadastros.types';
import { cadastrosService } from '../../cadastros.service';
import { asaasEadService } from '../asaasEad.service';

interface EadCourseWizardProps {
  curso?: Curso | null;
  onBack: () => void;
  onSave: () => void;
}

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

const EadCourseWizard: React.FC<EadCourseWizardProps> = ({ curso, onBack, onSave }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  // --- ETAPA 1: DADOS BÁSICOS ---
  const [nome, setNome] = useState('');
  const [area, setArea] = useState('Outros');
  const [cargaHoraria, setCargaHoraria] = useState('');
  const [valorText, setValorText] = useState('');
  const [descricao, setDescricao] = useState('');
  const [imagemUrl, setImagemUrl] = useState('');
  const [versao, setVersao] = useState('1.0');
  const [publicarSite, setPublicarSite] = useState(false);
  const [isUploadingCapa, setIsUploadingCapa] = useState(false);

  // --- ETAPA 2: CRONOGRAMA ---
  const [cronograma, setCronograma] = useState<EadCronogramaItem[]>([]);
  const [newCronogramaTitle, setNewCronogramaTitle] = useState('');
  const [newCronogramaHours, setNewCronogramaHours] = useState('');

  // --- ETAPA 3: CONTEÚDO (APOSTILA / VÍDEOS) ---
  const [conteudos, setConteudos] = useState<EadConteudoItem[]>([]);
  const [newContTitle, setNewContTitle] = useState('');
  const [newContDesc, setNewContDesc] = useState('');
  const [newContVideo, setNewContVideo] = useState('');
  const [newContApostila, setNewContApostila] = useState('');
  const [newContTipo, setNewContTipo] = useState<'video' | 'material' | 'ambos'>('ambos');

  // --- ETAPA 4: PROVAS / ATIVIDADES ---
  const [provas, setProvas] = useState<EadProva[]>([]);
  const [selectedProvaIdx, setSelectedProvaIdx] = useState<number>(0);
  const [newProvaTitle, setNewProvaTitle] = useState('');
  const [newProvaMinScore, setNewProvaMinScore] = useState('70');
  
  // Criação de questões para a prova selecionada
  const [newQuestaoPergunta, setNewQuestaoPergunta] = useState('');
  const [newQuestaoOpcao0, setNewQuestaoOpcao0] = useState('');
  const [newQuestaoOpcao1, setNewQuestaoOpcao1] = useState('');
  const [newQuestaoOpcao2, setNewQuestaoOpcao2] = useState('');
  const [newQuestaoOpcao3, setNewQuestaoOpcao3] = useState('');
  const [newQuestaoCorreta, setNewQuestaoCorreta] = useState<number>(0);

  // --- ETAPA 5: CERTIFICAÇÃO ---
  const [emitirAutomatico, setEmitirAutomatico] = useState(true);
  const [minimoAproveitamento, setMinimoAproveitamento] = useState('70');
  const [assinaturaUrl, setAssinaturaUrl] = useState('');
  const [textoCustomizado, setTextoCustomizado] = useState(
    'Confere-se o presente certificado por concluir com êxito o curso livre na modalidade de Educação a Distância (EAD).'
  );
  const [isUploadingAssinatura, setIsUploadingAssinatura] = useState(false);

  // Carrega dados se for modo edição
  useEffect(() => {
    if (curso) {
      setNome(curso.nome || '');
      setArea(curso.area || 'Outros');
      setCargaHoraria(curso.carga_horaria?.toString() || '');
      setValorText(curso.valor !== null && curso.valor !== undefined ? curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
      setDescricao(curso.descricao || '');
      setImagemUrl(curso.imagem_url || '');
      setVersao(curso.versao || '1.0');
      setPublicarSite(curso.publicar_site || false);

      const config: EadConfig = curso.ead_config || {
        cronograma: [],
        conteudos: [],
        provas: [],
        certificacao: { emitirAutomatico: true, minimoAproveitamento: 70 }
      };

      setCronograma(config.cronograma || []);
      setConteudos(config.conteudos || []);
      setProvas(config.provas || []);
      
      if (config.certificacao) {
        setEmitirAutomatico(config.certificacao.emitirAutomatico);
        setMinimoAproveitamento(config.certificacao.minimoAproveitamento?.toString() || '70');
        setAssinaturaUrl(config.certificacao.assinaturaUrl || '');
        setTextoCustomizado(config.certificacao.textoCustomizado || '');
      }
    }
  }, [curso]);

  // --- MÉTODOS DE CONTROLE ---

  // Upload genérico para o Bucket 'documentos'
  const handleUploadImage = async (file: File, type: 'capa' | 'assinatura') => {
    if (type === 'capa') setIsUploadingCapa(true);
    else setIsUploadingAssinatura(true);

    try {
      const filePath = `ead/${type}_${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, file, { cacheControl: '31536000', upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      if (type === 'capa') {
        setImagemUrl(urlData.publicUrl);
      } else {
        setAssinaturaUrl(urlData.publicUrl);
      }
    } catch (err: any) {
      alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      if (type === 'capa') setIsUploadingCapa(false);
      else setIsUploadingAssinatura(false);
    }
  };

  // Cronograma
  const handleAddCronograma = () => {
    if (!newCronogramaTitle.trim() || !newCronogramaHours.trim()) return;
    const item: EadCronogramaItem = {
      id: `cron-${Math.random().toString(36).substr(2, 9)}`,
      titulo: newCronogramaTitle.trim(),
      cargaHoraria: parseInt(newCronogramaHours) || 0
    };
    setCronograma(prev => [...prev, item]);
    setNewCronogramaTitle('');
    setNewCronogramaHours('');
  };

  const handleRemoveCronograma = (id: string) => {
    setCronograma(prev => prev.filter(item => item.id !== id));
  };

  // Conteúdo
  const handleAddConteudo = () => {
    if (!newContTitle.trim()) return;
    const item: EadConteudoItem = {
      id: `cont-${Math.random().toString(36).substr(2, 9)}`,
      titulo: newContTitle.trim(),
      descricao: newContDesc.trim() || undefined,
      videoUrl: newContVideo.trim() || undefined,
      apostilaUrl: newContApostila.trim() || undefined,
      tipo: newContTipo
    };
    setConteudos(prev => [...prev, item]);
    setNewContTitle('');
    setNewContDesc('');
    setNewContVideo('');
    setNewContApostila('');
    setNewContTipo('ambos');
  };

  const handleRemoveConteudo = (id: string) => {
    setConteudos(prev => prev.filter(item => item.id !== id));
  };

  // Provas
  const handleAddProva = () => {
    if (!newProvaTitle.trim()) return;
    const item: EadProva = {
      id: `prova-${Math.random().toString(36).substr(2, 9)}`,
      titulo: newProvaTitle.trim(),
      notaMinima: parseInt(newProvaMinScore) || 70,
      questoes: []
    };
    setProvas(prev => [...prev, item]);
    setSelectedProvaIdx(provas.length);
    setNewProvaTitle('');
  };

  const handleAddQuestao = (provaIdx: number) => {
    if (!newQuestaoPergunta.trim() || !newQuestaoOpcao0.trim() || !newQuestaoOpcao1.trim()) {
      alert('Preencha a pergunta e pelo menos duas opções de resposta.');
      return;
    }

    const opcoes = [
      newQuestaoOpcao0.trim(),
      newQuestaoOpcao1.trim(),
      newQuestaoOpcao2.trim(),
      newQuestaoOpcao3.trim()
    ].filter(Boolean);

    const questao: EadQuestao = {
      id: `quest-${Math.random().toString(36).substr(2, 9)}`,
      pergunta: newQuestaoPergunta.trim(),
      opcoes,
      respostaCorreta: newQuestaoCorreta
    };

    setProvas(prev => prev.map((p, idx) => {
      if (idx === provaIdx) {
        return { ...p, questoes: [...p.questoes, questao] };
      }
      return p;
    }));

    // Reseta form de questão
    setNewQuestaoPergunta('');
    setNewQuestaoOpcao0('');
    setNewQuestaoOpcao1('');
    setNewQuestaoOpcao2('');
    setNewQuestaoOpcao3('');
    setNewQuestaoCorreta(0);
  };

  const handleRemoveQuestao = (provaIdx: number, questaoId: string) => {
    setProvas(prev => prev.map((p, idx) => {
      if (idx === provaIdx) {
        return { ...p, questoes: p.questoes.filter(q => q.id !== questaoId) };
      }
      return p;
    }));
  };

  const handleRemoveProva = (idx: number) => {
    setProvas(prev => prev.filter((_, i) => i !== idx));
    setSelectedProvaIdx(Math.max(0, idx - 1));
  };

  // --- PERSISTÊNCIA COMPLETA ---
  const handleFinalSave = async (forcePublishState?: boolean) => {
    if (!nome.trim() || !cargaHoraria.trim()) {
      alert('Por favor, preencha o nome do curso e a carga horária.');
      return;
    }

    setIsSaving(true);

    const valorParsed = parseBRLPrice(valorText);

    // Estrutura o objeto JSONB EAD Config
    const eadConfig: EadConfig = {
      cronograma,
      conteudos,
      provas,
      certificacao: {
        emitirAutomatico,
        minimoAproveitamento: parseInt(minimoAproveitamento) || 70,
        assinaturaUrl: assinaturaUrl || undefined,
        textoCustomizado: textoCustomizado || undefined
      }
    };

    const isPublishing = forcePublishState !== undefined ? forcePublishState : publicarSite;

    const cursoPayload: Omit<Curso, 'id'> & { id?: string } = {
      nome: nome.trim(),
      modalidade: 'EAD',
      carga_horaria: parseInt(cargaHoraria) || 0,
      status: 'ativo',
      area,
      descricao: descricao.trim(),
      versao: versao.trim() || '1.0',
      imagem_url: imagemUrl || null,
      duracao_meses: 12, // EAD virtual padrão 12 meses
      publicar_site: isPublishing,
      valor: valorParsed,
      ead_config: eadConfig
    };

    try {
      let savedCurso: Curso;

      if (curso?.id) {
        cursoPayload.id = curso.id;
        await cadastrosService.updateCurso({ ...curso, ...cursoPayload } as Curso);
        savedCurso = { ...curso, ...cursoPayload } as Curso;
      } else {
        savedCurso = await cadastrosService.createCurso(cursoPayload);
      }

      // Se publicado, dispara integrações em background (Turma Única e Asaas)
      if (isPublishing) {
        // 1. Cria a turma virtual única do EAD
        await cadastrosService.autoCreateEadTurma(savedCurso);

        // 2. Cria o produto de cobrança no Asaas
        if (valorParsed && valorParsed > 0) {
          await asaasEadService.createCourseProduct(savedCurso);
        }
      }

      alert('Curso EAD salvo e configurado com sucesso!');
      onSave();
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar curso EAD: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const steps = [
    { num: 1, name: 'Informações Básicas', icon: <MonitorPlay size={18} /> },
    { num: 2, name: 'Cronograma', icon: <Clock size={18} /> },
    { num: 3, name: 'Apostilas & Vídeos', icon: <BookOpen size={18} /> },
    { num: 4, name: 'Provas & Atividades', icon: <HelpCircle size={18} /> },
    { num: 5, name: 'Certificado EAD', icon: <Award size={18} /> }
  ];

  return (
    <div className="flex flex-col h-full animate-fadeIn bg-slate-50 min-h-screen">
      {/* Header Fixo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-200 transition-colors bg-white shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest bg-purple-50 px-2.5 py-1 rounded-md">Ensino a Distância</span>
            <h3 className="text-xl font-black text-[#001a33] mt-1.5 uppercase tracking-tight">
              {curso ? `Editando: ${nome}` : 'Novo Curso EAD'}
            </h3>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleFinalSave()}
            disabled={isSaving}
            className="flex items-center gap-2 bg-[#001a33] hover:bg-slate-800 text-white px-5 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors disabled:opacity-70 shadow-sm"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Salvar Rascunho
          </button>
          <button
            onClick={() => handleFinalSave(true)}
            disabled={isSaving}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-all disabled:opacity-70 shadow-lg shadow-purple-600/25"
          >
            {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            Publicar Curso
          </button>
        </div>
      </div>

      {/* Indicador de Passos */}
      <div className="bg-white border-b border-slate-200 py-4 px-6 overflow-x-auto overflow-y-hidden custom-scrollbar">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 min-w-[850px]">
          {steps.map((s, idx) => (
            <React.Fragment key={s.num}>
              <button 
                onClick={() => setCurrentStep(s.num)}
                className="flex items-center gap-2.5 focus:outline-none group shrink-0"
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm transition-all border shrink-0 ${
                  currentStep === s.num 
                    ? 'bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-600/20' 
                    : currentStep > s.num
                    ? 'bg-purple-55 text-purple-600 border-purple-200 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-400 group-hover:bg-slate-100 group-hover:text-slate-600'
                }`}>
                  {s.num}
                </div>
                <span className={`text-xs font-bold tracking-wide uppercase whitespace-nowrap ${
                  currentStep === s.num ? 'text-purple-650 font-black' : 'text-slate-500 group-hover:text-slate-700'
                }`}>
                  {s.name}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-0.5 rounded-full min-w-[16px] ${
                  currentStep > s.num ? 'bg-purple-400' : 'bg-slate-200'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Conteúdo da Etapa */}
      <div className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-8">
        <div className="bg-white border border-slate-250/60 rounded-[2.5rem] p-6 md:p-8 shadow-sm">
          
          {/* STEP 1: INFORMAÇÕES BÁSICAS */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><MonitorPlay size={20} /></span>
                <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Informações Principais do Curso</h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome do Curso *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Gestão e Planejamento Hospitalar"
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Área de Formação</label>
                  <select
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-bold text-slate-800 transition-all appearance-none cursor-pointer"
                    value={area}
                    onChange={e => setArea(e.target.value)}
                  >
                    <option value="Saúde">Saúde</option>
                    <option value="Tecnologia">Tecnologia</option>
                    <option value="Gestão">Gestão</option>
                    <option value="Educação">Educação</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga Horária (Horas) *</label>
                  <input
                    type="number"
                    required
                    placeholder="Ex: 80"
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all"
                    value={cargaHoraria}
                    onChange={e => setCargaHoraria(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor do Curso (Preço Comercial)</label>
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-100 focus-within:border-purple-500 transition-all">
                    <span className="text-slate-400 font-bold text-sm">R$</span>
                    <input
                      type="text"
                      placeholder="Ex: 299,90 (Deixe em branco para Sob Consulta)"
                      className="w-full bg-transparent border-none outline-none text-sm font-semibold text-slate-800 placeholder-slate-400"
                      value={valorText}
                      onChange={e => setValorText(e.target.value)}
                      onBlur={() => {
                        const parsed = parseBRLPrice(valorText);
                        setValorText(parsed !== null && !isNaN(parsed) ? parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '');
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumo do Curso (Exibido no Catálogo)</label>
                <textarea
                  rows={4}
                  placeholder="Forneça um breve resumo descrevendo os objetivos do curso, público-alvo e diferenciais."
                  className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all resize-none"
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                />
              </div>

              {/* Upload de Capa */}
              <div className="space-y-2.5">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Imagem de Capa do Curso</label>
                <div className="border-2 border-dashed border-slate-200 rounded-3xl p-6 text-center bg-slate-50/50 flex flex-col items-center justify-center gap-4 relative overflow-hidden group hover:bg-slate-50 transition-colors">
                  {imagemUrl ? (
                    <>
                      <img 
                        src={imagemUrl} 
                        alt="Capa do Curso EAD" 
                        className="max-h-48 rounded-2xl object-cover border border-slate-200 shadow-sm animate-fadeIn"
                      />
                      <div className="flex gap-2">
                        <label className="px-4 py-2 bg-[#001a33] hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                          {isUploadingCapa ? 'Enviando...' : 'Alterar Imagem'}
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0], 'capa')}
                            disabled={isUploadingCapa}
                            className="hidden"
                          />
                        </label>
                        <button 
                          onClick={() => setImagemUrl('')}
                          className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-red-200"
                        >
                          Remover
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-14 h-14 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center border border-slate-200 shadow-inner">
                        <Image size={24} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">Selecione a imagem de capa do curso</p>
                        <p className="text-[10px] text-slate-400 mt-1 font-medium">Recomendado formato horizontal (16:9)</p>
                      </div>
                      <label className="px-5 py-2.5 bg-purple-650 hover:bg-purple-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md shadow-purple-600/15">
                        {isUploadingCapa ? 'Enviando...' : 'Carregar Foto'}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0], 'capa')}
                          disabled={isUploadingCapa}
                          className="hidden"
                        />
                      </label>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CRONOGRAMA */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Clock size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Cronograma de Matérias (Certificado)</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre o cronograma detalhado de disciplinas/módulos para constar no verso do certificado impresso.</p>
                </div>
              </div>

              {/* Form Cadastro */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-end">
                <div className="flex-1 space-y-1.5 w-full">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome do Módulo/Matéria *</label>
                  <input
                    type="text"
                    placeholder="Ex: Introdução ao Planejamento de Saúde"
                    className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-slate-800"
                    value={newCronogramaTitle}
                    onChange={e => setNewCronogramaTitle(e.target.value)}
                  />
                </div>
                <div className="w-full md:w-32 space-y-1.5">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Carga Horária *</label>
                  <input
                    type="number"
                    placeholder="Ex: 20"
                    className="w-full px-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-center text-slate-800"
                    value={newCronogramaHours}
                    onChange={e => setNewCronogramaHours(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCronograma()}
                  />
                </div>
                <button
                  onClick={handleAddCronograma}
                  className="px-5 py-2.5 bg-[#001a33] hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider h-fit shrink-0 w-full md:w-auto"
                >
                  Adicionar
                </button>
              </div>

              {/* Tabela de Matérias */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estrutura de Matérias Cadastradas ({cronograma.length})</h5>
                {cronograma.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-slate-250 rounded-2xl bg-slate-50/50">
                    <Clock className="text-slate-300 mx-auto mb-2" size={32} />
                    <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma matéria adicionada ao cronograma.</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                    {cronograma.map((item, idx) => (
                      <div key={item.id} className="flex justify-between items-center p-4 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-black text-xs">{idx + 1}</span>
                          <span className="font-bold text-xs text-[#001a33]">{item.titulo}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="bg-slate-100 px-3 py-1 rounded-md text-[10px] font-bold text-slate-600">{item.cargaHoraria}h</span>
                          <button
                            onClick={() => handleRemoveCronograma(item.id)}
                            className="text-slate-350 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="p-4 bg-slate-50 flex justify-between items-center text-xs font-black text-slate-700">
                      <span>Carga Horária Total Cadastrada:</span>
                      <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-md">{cronograma.reduce((acc, c) => acc + c.cargaHoraria, 0)}h</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: CONTEÚDO (APOSTILAS E VÍDEOS) */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><BookOpen size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Conteúdos EAD (Material e Videoaulas)</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre as videoaulas (YouTube ou Vimeo) e as apostilas (PDF) de cada módulo.</p>
                </div>
              </div>

              {/* Form Cadastro */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Título da Aula *</label>
                    <input
                      type="text"
                      placeholder="Ex: Introdução ao Módulo de Faturamento"
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs"
                      value={newContTitle}
                      onChange={e => setNewContTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo de Conteúdo</label>
                    <select
                      className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-bold text-xs appearance-none cursor-pointer"
                      value={newContTipo}
                      onChange={e => setNewContTipo(e.target.value as any)}
                    >
                      <option value="ambos">Vídeo + Material PDF</option>
                      <option value="video">Apenas Vídeo (YouTube/Vimeo)</option>
                      <option value="material">Apenas Apostila (PDF)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Descrição (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Breve comentário explicativo..."
                    className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-medium text-xs"
                    value={newContDesc}
                    onChange={e => setNewContDesc(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(newContTipo === 'video' || newContTipo === 'ambos') && (
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">URL da Videoaula (YouTube ou Vimeo)</label>
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/watch?v=..."
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-semibold text-xs text-blue-650"
                        value={newContVideo}
                        onChange={e => setNewContVideo(e.target.value)}
                      />
                    </div>
                  )}

                  {(newContTipo === 'material' || newContTipo === 'ambos') && (
                    <div className="space-y-1.5">
                      <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">URL ou Link da Apostila (PDF)</label>
                      <input
                        type="url"
                        placeholder="https://suaconta.storage.com/apostila.pdf"
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-105 outline-none font-semibold text-xs"
                        value={newContApostila}
                        onChange={e => setNewContApostila(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleAddConteudo}
                    className="px-6 py-2.5 bg-[#001a33] hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Adicionar Conteúdo
                  </button>
                </div>
              </div>

              {/* Tabela de Conteúdos */}
              <div className="space-y-3">
                <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aulas & Conteúdos Cadastrados ({conteudos.length})</h5>
                {conteudos.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-slate-250 rounded-2xl bg-slate-50/50">
                    <BookOpen className="text-slate-300 mx-auto mb-2" size={32} />
                    <p className="text-slate-400 text-xs font-bold uppercase">Nenhum conteúdo associado.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {conteudos.map((item, index) => (
                      <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded text-[9px] uppercase tracking-wider">Aula {index + 1}</span>
                            <span className="font-bold text-xs text-[#001a33]">{item.titulo}</span>
                          </div>
                          {item.descricao && <p className="text-[10px] text-slate-500 font-medium">{item.descricao}</p>}
                          
                          <div className="flex gap-4 pt-1 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                            {item.videoUrl && <span className="flex items-center gap-1 text-red-500"><Play size={10} /> Videoaula Configurada</span>}
                            {item.apostilaUrl && <span className="flex items-center gap-1 text-blue-500"><FileUp size={10} /> PDF Configurado</span>}
                          </div>
                        </div>

                        <button
                          onClick={() => handleRemoveConteudo(item.id)}
                          className="p-2 border border-slate-100 hover:border-red-150 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl transition-all self-end md:self-center"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: PROVAS / ATIVIDADES */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><HelpCircle size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Atividades e Provas Avaliativas</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Cadastre provas com múltiplas alternativas para avaliar o aproveitamento do aluno.</p>
                </div>
              </div>

              {/* Abas de Provas */}
              <div className="flex flex-col md:flex-row gap-6">
                
                {/* Lado Esquerdo: Lista de Provas */}
                <div className="w-full md:w-64 space-y-3 shrink-0">
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Avaliações ({provas.length})</span>
                  </div>

                  <div className="space-y-2">
                    {provas.map((p, idx) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProvaIdx(idx)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                          selectedProvaIdx === idx 
                            ? 'bg-purple-50 border-purple-200 text-purple-800 font-bold' 
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <p className="text-xs font-bold">{p.titulo}</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">{p.questoes.length} Questões • Min: {p.notaMinima}%</p>
                        </div>
                        <Trash2 
                          size={14} 
                          className="text-slate-350 hover:text-red-500 shrink-0 cursor-pointer" 
                          onClick={(e) => { e.stopPropagation(); handleRemoveProva(idx); }}
                        />
                      </button>
                    ))}

                    {/* Cadastrar Nova Prova */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 mt-2">
                      <input 
                        type="text" 
                        placeholder="Título da Prova..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none font-bold"
                        value={newProvaTitle}
                        onChange={e => setNewProvaTitle(e.target.value)}
                      />
                      <div className="flex gap-2 items-center">
                        <input 
                          type="number" 
                          placeholder="Mínimo %"
                          className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] outline-none font-bold text-center"
                          value={newProvaMinScore}
                          onChange={e => setNewProvaMinScore(e.target.value)}
                        />
                        <button
                          onClick={handleAddProva}
                          className="px-3 py-1.5 bg-[#001a33] text-white rounded-lg text-[10px] uppercase font-bold shrink-0"
                        >
                          Criar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lado Direito: Editor de Questões */}
                <div className="flex-1 border border-slate-200 rounded-2xl p-5 bg-white space-y-6">
                  {provas.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 font-bold text-xs uppercase">
                      Crie uma avaliação na barra lateral para começar a configurar as perguntas.
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <h5 className="font-bold text-sm text-[#001a33] uppercase">Perguntas de: {provas[selectedProvaIdx]?.titulo}</h5>
                        <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-0.5 rounded">
                          Aprovação mínima: {provas[selectedProvaIdx]?.notaMinima}%
                        </span>
                      </div>

                      {/* Criar Nova Questão */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="space-y-1">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Enunciado da Pergunta *</label>
                          <input 
                            type="text" 
                            placeholder="Qual a pergunta da questão?"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs outline-none font-bold"
                            value={newQuestaoPergunta}
                            onChange={e => setNewQuestaoPergunta(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Alternativas (Selecione a Correta)</label>
                          
                          {/* Opção 1 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 0}
                              onChange={() => setNewQuestaoCorreta(0)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção A *"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao0}
                              onChange={e => setNewQuestaoOpcao0(e.target.value)}
                            />
                          </div>

                          {/* Opção 2 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 1}
                              onChange={() => setNewQuestaoCorreta(1)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção B *"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao1}
                              onChange={e => setNewQuestaoOpcao1(e.target.value)}
                            />
                          </div>

                          {/* Opção 3 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 2}
                              onChange={() => setNewQuestaoCorreta(2)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção C (Opcional)"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao2}
                              onChange={e => setNewQuestaoOpcao2(e.target.value)}
                            />
                          </div>

                          {/* Opção 4 */}
                          <div className="flex items-center gap-2">
                            <input 
                              type="radio" 
                              name="questao_correta"
                              checked={newQuestaoCorreta === 3}
                              onChange={() => setNewQuestaoCorreta(3)}
                              className="text-purple-600 focus:ring-purple-500 h-4 w-4"
                            />
                            <input 
                              type="text" 
                              placeholder="Opção D (Opcional)"
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none"
                              value={newQuestaoOpcao3}
                              onChange={e => setNewQuestaoOpcao3(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => handleAddQuestao(selectedProvaIdx)}
                            className="px-4 py-1.5 bg-[#001a33] text-white rounded-lg text-[10px] font-bold uppercase tracking-wider"
                          >
                            Adicionar Questão
                          </button>
                        </div>
                      </div>

                      {/* Lista de Questões Adicionadas */}
                      <div className="space-y-3">
                        <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Questões Criadas ({provas[selectedProvaIdx]?.questoes.length})</h6>
                        {provas[selectedProvaIdx]?.questoes.length === 0 ? (
                          <p className="text-center py-6 text-slate-400 text-xs italic">Nenhuma pergunta cadastrada para esta prova.</p>
                        ) : (
                          <div className="space-y-4">
                            {provas[selectedProvaIdx].questoes.map((q, qIdx) => (
                              <div key={q.id} className="border border-slate-100 rounded-xl p-4 bg-slate-50/20 relative group">
                                <div className="flex justify-between items-start gap-4">
                                  <div>
                                    <h6 className="font-bold text-xs text-[#001a33]">{qIdx + 1}. {q.pergunta}</h6>
                                    <ul className="mt-2 space-y-1 pl-4 list-disc text-[11px] text-slate-650 font-medium">
                                      {q.opcoes.map((op, oIdx) => (
                                        <li key={oIdx} className={q.respostaCorreta === oIdx ? 'text-emerald-600 font-bold' : ''}>
                                          {op} {q.respostaCorreta === oIdx && '✔'}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveQuestao(selectedProvaIdx, q.id)}
                                    className="text-slate-350 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: CERTIFICAÇÃO */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fadeIn">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                <span className="p-2.5 bg-purple-50 text-purple-600 rounded-xl"><Award size={20} /></span>
                <div>
                  <h4 className="font-black text-lg text-[#001a33] uppercase tracking-tight">Geração de Certificado EAD</h4>
                  <p className="text-slate-400 text-xs font-medium mt-0.5">Configure as regras de aprovação e as assinaturas autorizadas para o certificado final.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Parâmetros do Certificado */}
                <div className="space-y-5">
                  <div className="flex items-start justify-between gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <div className="space-y-1">
                      <span className="font-bold text-xs text-slate-800 block uppercase tracking-wide">Emissão Automática</span>
                      <span className="text-[10px] text-slate-400 font-medium block leading-relaxed">
                        Liberar o certificado na área do aluno automaticamente após a aprovação nas provas.
                      </span>
                    </div>
                    <button 
                      onClick={() => setEmitirAutomatico(!emitirAutomatico)}
                      className={`w-12 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                        emitirAutomatico ? 'bg-purple-600' : 'bg-slate-300'
                      }`}
                    >
                      <div 
                        className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-transform ${
                          emitirAutomatico ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">% de Aproveitamento Mínimo</label>
                    <input
                      type="number"
                      placeholder="Ex: 70"
                      className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800"
                      value={minimoAproveitamento}
                      onChange={e => setMinimoAproveitamento(e.target.value)}
                    />
                    <p className="text-[9px] text-slate-400 leading-normal">Média geral nas avaliações do curso necessária para obter aprovação.</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Upload da Assinatura Digitalizada</label>
                    <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50 flex items-center justify-between gap-4">
                      {assinaturaUrl ? (
                        <>
                          <img src={assinaturaUrl} alt="Assinatura" className="h-10 object-contain border border-slate-200 bg-white p-1 rounded" />
                          <button
                            onClick={() => setAssinaturaUrl('')}
                            className="text-[10px] font-bold text-red-500 hover:underline uppercase"
                          >
                            Remover
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-[11px] text-slate-400 font-bold uppercase">Nenhuma assinatura carregada</span>
                          <label className="px-3.5 py-1.5 bg-[#001a33] hover:bg-slate-800 text-white text-[10px] font-bold uppercase rounded-lg cursor-pointer">
                            {isUploadingAssinatura ? 'Carregando...' : 'Carregar'}
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => e.target.files?.[0] && handleUploadImage(e.target.files[0], 'assinatura')}
                              disabled={isUploadingAssinatura}
                              className="hidden"
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Texto do Certificado */}
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Texto Customizado do Certificado</label>
                  <textarea
                    rows={8}
                    placeholder="Certificamos que o aluno concluiu com êxito..."
                    className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-purple-100 focus:border-purple-500 outline-none font-semibold text-slate-800 transition-all resize-none"
                    value={textoCustomizado}
                    onChange={e => setTextoCustomizado(e.target.value)}
                  />
                  <p className="text-[9px] text-slate-400 leading-normal">
                    Este texto será inserido no centro da frente do certificado. Você pode formatar com tags se necessário.
                  </p>
                </div>
              </div>

              {/* Prévia do Certificado */}
              <div className="border border-slate-250 bg-slate-50/50 rounded-3xl p-6 mt-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-2 h-full bg-purple-600" />
                <h5 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-4">Pré-visualização do Layout do Certificado</h5>
                
                <div className="border-4 border-double border-slate-350 bg-white p-8 max-w-2xl mx-auto rounded-lg text-center space-y-6 shadow-sm font-serif">
                  <span className="text-[10px] uppercase tracking-[0.2em] font-sans font-bold text-purple-600">Certificado de Conclusão EAD</span>
                  
                  <h3 className="text-xl font-bold text-slate-800 leading-normal font-sans">{nome || '[Nome do Curso EAD]'}</h3>
                  
                  <p className="text-[11px] leading-relaxed text-slate-600 px-6 font-medium whitespace-pre-line">
                    Certificamos que o estudante logado concluiu o curso livre de {nome || '[Curso]'}, com carga horária de {cargaHoraria || '0'} horas, atendendo a todos os requisitos acadêmicos estabelecidos em regulamento.
                  </p>
                  
                  <div className="pt-6 flex justify-center items-center flex-col">
                    {assinaturaUrl ? (
                      <img src={assinaturaUrl} alt="Assinatura" className="h-10 object-contain mb-1" />
                    ) : (
                      <div className="w-32 h-6 border-b border-dashed border-slate-300 mb-1" />
                    )}
                    <span className="text-[9px] font-sans font-black uppercase text-slate-450 tracking-wider">Diretoria Acadêmica</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Botões de Navegação Inferiores */}
        <div className="flex justify-between items-center mt-6">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-250/75 px-4 py-2.5 rounded-xl text-xs font-bold uppercase disabled:opacity-50 transition-colors"
          >
            <ChevronLeft size={16} /> Voltar
          </button>
          
          {currentStep < 5 ? (
            <button
              onClick={() => setCurrentStep(prev => Math.min(5, prev + 1))}
              className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase transition-colors shadow-md shadow-purple-600/15"
            >
              Avançar <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={() => handleFinalSave(true)}
              disabled={isSaving}
              className="flex items-center gap-1 bg-purple-650 hover:bg-purple-700 text-white px-6 py-3 rounded-xl text-xs font-bold uppercase transition-all shadow-lg shadow-purple-600/25 animate-pulse"
            >
              {isSaving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Publicar Curso EAD
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

export default EadCourseWizard;
