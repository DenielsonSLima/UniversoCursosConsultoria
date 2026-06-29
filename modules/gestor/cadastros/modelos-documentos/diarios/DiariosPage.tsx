import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import {
  BookOpenCheck,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Save,
  Settings2,
  Upload,
  X,
  Move,
  Eye,
  EyeOff,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  RotateCcw,
  QrCode,
  Sparkles,
  Trash2,
} from 'lucide-react';
import ToastNotification, { useToast } from '../../../parceiros/components/shared/ToastNotification';
import capaDiarioPadrao from '../../../../../Documentos/Capa-Diario.jpg';
import {
  DEFAULT_DIARIO_TEMPLATE,
  DEFAULT_CAPA_CAMPOS,
  DEFAULT_CONTRACAPA_CAMPOS,
  DiarioTemplate,
  CapaCampo,
  diariosService,
} from './diarios.service';
import { getDocumentValidationQrUrl } from '../../../../shared/document-validation/document-validation.url';
import { assinaturasService, AssinaturasData } from '../../../configuracoes/assinaturas/assinaturas.service';

const queryKeys = {
  cursos: ['diario-templates', 'cursos'] as const,
  template: (cursoId: string) => ['diario-templates', cursoId] as const,
};

const DiariosPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const capaInputRef = useRef<HTMLInputElement>(null);
  const contracapaInputRef = useRef<HTMLInputElement>(null);
  const contracapaCustomImageRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const [selectedCurso, setSelectedCurso] = useState('TECNICO');
  const [form, setForm] = useState<DiarioTemplate>(DEFAULT_DIARIO_TEMPLATE);
  const [uploading, setUploading] = useState<'capa' | 'contracapa' | 'contracapa_custom' | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>('curso');
  const [activeTab, setActiveTab] = useState<'capa' | 'contracapa' | 'textos'>('capa');
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [draggingField, setDraggingField] = useState<string | null>(null);
  
  // Design Helper States
  const [showGrid, setShowGrid] = useState(true);
  const [showCrosshairs, setShowCrosshairs] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true); // snaps to 1% steps
  
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; fieldX: number; fieldY: number } | null>(null);

  const { data: cursos = [], isLoading: loadingCursos } = useQuery({
    queryKey: queryKeys.cursos,
    queryFn: diariosService.getCursos,
  });

  const { data: previewWatermark } = useQuery({
    queryKey: ['preview-watermark'],
    queryFn: async () => {
      const { data } = await supabase.from('polos').select('id').limit(1).maybeSingle();
      if (data?.id) {
        return diariosService.getLandscapeWatermark(data.id);
      }
      return null;
    }
  });

  // Fetch Central Signatures
  const { data: centralSignatures } = useQuery({
    queryKey: ['central-signatures'],
    queryFn: () => assinaturasService.getSignatures(),
  });

  useEffect(() => {
    if (!selectedCurso && cursos.length) setSelectedCurso(cursos[0].id);
  }, [cursos, selectedCurso]);

  const { data: template, isLoading: loadingTemplate } = useQuery({
    queryKey: queryKeys.template(selectedCurso),
    queryFn: () => diariosService.getTemplate(selectedCurso),
    enabled: !!selectedCurso,
  });

  useEffect(() => {
    if (template) {
      setForm({
        ...DEFAULT_DIARIO_TEMPLATE,
        ...template,
        contracapaCampos: template.contracapaCampos || [],
      });
    }
  }, [template]);

  // Track active tab to auto-select a valid field (only when activeTab === 'capa')
  useEffect(() => {
    if (activeTab === 'capa') {
      setSelectedFieldId('curso');
    } else {
      setSelectedFieldId(null);
    }
  }, [activeTab]);

  // Track Canvas width to scale fonts dynamically
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setCanvasWidth(entry.contentRect.width);
      }
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [selectedCurso, activeTab, loadingTemplate]);

  // Drag and drop mouse handlers (active for Front Cover and Back Cover fields)
  const handleMouseDown = (e: React.MouseEvent, fieldId: string, currentX: number, currentY: number) => {
    e.preventDefault();
    setSelectedFieldId(fieldId);
    setDraggingField(fieldId);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      fieldX: currentX,
      fieldY: currentY,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingField || !dragStartRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStartRef.current.mouseX;
      const deltaY = e.clientY - dragStartRef.current.mouseY;

      // Convert delta px to percentage
      const pctDeltaX = (deltaX / rect.width) * 100;
      const pctDeltaY = (deltaY / rect.height) * 100;

      let newX = dragStartRef.current.fieldX + pctDeltaX;
      let newY = dragStartRef.current.fieldY + pctDeltaY;

      // Snap to Grid (1% steps)
      if (snapToGrid) {
        newX = Math.round(newX);
        newY = Math.round(newY);
      }

      // Restrict to bounds [0, 100]
      const currentFields = activeTab === 'capa' 
        ? (form.capaCampos || DEFAULT_CAPA_CAMPOS) 
        : (form.contracapaCampos || []);
      const fieldWidth = currentFields.find(f => f.id === draggingField)?.width || 10;
      newX = Math.max(0, Math.min(100 - fieldWidth, newX));
      newY = Math.max(0, Math.min(95, newY));

      setForm((prev) => {
        const targetKey = activeTab === 'capa' ? 'capaCampos' : 'contracapaCampos';
        const fields = prev[targetKey] || (activeTab === 'capa' ? DEFAULT_CAPA_CAMPOS : []);
        const nextFields = fields.map((f) =>
          f.id === draggingField ? { ...f, x: Number(newX.toFixed(1)), y: Number(newY.toFixed(1)) } : f
        );
        return { ...prev, [targetKey]: nextFields };
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
  }, [draggingField, form.capaCampos, form.contracapaCampos, snapToGrid, activeTab]);

  const saveMutation = useMutation({
    mutationFn: () => diariosService.saveTemplate(selectedCurso, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.template(selectedCurso) });
      toast.success('Modelo salvo', 'As configurações e layout deste diário foram atualizados.');
    },
    onError: (error: any) => toast.error('Erro ao salvar', error.message),
  });

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: 'capa' | 'contracapa' | 'contracapa_custom',
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedCurso) return;

    setUploading(kind);
    try {
      const url = await diariosService.uploadImage(selectedCurso, kind, file);
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
        setForm(prev => ({
          ...prev,
          contracapaCampos: [...(prev.contracapaCampos || []), newField]
        }));
        setSelectedFieldId(newField.id);
        toast.success('Logotipo adicionado', 'Você pode arrastar e redimensionar o logotipo no canvas.');
      } else {
        const next = {
          ...form,
          [kind === 'capa' ? 'capaUrl' : 'contracapaUrl']: url,
        };
        setForm(next);
        await diariosService.saveTemplate(selectedCurso, next);
        await queryClient.invalidateQueries({ queryKey: queryKeys.template(selectedCurso) });
        toast.success('Imagem enviada', `${kind === 'capa' ? 'Capa' : 'Contracapa'} salva com sucesso.`);
      }
    } catch (error: any) {
      toast.error('Falha no upload', error.message);
    } finally {
      setUploading(null);
    }
  };

  const updateFieldProperty = <K extends keyof CapaCampo>(fieldId: string, property: K, value: CapaCampo[K]) => {
    setForm((prev) => {
      const targetKey = activeTab === 'capa' ? 'capaCampos' : 'contracapaCampos';
      const fields = prev[targetKey] || (activeTab === 'capa' ? DEFAULT_CAPA_CAMPOS : []);
      const next = fields.map((f) => (f.id === fieldId ? { ...f, [property]: value } : f));
      return { ...prev, [targetKey]: next };
    });
  };

  const applyCentralSignature = (slot: 1 | 2, roleId: 'diretoriaGeral' | 'secretaria' | 'coordenacao' | 'financeiro') => {
    if (!centralSignatures) return;
    const url = centralSignatures[roleId] || '';
    const nomeKey = `${roleId}Nome` as keyof AssinaturasData;
    const cargoKey = `${roleId}Cargo` as keyof AssinaturasData;
    const nome = (centralSignatures[nomeKey] as string) || '';
    const cargo = (centralSignatures[cargoKey] as string) || '';

    if (!url) {
      toast.error('Assinatura não cadastrada', 'Adicione a imagem de assinatura correspondente em Configurações.');
      return;
    }

    // Auto-fill text inputs based on central signatures config
    setForm(prev => {
      const updated: Partial<DiarioTemplate> = {};
      if (slot === 1) {
        updated.diretorNome = nome || prev.diretorNome;
        updated.diretorCargo = cargo || prev.diretorCargo;
        updated.diretorAssinaturaRole = roleId;
      } else {
        updated.secretarioNome = nome || prev.secretarioNome;
        updated.secretarioCargo = cargo || prev.secretarioCargo;
        updated.secretarioAssinaturaRole = roleId;
      }

      // Check if signature field already exists in contracapaCampos, otherwise create
      const fieldId = slot === 1 ? 'signature_diretor' : 'signature_secretario';
      const currentFields = prev.contracapaCampos || [];
      const exists = currentFields.some(f => f.id === fieldId);

      let nextFields = currentFields;
      if (exists) {
        nextFields = currentFields.map(f => f.id === fieldId ? { ...f, imageUrl: url, visible: true } : f);
      } else {
        const newSigField: CapaCampo = {
          id: fieldId,
          label: slot === 1 ? 'Assinatura Diretor' : 'Assinatura Secretário',
          valuePlaceholder: '',
          x: slot === 1 ? 23 : 65,
          y: 72,
          width: 15,
          fontSize: 10,
          visible: true,
          color: '#071a33',
          bold: false,
          isImage: true,
          imageUrl: url,
          mixBlendMode: 'multiply',
        };
        nextFields = [...currentFields, newSigField];
      }

      setSelectedFieldId(fieldId);
      return {
        ...prev,
        ...updated,
        contracapaCampos: nextFields
      };
    });

    toast.success('Assinatura aplicada', 'O nome, cargo e a assinatura digitalizada foram sincronizados e posicionados.');
  };

  const selectedModality = cursos.find((c) => c.id === selectedCurso);
  
  const capaCampos = form.capaCampos || DEFAULT_CAPA_CAMPOS;
  const currentFields = activeTab === 'capa' ? capaCampos : (form.contracapaCampos || []);

  const currentField = currentFields.find((f) => f.id === selectedFieldId);

  // Convert font size from pt to px relative to A4 aspect ratio (design width 1122px)
  const getPxFontSize = (ptSize: number) => {
    return (ptSize * 1.333 * canvasWidth) / 1122;
  };

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm animate-fadeIn">
      <input ref={capaInputRef} type="file" accept="image/*" hidden onChange={(e) => handleUpload(e, 'capa')} />
      <input ref={contracapaInputRef} type="file" accept="image/*" hidden onChange={(e) => handleUpload(e, 'contracapa')} />
      <input ref={contracapaCustomImageRef} type="file" accept="image/*" hidden onChange={(e) => handleUpload(e, 'contracapa_custom')} />

      <div className="relative border-b border-slate-100 bg-[#001a33] px-6 py-7 text-white md:px-8">
        <div className="absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_center,rgba(37,99,235,.35),transparent_68%)]" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-blue-200">
              <BookOpenCheck size={30} />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Modelos de Diários</h3>
              <p className="mt-1 text-sm font-medium text-slate-300">Layout da capa, validação na contracapa e textos de diários por modalidade.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!selectedCurso || saveMutation.isPending}
            className="flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-xs font-black uppercase tracking-wider text-[#001a33] shadow-lg transition hover:bg-blue-50 disabled:opacity-60"
          >
            {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar configurações
          </button>
        </div>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        {/* Upper Selection Tabs for "Modalidades de Cursos" */}
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-slate-400">Modalidades de Cursos</p>
          {loadingCursos ? (
            <div className="flex items-center gap-2 py-4 text-xs font-bold text-slate-500">
              <Loader2 className="animate-spin text-blue-600" size={16} /> Carregando modalidades...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-2xl bg-slate-100/70 p-1.5 border border-slate-200/50">
              {cursos.map((curso) => {
                const isSelected = selectedCurso === curso.id;
                return (
                  <button
                    key={curso.id}
                    type="button"
                    onClick={() => setSelectedCurso(curso.id)}
                    className={`flex flex-col items-center justify-center rounded-xl py-3 px-4 text-center transition-all ${
                      isSelected
                        ? 'bg-white text-blue-700 shadow-sm border border-slate-200/10 font-bold'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white/40 border border-transparent'
                    }`}
                  >
                    <span className="text-xs font-bold leading-tight">{curso.nome}</span>
                    <span className="mt-0.5 text-[8.5px] font-black uppercase tracking-widest text-slate-400 leading-none">Modelo Geral</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Content Details */}
        {loadingTemplate ? (
          <div className="flex min-h-[520px] items-center justify-center gap-3 text-sm font-bold text-slate-500">
            <Loader2 className="animate-spin text-blue-600" /> Carregando modelo…
          </div>
        ) : selectedModality ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-600">Configurando Capa de</p>
                <h4 className="mt-1 text-2xl font-black text-[#001a33]">{selectedModality.nome}</h4>
              </div>
              <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('capa')}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                    activeTab === 'capa' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Capa Frontal
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('contracapa')}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                    activeTab === 'contracapa' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Contracapa (Validação)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('textos')}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                    activeTab === 'textos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Textos Gerais
                </button>
              </div>
            </div>

            {(activeTab === 'capa' || activeTab === 'contracapa') && (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-8 animate-fadeIn">
                {/* Left Column: Visual Editor Canvas */}
                <div className="space-y-6">
                  <div className="relative">
                    <div className="mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {activeTab === 'capa' 
                          ? 'Editor da Capa (Clique e arraste os textos)' 
                          : 'Visualização da Contracapa (Clique para selecionar/arrastar assinaturas e logos)'}
                      </p>
                      {/* Ruler and Snap helpers */}
                      <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showGrid}
                            onChange={(e) => setShowGrid(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
                          />
                          Grade 10%
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showCrosshairs}
                            onChange={(e) => setShowCrosshairs(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
                          />
                          Linhas Guia
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={snapToGrid}
                            onChange={(e) => setSnapToGrid(e.target.checked)}
                            className="h-3.5 w-3.5 rounded border-slate-300 accent-blue-600"
                          />
                          Atrair (Snap)
                        </label>
                      </div>
                    </div>
                    
                    <div
                      ref={canvasRef}
                      className="relative w-full aspect-[297/210] overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-inner select-none"
                    >
                      {/* Background Cover Image */}
                      {activeTab === 'capa' ? (
                        <img
                          src={form.capaUrl || capaDiarioPadrao}
                          alt="Capa do Diário"
                          className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0"
                        />
                      ) : form.contracapaUrl ? (
                        <img
                          src={form.contracapaUrl}
                          alt="Contracapa do Diário"
                          className="absolute inset-0 w-full h-full object-fill pointer-events-none z-0"
                        />
                      ) : (
                        // Render watermark as background of the contracapa canvas if no custom bg
                        previewWatermark?.url && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 overflow-hidden select-none">
                            <img
                              src={previewWatermark.url}
                              alt="Marca d'água"
                              style={{
                                width: `${previewWatermark.scale}%`,
                                opacity: previewWatermark.opacity,
                                transform: previewWatermark.rotate ? 'rotate(-22deg)' : 'none',
                                objectFit: 'contain',
                              }}
                            />
                          </div>
                        )
                      )}

                      {/* Grid lines overlay (Ruler) */}
                      {showGrid && (
                        <div className="absolute inset-0 pointer-events-none z-0">
                          {Array.from({ length: 9 }).map((_, i) => (
                            <div
                              key={`v-${i}`}
                              className="absolute h-full border-l border-dashed border-slate-300/40"
                              style={{ left: `${(i + 1) * 10}%` }}
                            />
                          ))}
                          {Array.from({ length: 9 }).map((_, i) => (
                            <div
                              key={`h-${i}`}
                              className="absolute w-full border-t border-dashed border-slate-300/40"
                              style={{ top: `${(i + 1) * 10}%` }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Selected field crosshairs alignment lines */}
                      {currentField && showCrosshairs && (
                        <div className="absolute inset-0 pointer-events-none z-0">
                          <div
                            className="absolute h-full border-l border-blue-400/60"
                            style={{ left: `${currentField.x}%` }}
                          />
                          <div
                            className="absolute w-full border-t border-blue-400/60"
                            style={{ top: `${currentField.y}%` }}
                          />
                        </div>
                      )}

                      {/* CAPA: Interactive fields overlay */}
                      {activeTab === 'capa' ? (
                        capaCampos
                          .filter((field) => field.visible)
                          .map((field) => {
                            const isSelected = selectedFieldId === field.id;
                            const isDragging = draggingField === field.id;
                            const fontSizePx = getPxFontSize(field.fontSize);

                            return (
                              <div
                                key={field.id}
                                onMouseDown={(e) => handleMouseDown(e, field.id, field.x, field.y)}
                                className={`absolute p-1 group transition-colors border ${
                                  isSelected
                                    ? 'border-blue-500 bg-blue-50/20 shadow-sm z-10'
                                    : 'border-transparent hover:border-slate-300 hover:bg-slate-100/10'
                                }`}
                                style={{
                                  left: `${field.x}%`,
                                  top: `${field.y}%`,
                                  width: `${field.width}%`,
                                  cursor: isDragging ? 'grabbing' : 'grab',
                                }}
                              >
                                {isSelected && (
                                  <div className="absolute -top-6 left-0 flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm pointer-events-none">
                                    <Move size={8} />
                                    {field.x}% , {field.y}%
                                  </div>
                                )}
                                
                                <div
                                  style={{
                                    fontSize: `${fontSizePx}px`,
                                    fontWeight: field.bold ? 'bold' : 'normal',
                                    color: field.color || '#071a33',
                                    textAlign: field.align || 'left',
                                    borderTop: field.borderTop ? `1px solid ${field.color || '#071a33'}` : 'none',
                                    paddingTop: field.borderTop ? '3px' : '0px',
                                    lineHeight: '1.2',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {field.label && <strong>{field.label}</strong>}
                                  {field.valuePlaceholder}
                                </div>
                              </div>
                            );
                          })
                      ) : (
                        // CONTRACAPA: Beautiful organized structured card layout with transparent backgrounds
                        form.imprimirValidacaoContracapa && (
                          <>
                            {/* Structured base card */}
                            <div className="absolute inset-[5%_6%_5%_8%] border border-[#071a33]/25 p-5 flex flex-col justify-between rounded-xl text-[#071a33] z-10 overflow-hidden pointer-events-none select-none">
                              {/* Header (No Cabecalho subtitle, Title in 2 lines, No Documento Oficial tag) */}
                              <div className="flex justify-between items-start border-b border-[#071a33]/15 pb-2 text-left">
                                <div className="w-full">
                                  <h3 className="text-[12px] font-black uppercase tracking-tight leading-snug w-[75%]">
                                    Registro de Validação<br />e Assinatura Eletrônica
                                  </h3>
                                </div>
                              </div>

                              {/* Details and QR Code Box */}
                              <div className="grid grid-cols-[1fr_125px] gap-4 my-2 text-[8px] text-left leading-tight">
                                <div className="space-y-1.5">
                                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                    <div><strong>CURSO:</strong> [Nome do Curso]</div>
                                    <div><strong>TURMA:</strong> [Nome da Turma]</div>
                                    <div className="col-span-2"><strong>UNIDADE EDUCACIONAL:</strong> [Componente Curricular]</div>
                                    <div><strong>MÓDULO:</strong> [Módulo I]</div>
                                    <div><strong>PROFESSOR(A):</strong> [Nome do Professor]</div>
                                  </div>
                                  
                                  <div className="border-t border-[#071a33]/10 pt-1 text-slate-600 font-medium leading-normal text-[7.5px]">
                                    {form.mensagemValidacao || 'Este diário de classe eletrônico foi gerado e assinado digitalmente nos termos do Regimento Escolar da instituição e da legislação de validação de documentos acadêmicos do Ministério da Educação.'}
                                  </div>
                                  
                                  <div className="bg-slate-50/30 border border-slate-100/30 p-1.5 rounded font-mono text-[7px] text-slate-500">
                                    <div><strong>Chave de Autenticação:</strong> DIA-TECNICO-XXXXXXXX</div>
                                    <div className="mt-0.5"><strong>Endereço de Validação:</strong> www.universocock.com.br/validador</div>
                                  </div>
                                </div>
                                
                                {/* Actual QR Code image preview with code label underneath */}
                                <div className="flex flex-col items-center justify-center border-l border-slate-200/20 pl-2">
                                  <img
                                    src={getDocumentValidationQrUrl('DIA-TECNICO-XXXXXXXX', 150)}
                                    alt="QR Code"
                                    className="bg-white p-1 border border-slate-200 rounded"
                                    style={{
                                      width: `${form.qrCodeSize || 28}mm`,
                                      height: `${form.qrCodeSize || 28}mm`,
                                      maxWidth: '75px',
                                      maxHeight: '75px',
                                      objectFit: 'contain',
                                    }}
                                  />
                                  <div className="text-center mt-1">
                                    <span className="block text-[4.5px] font-black text-slate-400 tracking-widest leading-none">CÓD. VALIDAÇÃO</span>
                                    <span className="block text-[5.5px] font-mono font-bold text-blue-600 leading-none mt-0.5">DIA-TECNICO-XXXXXXXX</span>
                                  </div>
                                </div>
                              </div>

                              {/* Signature lines base (Names and Cargo) */}
                              <div className="grid grid-cols-2 gap-8 text-center border-t border-[#071a33]/10 pt-2 text-[8px]">
                                <div className="flex flex-col items-center justify-end h-10">
                                  <div className="border-b border-slate-400 w-full mb-0.5"></div>
                                  <p className="font-bold leading-none">{form.diretorNome || '—'}</p>
                                  <p className="text-[6.5px] text-slate-500 uppercase font-black mt-0.5 leading-none">{form.diretorCargo || 'Diretor(a) Geral'}</p>
                                </div>

                                <div className="flex flex-col items-center justify-end h-10">
                                  <div className="border-b border-slate-400 w-full mb-0.5"></div>
                                  <p className="font-bold leading-none">{form.secretarioNome || '—'}</p>
                                  <p className="text-[6.5px] text-slate-500 uppercase font-black mt-0.5 leading-none">{form.secretarioCargo || 'Secretaria Acadêmica'}</p>
                                </div>
                              </div>
                            </div>

                            {/* Render draggable, resizable absolute fields (Logos and Signatures) */}
                            {(form.contracapaCampos || [])
                              .filter((field) => field.visible)
                              .map((field) => {
                                const isSelected = selectedFieldId === field.id;
                                const isDragging = draggingField === field.id;

                                return (
                                  <div
                                    key={field.id}
                                    onMouseDown={(e) => handleMouseDown(e, field.id, field.x, field.y)}
                                    className={`absolute p-1 group border transition-all ${
                                      isSelected
                                        ? 'border-blue-500 bg-blue-50/20 shadow-sm z-20'
                                        : 'border-transparent hover:border-slate-300 hover:bg-slate-100/10 z-10'
                                    }`}
                                    style={{
                                      left: `${field.x}%`,
                                      top: `${field.y}%`,
                                      width: `${field.width}%`,
                                      cursor: isDragging ? 'grabbing' : 'grab',
                                    }}
                                  >
                                    {isSelected && (
                                      <div className="absolute -top-6 left-0 flex items-center gap-1 rounded bg-blue-600 px-1.5 py-0.5 text-[8px] font-black text-white shadow-sm pointer-events-none">
                                        <Move size={8} />
                                        {field.x}% , {field.y}%
                                      </div>
                                    )}

                                    {field.isImage ? (
                                      <img
                                        src={field.imageUrl}
                                        alt={field.label}
                                        className="w-full h-auto object-contain pointer-events-none"
                                        style={{ mixBlendMode: field.mixBlendMode || 'multiply' }}
                                      />
                                    ) : (
                                      <div
                                        style={{
                                          fontSize: `${getPxFontSize(field.fontSize)}px`,
                                          fontWeight: field.bold ? 'bold' : 'normal',
                                          color: field.color || '#071a33',
                                          textAlign: field.align || 'left',
                                          borderTop: field.borderTop ? `1px solid ${field.color || '#071a33'}` : 'none',
                                          paddingTop: field.borderTop ? '3px' : '0px',
                                          lineHeight: '1.2',
                                          wordBreak: 'break-word',
                                        }}
                                      >
                                        {field.label && <strong>{field.label}</strong>}
                                        {field.valuePlaceholder}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </>
                        )
                      )}
                    </div>
                  </div>

                  {/* Image uploads block */}
                  <div className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <ImageUploader
                        title="Capa frontal"
                        description="Primeira página do diário"
                        imageUrl={form.capaUrl || capaDiarioPadrao}
                        usingDefault={!form.capaUrl}
                        loading={uploading === 'capa'}
                        onSelect={() => capaInputRef.current?.click()}
                        onRemove={() => setForm((current) => ({ ...current, capaUrl: null }))}
                      />
                      <ImageUploader
                        title="Verso / contracapa (Fundo de Imagem)"
                        description="Imagem de fundo opcional"
                        imageUrl={form.contracapaUrl}
                        loading={uploading === 'contracapa'}
                        onSelect={() => contracapaInputRef.current?.click()}
                        onRemove={() => setForm((current) => ({ ...current, contracapaUrl: null }))}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Properties Panel (Capa/Contracapa Fields) or Configuration Panel (Contracapa) */}
                <div className="space-y-6">
                  {/* Render Field Properties Sidebar if a field is currently selected */}
                  {selectedFieldId && currentField ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4 animate-fadeIn">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-800">
                          {currentField.isImage ? 'Propriedades da Imagem' : 'Propriedades do Campo'}
                        </h5>
                        <button
                          type="button"
                          onClick={() => setSelectedFieldId(null)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800"
                        >
                          Fechar Propriedades
                        </button>
                      </div>

                      {/* Image-specific fields */}
                      {currentField.isImage ? (
                        <>
                          <div className="block">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Largura / Tamanho (%)
                              </span>
                              <span className="text-xs font-bold text-slate-700">{currentField.width}%</span>
                            </div>
                            <input
                              type="range"
                              min="5"
                              max="80"
                              value={currentField.width}
                              onChange={(e) => updateFieldProperty(currentField.id, 'width', parseInt(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          </div>

                          <div>
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Modo de Mesclagem
                            </span>
                            <div className="flex rounded-xl bg-slate-100 p-1">
                              {(['normal', 'multiply'] as const).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => updateFieldProperty(currentField.id, 'mixBlendMode', mode)}
                                  className={`flex-1 rounded-lg py-1.5 text-[9px] font-bold tracking-tight transition ${
                                    currentField.mixBlendMode === mode || (!currentField.mixBlendMode && mode === 'normal')
                                      ? 'bg-white text-slate-800 shadow-sm'
                                      : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  {mode === 'normal' ? 'Sem Transparência' : 'Fundo Transparente'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        // Text-specific fields
                        <>
                          <label className="block">
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Rótulo / Prefixo
                            </span>
                            <input
                              type="text"
                              value={currentField.label}
                              onChange={(e) => updateFieldProperty(currentField.id, 'label', e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                            />
                          </label>

                          <div className="block">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Tamanho da Fonte
                              </span>
                              <span className="text-xs font-bold text-slate-700">{currentField.fontSize}pt</span>
                            </div>
                            <input
                              type="range"
                              min="8"
                              max="32"
                              value={currentField.fontSize}
                              onChange={(e) => updateFieldProperty(currentField.id, 'fontSize', parseInt(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          </div>

                          <div className="block">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                Largura do Campo
                              </span>
                              <span className="text-xs font-bold text-slate-700">{currentField.width}%</span>
                            </div>
                            <input
                              type="range"
                              min="10"
                              max="100"
                              value={currentField.width}
                              onChange={(e) => updateFieldProperty(currentField.id, 'width', parseInt(e.target.value))}
                              className="w-full accent-blue-600"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => updateFieldProperty(currentField.id, 'bold', !currentField.bold)}
                              className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition ${
                                currentField.bold
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <Bold size={14} /> Negrito
                            </button>

                            <button
                              type="button"
                              onClick={() => updateFieldProperty(currentField.id, 'borderTop', !currentField.borderTop)}
                              className={`flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition ${
                                currentField.borderTop
                                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <Type size={14} /> Assinatura (Linha)
                            </button>
                          </div>

                          <div>
                            <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Alinhamento
                            </span>
                            <div className="flex rounded-xl bg-slate-100 p-1">
                              {(['left', 'center', 'right'] as const).map((align) => (
                                <button
                                  key={align}
                                  type="button"
                                  onClick={() => updateFieldProperty(currentField.id, 'align', align)}
                                  className={`flex flex-1 items-center justify-center rounded-lg py-1.5 transition ${
                                    currentField.align === align || (!currentField.align && align === 'left')
                                      ? 'bg-white text-slate-800 shadow-sm'
                                      : 'text-slate-500 hover:text-slate-800'
                                  }`}
                                >
                                  {align === 'left' && <AlignLeft size={14} />}
                                  {align === 'center' && <AlignCenter size={14} />}
                                  {align === 'right' && <AlignRight size={14} />}
                                </button>
                              ))}
                            </div>
                        </div>

                        <div className="block">
                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Cor do Texto
                          </span>
                          <div className="flex items-center gap-3">
                            <input
                              type="color"
                              value={currentField.color || '#071a33'}
                              onChange={(e) => updateFieldProperty(currentField.id, 'color', e.target.value)}
                              className="h-8 w-8 cursor-pointer rounded border border-slate-200"
                            />
                            <input
                              type="text"
                              value={currentField.color || '#071a33'}
                              onChange={(e) => updateFieldProperty(currentField.id, 'color', e.target.value)}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {/* Position adjustments */}
                    <div>
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Ajuste Fino de Posição
                      </span>
                      <div className="grid grid-cols-3 gap-2 max-w-[180px] mx-auto text-center">
                        <div />
                        <button
                          type="button"
                          onClick={() => updateFieldProperty(currentField.id, 'y', Math.max(0, currentField.y - 0.5))}
                          className="rounded bg-slate-100 p-2 text-xs font-bold hover:bg-slate-200"
                        >
                          ▲
                        </button>
                        <div />
                        <button
                          type="button"
                          onClick={() => updateFieldProperty(currentField.id, 'x', Math.max(0, currentField.x - 0.5))}
                          className="rounded bg-slate-100 p-2 text-xs font-bold hover:bg-slate-200"
                        >
                          ◀
                        </button>
                        <div className="flex items-center justify-center text-[10px] font-bold text-slate-400">
                          Pos
                        </div>
                        <button
                          type="button"
                          onClick={() => updateFieldProperty(currentField.id, 'x', Math.min(100 - currentField.width, currentField.x + 0.5))}
                          className="rounded bg-slate-100 p-2 text-xs font-bold hover:bg-slate-200"
                        >
                          ▶
                        </button>
                        <div />
                        <button
                          type="button"
                          onClick={() => updateFieldProperty(currentField.id, 'y', Math.min(95, currentField.y + 0.5))}
                          className="rounded bg-slate-100 p-2 text-xs font-bold hover:bg-slate-200"
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    {/* Excluir/remover button for signature & custom logos */}
                    {(currentField.id.startsWith('logo_') || currentField.id.startsWith('signature_')) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Deseja excluir esta imagem do layout?')) {
                            setForm(prev => {
                              const targetKey = activeTab === 'capa' ? 'capaCampos' : 'contracapaCampos';
                              const fields = prev[targetKey] || [];
                              return { ...prev, [targetKey]: fields.filter(f => f.id !== currentField.id) };
                            });
                            setSelectedFieldId(null);
                          }
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-50 hover:bg-red-100 py-2.5 text-xs font-bold text-red-600 transition"
                      >
                        <Trash2 size={14} /> Excluir do Layout
                      </button>
                    )}
                  </div>
                ) : activeTab === 'capa' ? (
                  // Front Cover options when no field is selected
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Campos da Capa
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Redefinir posições padrão da capa?')) {
                            setForm((prev) => ({
                              ...prev,
                              capaCampos: DEFAULT_CAPA_CAMPOS,
                            }));
                          }
                        }}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-red-500"
                      >
                        <RotateCcw size={12} /> Redefinir
                      </button>
                    </div>
                    <div className="space-y-1">
                      {capaCampos.map((field) => (
                        <div
                          key={field.id}
                          onClick={() => setSelectedFieldId(field.id)}
                          className={`flex items-center justify-between rounded-xl px-3 py-2 cursor-pointer transition ${
                            selectedFieldId === field.id
                              ? 'bg-blue-50 text-blue-700 font-bold'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <span className="text-xs flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                field.visible ? 'bg-emerald-500' : 'bg-slate-300'
                              }`}
                            />
                            {field.id === 'curso' && 'Curso'}
                            {field.id === 'modulo' && 'Módulo'}
                            {field.id === 'areaTematica' && 'Área Temática'}
                            {field.id === 'disciplina' && 'Disciplina'}
                            {field.id === 'turma' && 'Turma'}
                            {field.id === 'professor' && 'Professor'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateFieldProperty(field.id, 'visible', !field.visible);
                            }}
                            className="text-slate-400 hover:text-slate-700 p-1"
                          >
                            {field.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Contracapa options when no field is selected
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2">
                      Configurar Contracapa
                    </h5>

                    <label className="flex items-center gap-3 cursor-pointer pb-2 border-b border-slate-100">
                      <input
                        type="checkbox"
                        checked={form.imprimirValidacaoContracapa || false}
                        onChange={(e) => setForm({ ...form, imprimirValidacaoContracapa: e.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                      />
                      <div>
                        <span className="block text-xs font-bold text-slate-800">Imprimir Validação no Verso</span>
                        <span className="text-[10px] text-slate-500 font-medium">Habilita o cartão de validação.</span>
                      </div>
                    </label>

                    {/* Message / Regulamento */}
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">
                        Mensagem de Validação / Regulamento
                      </span>
                      <textarea
                        value={form.mensagemValidacao || ''}
                        onChange={(e) => setForm({ ...form, mensagemValidacao: e.target.value })}
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-blue-400 focus:bg-white resize-none"
                      />
                    </label>

                    {/* Assinatura 1 (Esquerda) */}
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">ASSINATURA 1 (ESQUERDA)</p>
                      <div className="grid gap-2">
                        <label className="block">
                          <span className="mb-0.5 block text-[9px] font-bold text-slate-400 uppercase">Nome do Assinante</span>
                          <input
                            type="text"
                            value={form.diretorNome || ''}
                            onChange={(e) => setForm({ ...form, diretorNome: e.target.value })}
                            placeholder="Ex: Prof. Denielson S. Lima"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[9px] font-bold text-slate-400 uppercase">Cargo / Função</span>
                          <input
                            type="text"
                            value={form.diretorCargo || ''}
                            onChange={(e) => setForm({ ...form, diretorCargo: e.target.value })}
                            placeholder="Ex: Diretor Geral"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                          />
                        </label>
                      </div>
                      
                      {/* Usar Assinatura Centralized Slot 1 */}
                      <div className="flex flex-col gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">USAR ASSINATURA CENTRAL</span>
                        <div className="grid grid-cols-2 gap-1">
                          {([
                            { id: 'diretoriaGeral', label: 'Diretoria' },
                            { id: 'secretaria', label: 'Secretaria' },
                            { id: 'coordenacao', label: 'Coordenação' },
                            { id: 'financeiro', label: 'Financeiro' },
                          ] as const).map((role) => {
                            const isSelected = form.diretorAssinaturaRole === role.id;
                            return (
                              <button
                                key={`s1-${role.id}`}
                                type="button"
                                onClick={() => applyCentralSignature(1, role.id)}
                                className={`py-1 px-1.5 rounded-lg border text-[9px] font-bold transition-all truncate ${
                                  isSelected
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm font-black'
                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                                }`}
                              >
                                {role.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Assinatura 2 (Direita) */}
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">ASSINATURA 2 (DIREITA)</p>
                      <div className="grid gap-2">
                        <label className="block">
                          <span className="mb-0.5 block text-[9px] font-bold text-slate-400 uppercase">Nome do Assinante</span>
                          <input
                            type="text"
                            value={form.secretarioNome || ''}
                            onChange={(e) => setForm({ ...form, secretarioNome: e.target.value })}
                            placeholder="Ex: Maria Eduarda Santos"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                          />
                        </label>
                        <label className="block">
                          <span className="mb-0.5 block text-[9px] font-bold text-slate-400 uppercase">Cargo / Função</span>
                          <input
                            type="text"
                            value={form.secretarioCargo || ''}
                            onChange={(e) => setForm({ ...form, secretarioCargo: e.target.value })}
                            placeholder="Ex: Secretária Acadêmica"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
                          />
                        </label>
                      </div>
                      
                      {/* Usar Assinatura Centralized Slot 2 */}
                      <div className="flex flex-col gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">USAR ASSINATURA CENTRAL</span>
                        <div className="grid grid-cols-2 gap-1">
                          {([
                            { id: 'diretoriaGeral', label: 'Diretoria' },
                            { id: 'secretaria', label: 'Secretaria' },
                            { id: 'coordenacao', label: 'Coordenação' },
                            { id: 'financeiro', label: 'Financeiro' },
                          ] as const).map((role) => {
                            const isSelected = form.secretarioAssinaturaRole === role.id;
                            return (
                              <button
                                key={`s2-${role.id}`}
                                type="button"
                                onClick={() => applyCentralSignature(2, role.id)}
                                className={`py-1 px-1.5 rounded-lg border text-[9px] font-bold transition-all truncate ${
                                  isSelected
                                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm font-black'
                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600'
                                }`}
                              >
                                {role.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Adicionar Imagens e Logotipos na Contracapa */}
                    <div className="border-t border-slate-100 pt-3 space-y-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">LOGOTIPOS E IMAGENS</p>
                      <button
                        type="button"
                        onClick={() => contracapaCustomImageRef.current?.click()}
                        disabled={uploading === 'contracapa_custom'}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 py-3 text-xs font-bold text-slate-700 transition"
                      >
                        {uploading === 'contracapa_custom' ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        Adicionar Logotipo / Imagem
                      </button>
                    </div>

                    {/* Tamanho do QR Code */}
                    <div className="border-t border-slate-100 pt-3">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Tamanho do QR Code (mm)
                        </span>
                        <span className="text-xs font-bold text-slate-700">{form.qrCodeSize || 28}mm</span>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="50"
                        value={form.qrCodeSize || 28}
                        onChange={(e) => setForm({ ...form, qrCodeSize: parseInt(e.target.value) })}
                        className="w-full accent-blue-600"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

            {activeTab === 'textos' && (
              <section className="space-y-6 animate-fadeIn">
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 size={20} className="text-blue-600" />
                  <h5 className="text-lg font-black text-[#001a33]">Textos institucionais</h5>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 md:p-6">
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Cabeçalho das páginas</span>
                      <textarea
                        value={form.cabecalho}
                        onChange={(e) => setForm({ ...form, cabecalho: e.target.value })}
                        className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-500">Rodapé</span>
                      <textarea
                        value={form.rodape}
                        onChange={(e) => setForm({ ...form, rodape: e.target.value })}
                        className="min-h-24 w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                      />
                    </label>
                  </div>
                  <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 border-t border-slate-200 pt-5">
                    <span>
                      <span className="block text-sm font-bold text-slate-700">Incluir instruções normativas</span>
                      <span className="text-xs text-slate-500">Acrescenta orientações de preenchimento antes da contracapa.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={form.imprimirInstrucoes}
                      onChange={(e) => setForm({ ...form, imprimirInstrucoes: e.target.checked })}
                      className="h-5 w-5 accent-blue-600"
                    />
                  </label>
                </div>
              </section>
            )}
          </div>
        ) : null}
      </div>
      <ToastNotification toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

interface ImageUploaderProps {
  title: string;
  description: string;
  imageUrl: string | null;
  usingDefault?: boolean;
  loading: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({
  title,
  description,
  imageUrl,
  usingDefault,
  loading,
  onSelect,
  onRemove,
}) => (
  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="relative aspect-[1.414/1] overflow-hidden bg-slate-100 flex items-center justify-center">
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="h-full w-full object-contain bg-white text-[10px] text-slate-400" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-slate-400">
          <ImageIcon size={38} />
          <span className="mt-2 text-xs font-bold">Nenhuma imagem enviada</span>
        </div>
      )}
      {usingDefault && (
        <span className="absolute left-3 top-3 rounded-full bg-[#001a33]/90 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white">
          Capa padrão do sistema
        </span>
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#001a33]/70 text-white">
          <Loader2 className="animate-spin" />
        </div>
      )}
    </div>
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-slate-100">
      <div className="min-w-0">
        <p className="text-xs font-black text-[#001a33] truncate">{title}</p>
        <p className="text-[10px] text-slate-500 truncate">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {imageUrl && !usingDefault && (
          <button type="button" onClick={onRemove} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-red-200 hover:text-red-500 transition-colors" title="Remover">
            <X size={16} />
          </button>
        )}
        <button type="button" onClick={onSelect} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-700 transition-colors">
          {imageUrl ? <Check size={14} /> : <Upload size={14} />}
          <span>{imageUrl && !usingDefault ? 'Substituir' : 'Enviar'}</span>
        </button>
      </div>
    </div>
  </div>
);

export default DiariosPage;
