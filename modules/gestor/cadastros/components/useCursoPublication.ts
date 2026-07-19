import React, { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabase';
import { Curso } from '../cadastros.types';
import { cadastrosService } from '../cadastros.service';
import { parseBRLPrice } from './cursoGradeCurricular.helpers';

type ImageTarget = 'capa' | 'd1' | 'd2';

interface UseCursoPublicationProps {
  curso: Curso;
  onUpdate: () => void;
}

const compressImage = (file: File): Promise<{ blob: Blob; ext: string; type: string }> => (
  new Promise((resolve, reject) => {
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
          (blob) => resolve(blob
            ? { blob, ext, type: format }
            : { blob: file, ext: file.name.split('.').pop() || 'jpg', type: file.type }),
          format,
          0.8
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  })
);

export const useCursoPublication = ({ curso, onUpdate }: UseCursoPublicationProps) => {
  const [publicarSite, setPublicarSite] = useState(false);
  const [imagemUrl, setImagemUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [imagemDetalhe1, setImagemDetalhe1] = useState('');
  const [imagemDetalhe2, setImagemDetalhe2] = useState('');
  const [isUploadingD1, setIsUploadingD1] = useState(false);
  const [isUploadingD2, setIsUploadingD2] = useState(false);
  const [valorCurso, setValorCurso] = useState('');
  const [isSavingValor, setIsSavingValor] = useState(false);
  const usesTurmaFinanceiro = ['TECNICO', 'LIVRE', 'ESPECIALIZACAO'].includes(curso.modalidade);

  useEffect(() => {
    setPublicarSite(curso.publicar_site || false);
    setImagemUrl(curso.imagem_url || '');
    setImagemDetalhe1(curso.imagem_detalhe_1 || '');
    setImagemDetalhe2(curso.imagem_detalhe_2 || '');
    setValorCurso(curso.valor !== null && curso.valor !== undefined
      ? curso.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '');
  }, [
    curso.id,
    curso.publicar_site,
    curso.imagem_url,
    curso.imagem_detalhe_1,
    curso.imagem_detalhe_2,
    curso.valor
  ]);

  const cursoWithPublication = (overrides: Partial<Curso> = {}): Curso => ({
    ...curso,
    publicar_site: publicarSite,
    imagem_url: imagemUrl || null,
    imagem_detalhe_1: imagemDetalhe1 || null,
    imagem_detalhe_2: imagemDetalhe2 || null,
    valor: parseBRLPrice(valorCurso),
    ...overrides
  });

  const handleTogglePublicarSite = async () => {
    const nextVal = !publicarSite;
    setPublicarSite(nextVal);
    try {
      await cadastrosService.updateCurso(cursoWithPublication({ publicar_site: nextVal }));
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
      await cadastrosService.updateCurso(cursoWithPublication({ valor: parsedVal }));
      setValorCurso(parsedVal !== null
        ? parsedVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        : '');
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar o preço do curso.');
    } finally {
      setIsSavingValor(false);
    }
  };

  const uploadImageGeneric = async (file: File, target: ImageTarget) => {
    if (target === 'capa') setIsUploading(true);
    if (target === 'd1') setIsUploadingD1(true);
    if (target === 'd2') setIsUploadingD2(true);
    try {
      const { blob, ext, type } = await compressImage(file);
      const compressedFile = new File([blob], `curso_${target}_${Date.now()}.${ext}`, { type });
      const filePath = `cursos/curso_${target}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('documentos')
        .upload(filePath, compressedFile, {
          cacheControl: '31536000',
          upsert: true,
          contentType: type
        });

      if (error) throw error;
      const { data: urlData } = supabase.storage.from('documentos').getPublicUrl(data.path);
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
      } else {
        setImagemDetalhe2(nextUrl);
        newD2 = nextUrl;
      }

      await cadastrosService.updateCurso(cursoWithPublication({
        imagem_url: newCapa || null,
        imagem_detalhe_1: newD1 || null,
        imagem_detalhe_2: newD2 || null
      }));
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

  const removeImageGeneric = async (target: ImageTarget) => {
    if (!confirm('Tem certeza de que deseja remover esta imagem?')) return;

    let newCapa = imagemUrl;
    let newD1 = imagemDetalhe1;
    let newD2 = imagemDetalhe2;
    if (target === 'capa') {
      setImagemUrl('');
      newCapa = '';
    } else if (target === 'd1') {
      setImagemDetalhe1('');
      newD1 = '';
    } else {
      setImagemDetalhe2('');
      newD2 = '';
    }

    try {
      await cadastrosService.updateCurso(cursoWithPublication({
        imagem_url: newCapa || null,
        imagem_detalhe_1: newD1 || null,
        imagem_detalhe_2: newD2 || null
      }));
      onUpdate();
    } catch (err) {
      console.error(err);
      alert('Erro ao remover imagem.');
    }
  };

  const handleUpload = (target: ImageTarget) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) uploadImageGeneric(file, target);
  };

  return {
    publicarSite,
    imagemUrl,
    imagemDetalhe1,
    imagemDetalhe2,
    isUploading,
    isUploadingD1,
    isUploadingD2,
    valorCurso,
    isSavingValor,
    usesTurmaFinanceiro,
    setValorCurso,
    handleTogglePublicarSite,
    handleSaveValorCurso,
    handleUploadImagem: handleUpload('capa'),
    handleUploadImagemD1: handleUpload('d1'),
    handleUploadImagemD2: handleUpload('d2'),
    handleRemoverImagem: () => removeImageGeneric('capa'),
    handleRemoverImagemD1: () => removeImageGeneric('d1'),
    handleRemoverImagemD2: () => removeImageGeneric('d2')
  };
};
