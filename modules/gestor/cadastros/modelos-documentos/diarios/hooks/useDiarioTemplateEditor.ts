import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../../lib/supabase';
import { useToast } from '../../../../parceiros/components/shared/ToastNotification';
import {
  CapaCampo,
  DEFAULT_CAPA_CAMPOS,
  DEFAULT_DIARIO_TEMPLATE,
  DiarioTemplate,
  diariosService,
} from '../diarios.service';
import { DiarioEditorTab, DiarioUploadKind } from '../diarios-editor.types';

const queryKeys = {
  cursos: ['diario-templates', 'cursos'] as const,
  template: (cursoId: string) => ['diario-templates', cursoId] as const,
};

export const useDiarioTemplateEditor = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const capaInputRef = useRef<HTMLInputElement>(null);
  const contracapaInputRef = useRef<HTMLInputElement>(null);
  const contracapaCustomImageRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; fieldX: number; fieldY: number } | null>(null);
  const formRef = useRef<DiarioTemplate>(DEFAULT_DIARIO_TEMPLATE);
  const selectedCursoRef = useRef('TECNICO');

  const [selectedCurso, setSelectedCursoState] = useState('TECNICO');
  const [form, setFormState] = useState<DiarioTemplate>(DEFAULT_DIARIO_TEMPLATE);
  const [uploading, setUploading] = useState<DiarioUploadKind | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>('curso');
  const [activeTab, setActiveTab] = useState<DiarioEditorTab>('capa');
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [draggingField, setDraggingField] = useState<string | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshairs, setShowCrosshairs] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const setForm = useCallback<React.Dispatch<React.SetStateAction<DiarioTemplate>>>((action) => {
    const next = typeof action === 'function'
      ? (action as (current: DiarioTemplate) => DiarioTemplate)(formRef.current)
      : action;
    formRef.current = next;
    setFormState(next);
  }, []);

  const setSelectedCurso = useCallback<React.Dispatch<React.SetStateAction<string>>>((action) => {
    const next = typeof action === 'function'
      ? (action as (current: string) => string)(selectedCursoRef.current)
      : action;
    selectedCursoRef.current = next;
    setSelectedCursoState(next);
  }, []);

  const { data: cursos = [], isLoading: loadingCursos } = useQuery({
    queryKey: queryKeys.cursos,
    queryFn: diariosService.getCursos,
  });

  const previewPoloId = typeof window === 'undefined'
    ? ''
    : window.sessionStorage.getItem('current_polo_id')
      || window.sessionStorage.getItem('active_polo_id')
      || '';

  const {
    data: previewInstitutionalAssets,
    error: previewInstitutionalAssetsError,
  } = useQuery({
    queryKey: ['diario-template-editor-institutional-assets', previewPoloId],
    queryFn: async () => {
      if (!previewPoloId) return { logoUrl: null, watermark: null };
      const { data, error } = await supabase
        .from('polos')
        .select('id, logo_url')
        .eq('id', previewPoloId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) return { logoUrl: null, watermark: null };
      return {
        logoUrl: data.logo_url || null,
        watermark: await diariosService.getLandscapeWatermark(data.id),
      };
    },
    enabled: Boolean(previewPoloId),
  });

  useEffect(() => {
    if (!selectedCurso && cursos.length) setSelectedCurso(cursos[0].id);
  }, [cursos, selectedCurso]);

  const {
    data: template,
    error: templateError,
    isLoading: loadingTemplate,
  } = useQuery({
    queryKey: queryKeys.template(selectedCurso),
    queryFn: () => diariosService.getTemplate(selectedCurso),
    enabled: !!selectedCurso,
  });

  useEffect(() => {
    if (!template) return;
    setForm({
      ...DEFAULT_DIARIO_TEMPLATE,
      ...template,
      contracapaCampos: template.contracapaCampos || [],
    });
  }, [setForm, template]);

  useEffect(() => {
    if (activeTab === 'capa') setSelectedFieldId('curso');
    else setSelectedFieldId(null);
  }, [activeTab]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new window.ResizeObserver((entries) => {
      for (const entry of entries) setCanvasWidth(entry.contentRect.width);
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [selectedCurso, activeTab, loadingTemplate]);

  const handleMouseDown = (event: React.MouseEvent, fieldId: string, currentX: number, currentY: number) => {
    event.preventDefault();
    setSelectedFieldId(fieldId);
    setDraggingField(fieldId);
    dragStartRef.current = {
      mouseX: event.clientX,
      mouseY: event.clientY,
      fieldX: currentX,
      fieldY: currentY,
    };
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingField || !dragStartRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaX = event.clientX - dragStartRef.current.mouseX;
      const deltaY = event.clientY - dragStartRef.current.mouseY;
      let newX = dragStartRef.current.fieldX + (deltaX / rect.width) * 100;
      let newY = dragStartRef.current.fieldY + (deltaY / rect.height) * 100;

      if (snapToGrid) {
        newX = Math.round(newX);
        newY = Math.round(newY);
      }

      const currentFields = activeTab === 'capa'
        ? (form.capaCampos || DEFAULT_CAPA_CAMPOS)
        : (form.contracapaCampos || []);
      const currentField = currentFields.find((field) => field.id === draggingField);
      const fieldWidth = currentField?.width || 10;
      const fieldHeight = currentField?.id.startsWith('contracapaAssinatura') ? 14 : 5;
      newX = Math.max(0, Math.min(100 - fieldWidth, newX));
      newY = Math.max(0, Math.min(100 - fieldHeight, newY));

      setForm((previous) => {
        const targetKey = activeTab === 'capa' ? 'capaCampos' : 'contracapaCampos';
        const fields = previous[targetKey] || (activeTab === 'capa' ? DEFAULT_CAPA_CAMPOS : []);
        const nextFields = fields.map((field) =>
          field.id === draggingField
            ? { ...field, x: Number(newX.toFixed(1)), y: Number(newY.toFixed(1)) }
            : field,
        );
        return { ...previous, [targetKey]: nextFields };
      });
    };

    const handleMouseUp = () => {
      setDraggingField(null);
      dragStartRef.current = null;
    };

    if (draggingField) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activeTab, draggingField, form.capaCampos, form.contracapaCampos, snapToGrid]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const savedCurso = selectedCursoRef.current;
      const savedForm = formRef.current;
      await diariosService.saveTemplate(savedCurso, savedForm);
      return { savedCurso, savedForm };
    },
    onSuccess: async ({ savedCurso, savedForm }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.template(savedCurso),
          refetchType: formRef.current === savedForm ? 'active' : 'none',
        }),
        // A emissão usa uma chave por UUID do curso, embora o modelo seja salvo
        // por modalidade. Invalide todas as leituras de emissão desse modelo.
        queryClient.invalidateQueries({ queryKey: ['diario-template'] }),
      ]);
      toast.success('Modelo salvo', 'As configurações e layout deste diário foram atualizados.');
    },
    onError: (error: any) => toast.error('Erro ao salvar', error.message),
  });

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>, kind: DiarioUploadKind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const uploadCurso = selectedCursoRef.current;
    if (!file || !uploadCurso) return;

    setUploading(kind);
    try {
      const url = await diariosService.uploadImage(uploadCurso, kind, file);
      if (selectedCursoRef.current !== uploadCurso) {
        throw new Error(
          'A modalidade foi alterada durante o envio. A imagem não foi aplicada a outro modelo; selecione o arquivo novamente.',
        );
      }
      if (kind === 'contracapa_custom') {
        const newField: CapaCampo = {
          id: `logo_${Math.random().toString(36).substr(2, 9)}`,
          label: 'Logo Empresa',
          valuePlaceholder: '',
          x: 82,
          y: 4,
          width: 14,
          fontSize: 10,
          visible: true,
          color: '#071a33',
          bold: false,
          isImage: true,
          imageUrl: url,
          mixBlendMode: 'normal',
        };
        setForm((previous) => ({
          ...previous,
          contracapaCampos: [...(previous.contracapaCampos || []), newField],
        }));
        setSelectedFieldId(newField.id);
        toast.success('Logotipo adicionado', 'Você pode arrastar e redimensionar o logotipo no canvas.');
      } else {
        const targetKey = kind === 'capa' ? 'capaUrl' : 'contracapaUrl';
        setForm((previous) => ({ ...previous, [targetKey]: url }));
        const savedForm = formRef.current;
        await diariosService.saveTemplate(uploadCurso, savedForm);
        // Se o usuário mover outro campo durante o upload, não deixe o refetch
        // sobrescrever essa edição ainda não salva.
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.template(uploadCurso),
            refetchType: formRef.current === savedForm ? 'active' : 'none',
          }),
          queryClient.invalidateQueries({ queryKey: ['diario-template'] }),
        ]);
        toast.success(
          'Imagem enviada',
          kind === 'capa' ? 'Capa visual salva com sucesso.' : 'Fundo da contracapa salvo com sucesso.',
        );
      }
    } catch (error: any) {
      toast.error('Falha no upload', error.message);
    } finally {
      setUploading(null);
    }
  };

  const updateFieldProperty = <K extends keyof CapaCampo>(fieldId: string, property: K, value: CapaCampo[K]) => {
    setForm((previous) => {
      const targetKey = activeTab === 'capa' ? 'capaCampos' : 'contracapaCampos';
      const fields = previous[targetKey] || (activeTab === 'capa' ? DEFAULT_CAPA_CAMPOS : []);
      const next = fields.map((field) => (field.id === fieldId ? { ...field, [property]: value } : field));
      return { ...previous, [targetKey]: next };
    });
  };

  const capaCampos = form.capaCampos || DEFAULT_CAPA_CAMPOS;
  const currentFields = activeTab === 'capa' ? capaCampos : (form.contracapaCampos || []);
  const currentField = currentFields.find((field) => field.id === selectedFieldId);
  const selectedModality = cursos.find((curso) => curso.id === selectedCurso);
  const getPxFontSize = (ptSize: number) => (ptSize * 1.333 * canvasWidth) / 1122;

  return {
    activeTab, canvasRef, capaCampos, capaInputRef, contracapaCustomImageRef,
    contracapaInputRef, cursos, currentField, draggingField, form, getPxFontSize, handleMouseDown,
    handleUpload, loadingCursos, loadingTemplate,
    previewLogoUrl: previewInstitutionalAssets?.logoUrl || null,
    previewWatermark: previewInstitutionalAssets?.watermark,
    previewInstitutionalAssetsError,
    removeToast, saveMutation,
    selectedCurso, selectedFieldId, selectedModality, setActiveTab, setForm, setSelectedCurso,
    setSelectedFieldId, setShowCrosshairs, setShowGrid, setSnapToGrid, showCrosshairs, showGrid,
    snapToGrid, templateError, toasts, updateFieldProperty, uploading,
  };
};
