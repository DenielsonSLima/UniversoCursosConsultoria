import React, { useState, useEffect } from 'react';
import { Building, Plus, Loader2, X, Trash2, Edit2, Power, Check, AlertCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cadastrosService } from '../cadastros.service';
import { Curso } from '../cadastros.types';
import { supabase } from '../../../../lib/supabase';
import { parceirosService } from '../../parceiros/parceiros.service';

const EnsinoSuperiorPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo'>('ativo');

  // Estados para Modal de Criar/Editar
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCurso, setEditingCurso] = useState<Curso | null>(null);
  
  // Campos do formulário
  const [nome, setNome] = useState('');
  const [grau, setGrau] = useState('Bacharelado');
  const [tipoEnsino, setTipoEnsino] = useState('SEMIPRESENCIAL');
  const [customArea, setCustomArea] = useState('');
  const [descricao, setDescricao] = useState('');
  const [versao, setVersao] = useState('1.0');
  const [imagemUrl, setImagemUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  // parceiroTipo: id do parceiro PJ ou 'Outro'
  const [parceiroTipo, setParceiroTipo] = useState('');
  const [parceiroNomeCustom, setParceiroNomeCustom] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Parceiros PJ carregados do banco de dados
  const [parceirosPj, setParceirosPj] = useState<any[]>();

  useEffect(() => {
    loadCursos();
    loadParceirosPj();
  }, []);

  const loadParceirosPj = async () => {
    try {
      const data = await parceirosService.getAll('pj');
      setParceirosPj(data || []);
    } catch (err) {
      console.error('Erro ao buscar parceiros PJ:', err);
    }
  };

  const loadCursos = async () => {
    setLoading(true);
    try {
      const data = await cadastrosService.getCursosByModalidade('SUPERIOR');
      setCursos(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar cursos de Ensino Superior.');
    } finally {
      setLoading(false);
    }
  };

  // Prepara o formulário para criação
  const handleOpenCreate = () => {
    setEditingCurso(null);
    setNome('');
    setGrau('Bacharelado');
    setTipoEnsino('SEMIPRESENCIAL');
    setCustomArea('');
    setDescricao('');
    setVersao('1.0');
    setImagemUrl('');
    setParceiroTipo(parceirosPj?.[0]?.id || '');
    setParceiroNomeCustom('');
    setShowFormModal(true);
  };

  // Prepara o formulário para edição
  const handleOpenEdit = (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCurso(curso);
    setNome(curso.nome);
    setDescricao(curso.descricao || '');
    setVersao(curso.versao || '1.0');
    setImagemUrl(curso.imagem_url || '');

    const currentArea = curso.area || '';
    if (currentArea === 'CURSOS SUPERIORES DE TECNOLOGIA') {
      setGrau('Tecnologia');
      setTipoEnsino('SEMIPRESENCIAL');
      setCustomArea('');
    } else if (currentArea.startsWith('BACHARELADOS - ')) {
      setGrau('Bacharelado');
      setTipoEnsino(currentArea.replace('BACHARELADOS - ', ''));
      setCustomArea('');
    } else if (currentArea.startsWith('LICENCIATURAS - ')) {
      setGrau('Licenciatura');
      setTipoEnsino(currentArea.replace('LICENCIATURAS - ', ''));
      setCustomArea('');
    } else {
      setGrau('Outro');
      setCustomArea(currentArea);
      setTipoEnsino('SEMIPRESENCIAL');
    }

    const dbMatch = parceirosPj?.find(p => p.nome === curso.parceiro_instituicao);
    if (dbMatch) {
      setParceiroTipo(dbMatch.id);
      setParceiroNomeCustom('');
    } else {
      setParceiroTipo('Outro');
      setParceiroNomeCustom(curso.parceiro_instituicao || '');
    }
    setShowFormModal(true);
  };

  // Compressão de imagem do card para WebP
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

  // Upload de imagem do card
  const handleUploadImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Comprime a imagem no cliente para WebP
      const compressedBlob = await compressImage(file);
      const compressedFile = new File([compressedBlob], `curso_${Date.now()}.webp`, {
        type: 'image/webp'
      });

      const filePath = `cursos/curso_${Date.now()}.webp`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, compressedFile, {
          cacheControl: '31536000', // 1 ano de cache local/CDN
          upsert: true
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(data.path);

      setImagemUrl(urlData.publicUrl);
    } catch (err: any) {
      console.error('Erro ao fazer upload da imagem:', err);
      alert('Erro ao fazer upload da imagem: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Muda seleção de parceiro
  const handlePartnerSelectChange = (val: string) => {
    setParceiroTipo(val);
    if (val !== 'Outro') setParceiroNomeCustom('');
  };

  // Salvar / Atualizar Curso
  const handleSaveCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;

    // Resolve o nome e logo do parceiro selecionado
    let finalParceiroNome = '';
    let finalLogoUrl = '';
    if (parceiroTipo === 'Outro') {
      finalParceiroNome = parceiroNomeCustom.trim();
      finalLogoUrl = '';
    } else {
      const dbPartner = parceirosPj?.find(p => p.id === parceiroTipo);
      finalParceiroNome = dbPartner?.nome || '';
      finalLogoUrl = dbPartner?.foto || '';
    }

    if (!finalParceiroNome) {
      alert('Por favor, selecione ou informe a instituição parceira.');
      return;
    }

    const finalArea = grau === 'Tecnologia'
      ? 'CURSOS SUPERIORES DE TECNOLOGIA'
      : grau === 'Outro'
      ? customArea.trim() || 'Outros'
      : `${grau === 'Bacharelado' ? 'BACHARELADOS' : 'LICENCIATURAS'} - ${tipoEnsino}`;

    setIsSaving(true);
    try {
      const cursoData = {
        nome: nome.trim(),
        carga_horaria: 0,
        modalidade: 'SUPERIOR' as const,
        status: editingCurso ? editingCurso.status : ('ativo' as const),
        area: finalArea,
        descricao: descricao.trim(),
        versao: versao.trim(),
        parceiro_instituicao: finalParceiroNome,
        parceiro_logo_url: finalLogoUrl,
        imagem_url: imagemUrl || null,
      };

      if (editingCurso) {
        await cadastrosService.updateCurso({ ...editingCurso, ...cursoData });
      } else {
        await cadastrosService.createCurso(cursoData);
      }

      setShowFormModal(false);
      loadCursos();
      queryClient.invalidateQueries({ queryKey: ['cursosSuperiorPublic'] });
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar curso de Ensino Superior.');
    } finally {
      setIsSaving(false);
    }
  };

  // Mudar Status Ativo/Inativo
  const handleToggleStatus = async (curso: Curso, e: React.MouseEvent) => {
    e.stopPropagation();
    const novoStatus = curso.status === 'ativo' ? 'inativo' : 'ativo';
    const confirmMsg = novoStatus === 'inativo' 
      ? 'Deseja INATIVAR este curso superior? Ele deixará de aparecer na vitrine do site público.' 
      : 'Deseja reativar este curso superior?';

    if (confirm(confirmMsg)) {
      try {
        await cadastrosService.toggleStatus(curso.id, novoStatus);
        loadCursos();
        queryClient.invalidateQueries({ queryKey: ['cursosSuperiorPublic'] });
      } catch (err) {
        console.error(err);
        alert('Erro ao alterar status.');
      }
    }
  };

  // Excluir Curso Superior
  const handleDeleteCurso = async (cursoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Tem certeza de que deseja EXCLUIR permanentemente este curso superior do banco de dados?')) {
      try {
        // Exclusão definitiva para manter o banco limpo
        const { error } = await supabase
          .from('cursos')
          .delete()
          .eq('id', cursoId);

        if (error) throw error;
        loadCursos();
        queryClient.invalidateQueries({ queryKey: ['cursosSuperiorPublic'] });
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir curso.');
      }
    }
  };



  // Filtragem
  const filteredCursos = cursos.filter(c => c.status === statusFilter);

  // Agrupamento por Área
  const groupedCursos: Record<string, Curso[]> = {};
  filteredCursos.forEach(c => {
    const a = c.area || 'Outros';
    if (!groupedCursos[a]) groupedCursos[a] = [];
    groupedCursos[a].push(c);
  });

  return (
    <div className="animate-fadeIn relative">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-slate-100 pb-6 gap-4">
        <div>
          <h2 className="text-3xl font-black text-[#001a33] uppercase tracking-tight">
            Ensino Superior
          </h2>
          <p className="text-slate-500 font-medium mt-1">
            Vitrine de Graduações e Pós-Graduações oferecidas em parceria com outras instituições.
          </p>
        </div>
        
        <button 
          onClick={handleOpenCreate}
          className="flex items-center gap-2 bg-[#001a33] text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg shadow-blue-900/20"
        >
          <Plus size={16} /> Novo Curso Superior
        </button>
      </div>

      {/* Info Box sobre o funcionamento das Parcerias */}
      <div className="bg-blue-50/70 border border-blue-100 p-5 rounded-3xl mb-8 flex items-start gap-4 shadow-sm">
        <div className="p-3 bg-blue-100 text-blue-800 rounded-2xl shrink-0">
          <Building size={24} />
        </div>
        <div>
          <h4 className="text-sm font-black text-blue-900 uppercase tracking-tight mb-1">Modelo de Afiliados / Parcerias</h4>
          <p className="text-xs text-blue-800 leading-relaxed font-medium">
            Estes cursos não possuem gestão de grade curricular (módulos/aulas) local, pois a parte acadêmica é controlada diretamente pelas faculdades parceiras. O cadastro aqui serve exclusivamente como uma <strong>vitrine no site público</strong> para captação de alunos e redirecionamento.
          </p>
        </div>
      </div>

      {/* Tabs de Filtro de Status */}
      <div className="flex gap-2 mb-8 bg-slate-100 p-1 rounded-2xl max-w-xs border border-slate-200">
        <button 
          onClick={() => setStatusFilter('ativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'ativo' 
              ? 'bg-white text-emerald-600 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Ativos ({cursos.filter(c => c.status === 'ativo').length})
        </button>
        <button 
          onClick={() => setStatusFilter('inativo')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${
            statusFilter === 'inativo' 
              ? 'bg-white text-red-500 shadow-sm' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Inativos ({cursos.filter(c => c.status === 'inativo').length})
        </button>
      </div>

      {/* Listagem */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={32} />
        </div>
      ) : filteredCursos.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 rounded-[2.5rem] border border-dashed border-slate-300">
           <Building className="text-slate-300 mx-auto mb-4 animate-pulse" size={48} />
           <p className="text-slate-500 font-medium">Nenhum curso superior {statusFilter === 'ativo' ? 'ativo' : 'inativo'} cadastrado.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {Object.entries(groupedCursos).map(([area, list]) => (
            <div key={area} className="animate-fadeIn">
              <h3 className="text-sm font-black text-[#001a33] uppercase tracking-widest border-l-4 border-blue-600 pl-3 mb-6 flex items-center gap-2">
                <span>{area}</span>
                <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">{list.length}</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {list.map((curso) => (
                  <div 
                    key={curso.id} 
                    className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 hover:shadow-xl hover:shadow-blue-900/5 transition-all duration-300 flex flex-col justify-between min-h-[340px] relative overflow-hidden group"
                  >
                    <div>
                      {/* Imagem do Card */}
                      {curso.imagem_url && (
                        <div className="h-24 w-full bg-slate-50 border border-slate-100 rounded-xl overflow-hidden mb-3">
                          <img src={curso.imagem_url} alt={curso.nome} className="w-full h-full object-cover" />
                        </div>
                      )}

                      {/* Logo do Parceiro e Categoria */}
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div className="h-12 w-28 bg-slate-50 border border-slate-100 rounded-xl p-2 flex items-center justify-center overflow-hidden">
                          {curso.parceiro_logo_url ? (
                            <img 
                              src={curso.parceiro_logo_url} 
                              alt={curso.parceiro_instituicao} 
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <Building className="text-slate-300" size={20} />
                          )}
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 px-2 py-1 rounded-md">
                          {curso.area}
                        </span>
                      </div>

                      {/* Nome do Curso */}
                      <h4 className="text-base font-bold text-[#001a33] leading-tight mb-2 group-hover:text-blue-600 transition-colors">
                        {curso.nome}
                      </h4>
                      
                      {/* Nome do Parceiro */}
                      <p className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-2">
                        {curso.parceiro_instituicao}
                      </p>

                      {/* Descrição */}
                      <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed">
                        {curso.descricao || 'Sem descrição cadastrada.'}
                      </p>
                    </div>

                    {/* Rodapé do Card: Ações */}
                    <div className="mt-auto pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">
                        Versão {curso.versao || '1.0'}
                      </span>
                      
                      <div className="flex items-center gap-1">
                        {/* Toggle Status */}
                        <button
                          onClick={(e) => handleToggleStatus(curso, e)}
                          title={curso.status === 'ativo' ? 'Inativar curso' : 'Ativar curso'}
                          className={`p-2 rounded-lg transition-colors ${
                            curso.status === 'ativo' 
                              ? 'text-emerald-500 hover:bg-emerald-50' 
                              : 'text-slate-400 hover:bg-slate-100'
                          }`}
                        >
                          {curso.status === 'ativo' ? <Check size={16} /> : <Power size={16} />}
                        </button>

                        {/* Editar */}
                        <button
                          onClick={(e) => handleOpenEdit(curso, e)}
                          title="Editar curso"
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>

                        {/* Excluir */}
                        <button
                          onClick={(e) => handleDeleteCurso(curso.id, e)}
                          title="Excluir curso"
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Formulário (Criar/Editar) */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowFormModal(false)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-red-500 rounded-xl hover:bg-slate-50 transition-all"
            >
              <X size={20} />
            </button>
            
            <h3 className="text-xl font-black text-[#001a33] uppercase tracking-tight mb-6">
              {editingCurso ? 'Editar Curso Superior' : 'Novo Curso Superior'}
            </h3>
            
            <form onSubmit={handleSaveCurso} className="space-y-4">
              {/* Nome do Curso */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Graduação / Pós-Graduação</label>
                <input 
                  required
                  type="text" 
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Bacharelado em Administração"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Categoria/Grau e Tipo/Modalidade/Versão */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Grau / Categoria</label>
                  <select 
                    value={grau}
                    onChange={(e) => setGrau(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                  >
                    <option value="Bacharelado">Bacharelado</option>
                    <option value="Licenciatura">Licenciatura</option>
                    <option value="Tecnologia">Tecnologia (Cursos Superiores de)</option>
                    <option value="Outro">Outra Categoria</option>
                  </select>
                </div>

                {(grau === 'Bacharelado' || grau === 'Licenciatura') ? (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Tipo / Modalidade</label>
                    <select 
                      value={tipoEnsino}
                      onChange={(e) => setTipoEnsino(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="SEMIPRESENCIAL">Semipresencial</option>
                      <option value="100% ONLINE">100% Online</option>
                      <option value="PRESENCIAL">Presencial</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                    <input 
                      required
                      type="text" 
                      value={versao}
                      onChange={(e) => setVersao(e.target.value)}
                      placeholder="Ex: 1.0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Se for Outro, exibe campo personalizado */}
              {grau === 'Outro' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Categoria Personalizada</label>
                  <input 
                    required
                    type="text" 
                    value={customArea}
                    onChange={(e) => setCustomArea(e.target.value)}
                    placeholder="Ex: PÓS-GRADUAÇÃO - 100% ONLINE"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              )}

              {/* Se for Bacharelado ou Licenciatura, a Versão é exibida abaixo */}
              {(grau === 'Bacharelado' || grau === 'Licenciatura') && (
                <div className="grid grid-cols-2 gap-4">
                  <div></div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Versão</label>
                    <input 
                      required
                      type="text" 
                      value={versao}
                      onChange={(e) => setVersao(e.target.value)}
                      placeholder="Ex: 1.0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>
              )}

              {/* Escolha do Parceiro */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Instituição Parceira</label>
                {(!parceirosPj || parceirosPj.length === 0) ? (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                    <AlertCircle size={16} className="text-amber-500 shrink-0" />
                    <p className="text-xs text-amber-700 font-medium">
                      Nenhum parceiro PJ cadastrado ainda. <span className="font-black">Cadastre uma empresa em Parceiros → Pessoa Jurídica</span> antes de criar um curso superior.
                    </p>
                  </div>
                ) : (
                  <>
                    <select
                      value={parceiroTipo}
                      onChange={(e) => handlePartnerSelectChange(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                    >
                      <option value="">Selecione o parceiro...</option>
                      {parceirosPj.map(p => (
                        <option key={p.id} value={p.id}>{p.nome}</option>
                      ))}
                      <option value="Outro">Outra Instituição (não cadastrada)</option>
                    </select>

                    {/* Preview da logo que virá do parceiro */}
                    {parceiroTipo && parceiroTipo !== 'Outro' && (() => {
                      const dbPartner = parceirosPj.find(p => p.id === parceiroTipo);
                      return dbPartner ? (
                        <div className="flex items-center gap-3 mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="w-12 h-12 bg-white rounded-xl border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                            {dbPartner.foto ? (
                              <img src={dbPartner.foto} alt={dbPartner.nome} className="w-full h-full object-contain" />
                            ) : (
                              <Building size={20} className="text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-black text-slate-700">{dbPartner.nome}</p>
                            {dbPartner.foto ? (
                              <p className="text-[10px] text-emerald-600 font-bold mt-0.5">✓ Logo cadastrada no perfil do parceiro</p>
                            ) : (
                              <p className="text-[10px] text-amber-600 font-bold mt-0.5">⚠ Sem logo — cadastre no perfil do parceiro</p>
                            )}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </>
                )}

                {parceiroTipo === 'Outro' && (
                  <div className="mt-3">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nome da Instituição</label>
                    <input
                      required
                      type="text"
                      value={parceiroNomeCustom}
                      onChange={(e) => setParceiroNomeCustom(e.target.value)}
                      placeholder="Ex: Faculdade São Luís"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all"
                    />
                    <p className="text-[10px] text-amber-600 font-medium mt-1.5">⚠ Sem logo — cadastre este parceiro em Parceiros → PJ para adicionar logo.</p>
                  </div>
                )}
              </div>

              {/* Imagem do Card (Upload) */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Imagem de Capa (Card)</label>
                <div className="flex items-center gap-4">
                  {imagemUrl ? (
                    <div className="relative w-24 h-16 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shrink-0">
                      <img src={imagemUrl} alt="Capa" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setImagemUrl('')}
                        className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full transition-colors"
                        title="Remover Imagem"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="w-24 h-16 bg-slate-50 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-slate-400 shrink-0">
                      Sem Capa
                    </div>
                  )}
                  <div className="flex-grow">
                    <label className="inline-block px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all">
                      {isUploading ? 'Fazendo Upload...' : imagemUrl ? 'Alterar Imagem' : 'Upload de Imagem'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleUploadImagem}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-1">Imagens recomendadas no formato 16:9.</p>
                  </div>
                </div>
              </div>

              {/* Descrição do Curso */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Descrição / História do Curso</label>
                <textarea 
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Resumo da formação acadêmica, campos de atuação e objetivos da parceria..."
                  className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition-all resize-none"
                />
              </div>

              {/* Ações */}
              <div className="pt-4 flex gap-3">
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="flex-1 py-3 bg-[#001a33] text-white rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-75"
                >
                  {isSaving ? 'Salvando...' : 'Salvar Curso'}
                </button>
                <button 
                  type="button" 
                  onClick={() => setShowFormModal(false)}
                  className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs tracking-wider hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnsinoSuperiorPage;
