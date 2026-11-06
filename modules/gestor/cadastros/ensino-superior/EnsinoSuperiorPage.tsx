import React, { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { cadastrosService } from '../cadastros.service';
import { Curso } from '../cadastros.types';
import { supabase } from '../../../../lib/supabase';
import { parceirosService } from '../../parceiros/parceiros.service';
import EnsinoSuperiorCatalog from './EnsinoSuperiorCatalog';
import EnsinoSuperiorCourseForm from './EnsinoSuperiorCourseForm';
import '../formacoes-recursos.css';

interface EnsinoSuperiorPageProps {
  readOnly?: boolean;
}

const normalizeFilterText = (value?: string) => (
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
);

const EnsinoSuperiorPage: React.FC<EnsinoSuperiorPageProps> = ({ readOnly = false }) => {
  const queryClient = useQueryClient();
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ativo' | 'inativo'>('ativo');
  const [searchTerm, setSearchTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState('Todas');
  const [partnerFilter, setPartnerFilter] = useState('Todos');
  const [displayMode, setDisplayMode] = useState<'cards' | 'table'>('cards');

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

  // Compressão de imagem do card para WebP com fallback para JPEG
  const compressImage = (file: File): Promise<{ blob: Blob; ext: string; type: string }> => {
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
            resolve({ blob: file, ext: file.name.split('.').pop() || 'jpg', type: file.type });
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          const isWebpSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
          const format = isWebpSupported ? 'image/webp' : 'image/jpeg';
          const ext = isWebpSupported ? 'webp' : 'jpg';

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve({ blob, ext, type: format });
              } else {
                resolve({ blob: file, ext: file.name.split('.').pop() || 'jpg', type: file.type });
              }
            },
            format,
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
      // Comprime a imagem no cliente para WebP ou JPEG
      const { blob, ext, type } = await compressImage(file);
      const compressedFile = new File([blob], `curso_${Date.now()}.${ext}`, {
        type
      });

      const filePath = `cursos/curso_${Date.now()}.${ext}`;

      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, compressedFile, {
          cacheControl: '31536000', // 1 ano de cache local/CDN
          upsert: true,
          contentType: type
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
    const dbPartner = parceiroTipo === 'Outro'
      ? null
      : parceirosPj?.find(p => p.id === parceiroTipo);
    const finalParceiroNome = parceiroTipo === 'Outro'
      ? parceiroNomeCustom.trim()
      : dbPartner?.nome || '';
    const finalLogoUrl = dbPartner?.foto || '';

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

  const areaOptions = useMemo(() => (
    Array.from(new Set<string>(
      cursos
        .map((curso) => curso.area?.trim())
        .filter((area): area is string => Boolean(area))
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  ), [cursos]);

  const partnerOptions = useMemo(() => (
    Array.from(new Set<string>(
      cursos
        .map((curso) => curso.parceiro_instituicao?.trim())
        .filter((partner): partner is string => Boolean(partner))
    )).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  ), [cursos]);

  // Filtragem visual sobre os cursos já carregados.
  const normalizedSearchTerm = normalizeFilterText(searchTerm);
  const filteredCursos = cursos.filter((curso) => {
    const matchesStatus = curso.status === statusFilter;
    const matchesArea = areaFilter === 'Todas' || (curso.area || 'Outros') === areaFilter;
    const matchesPartner = partnerFilter === 'Todos'
      || (curso.parceiro_instituicao || '') === partnerFilter;
    const searchableText = normalizeFilterText([
      curso.nome,
      curso.descricao,
      curso.parceiro_instituicao,
    ].filter(Boolean).join(' '));
    const matchesSearch = !normalizedSearchTerm || searchableText.includes(normalizedSearchTerm);

    return matchesStatus && matchesArea && matchesPartner && matchesSearch;
  });

  // Agrupamento por Área
  const groupedCursos: Record<string, Curso[]> = {};
  filteredCursos.forEach(c => {
    const a = c.area || 'Outros';
    if (!groupedCursos[a]) groupedCursos[a] = [];
    groupedCursos[a].push(c);
  });

  return (
    <div className="formacao-recursos animate-fadeIn relative">
      <EnsinoSuperiorCatalog
        readOnly={readOnly}
        handleOpenCreate={handleOpenCreate}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        areaFilter={areaFilter}
        setAreaFilter={setAreaFilter}
        areaOptions={areaOptions}
        partnerFilter={partnerFilter}
        setPartnerFilter={setPartnerFilter}
        partnerOptions={partnerOptions}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        cursos={cursos}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        loading={loading}
        filteredCursos={filteredCursos}
        handleOpenEdit={handleOpenEdit}
        handleToggleStatus={handleToggleStatus}
        handleDeleteCurso={handleDeleteCurso}
        groupedCursos={groupedCursos}
      />

      <EnsinoSuperiorCourseForm
        readOnly={readOnly}
        showFormModal={showFormModal}
        setShowFormModal={setShowFormModal}
        editingCurso={editingCurso}
        handleSaveCurso={handleSaveCurso}
        nome={nome}
        setNome={setNome}
        grau={grau}
        setGrau={setGrau}
        tipoEnsino={tipoEnsino}
        setTipoEnsino={setTipoEnsino}
        versao={versao}
        setVersao={setVersao}
        customArea={customArea}
        setCustomArea={setCustomArea}
        parceirosPj={parceirosPj}
        parceiroTipo={parceiroTipo}
        handlePartnerSelectChange={handlePartnerSelectChange}
        parceiroNomeCustom={parceiroNomeCustom}
        setParceiroNomeCustom={setParceiroNomeCustom}
        imagemUrl={imagemUrl}
        setImagemUrl={setImagemUrl}
        isUploading={isUploading}
        handleUploadImagem={handleUploadImagem}
        descricao={descricao}
        setDescricao={setDescricao}
        isSaving={isSaving}
      />
    </div>
  );
};

export default EnsinoSuperiorPage;
