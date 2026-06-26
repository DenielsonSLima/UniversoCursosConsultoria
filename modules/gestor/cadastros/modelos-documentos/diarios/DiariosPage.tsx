import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
import ToastNotification, { useToast } from '../../../parceiros/components/shared/ToastNotification';
import capaDiarioPadrao from '../../../../../Documentos/Capa-Diario.jpg';
import {
  DEFAULT_DIARIO_TEMPLATE,
  DiarioTemplate,
  diariosService,
} from './diarios.service';

const queryKeys = {
  cursos: ['diario-templates', 'cursos'] as const,
  template: (cursoId: string) => ['diario-templates', cursoId] as const,
};

const DiariosPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { toasts, removeToast, toast } = useToast();
  const capaInputRef = useRef<HTMLInputElement>(null);
  const contracapaInputRef = useRef<HTMLInputElement>(null);
  const [selectedCurso, setSelectedCurso] = useState('');
  const [form, setForm] = useState<DiarioTemplate>(DEFAULT_DIARIO_TEMPLATE);
  const [uploading, setUploading] = useState<'capa' | 'contracapa' | null>(null);

  const { data: cursos = [], isLoading: loadingCursos } = useQuery({
    queryKey: queryKeys.cursos,
    queryFn: diariosService.getCursos,
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
    if (template) setForm(template);
  }, [template]);

  const saveMutation = useMutation({
    mutationFn: () => diariosService.saveTemplate(selectedCurso, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.template(selectedCurso) });
      toast.success('Modelo salvo', 'A capa e as configurações deste curso foram atualizadas.');
    },
    onError: (error: any) => toast.error('Erro ao salvar', error.message),
  });

  const handleUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    kind: 'capa' | 'contracapa',
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedCurso) return;

    setUploading(kind);
    try {
      const url = await diariosService.uploadImage(selectedCurso, kind, file);
      const next = {
        ...form,
        [kind === 'capa' ? 'capaUrl' : 'contracapaUrl']: url,
      };
      setForm(next);
      await diariosService.saveTemplate(selectedCurso, next);
      await queryClient.invalidateQueries({ queryKey: queryKeys.template(selectedCurso) });
      toast.success('Imagem enviada', `${kind === 'capa' ? 'Capa' : 'Contracapa'} salva com sucesso.`);
    } catch (error: any) {
      toast.error('Falha no upload', error.message);
    } finally {
      setUploading(null);
    }
  };

  const selected = cursos.find((curso) => curso.id === selectedCurso);

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm animate-fadeIn">
      <input ref={capaInputRef} type="file" accept="image/*" hidden onChange={(e) => handleUpload(e, 'capa')} />
      <input ref={contracapaInputRef} type="file" accept="image/*" hidden onChange={(e) => handleUpload(e, 'contracapa')} />

      <div className="relative border-b border-slate-100 bg-[#001a33] px-6 py-7 text-white md:px-8">
        <div className="absolute inset-y-0 right-0 w-72 bg-[radial-gradient(circle_at_center,rgba(37,99,235,.35),transparent_68%)]" />
        <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-blue-200">
              <BookOpenCheck size={30} />
            </div>
            <div>
              <h3 className="text-2xl font-black uppercase tracking-tight">Modelos de Diários</h3>
              <p className="mt-1 text-sm font-medium text-slate-300">Capas oficiais e identidade de impressão por curso.</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr]">
        <aside className="border-b border-slate-100 bg-slate-50/70 p-5 lg:border-b-0 lg:border-r">
          <p className="mb-4 px-2 text-[10px] font-black uppercase tracking-[.22em] text-slate-400">Cursos cadastrados</p>
          {loadingCursos ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-600" /></div>
          ) : (
            <div className="space-y-2">
              {cursos.map((curso) => (
                <button
                  key={curso.id}
                  type="button"
                  onClick={() => setSelectedCurso(curso.id)}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedCurso === curso.id
                      ? 'border-blue-200 bg-white text-blue-700 shadow-sm'
                      : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span>
                      <span className="block text-sm font-bold">{curso.nome}</span>
                      <span className="mt-0.5 block text-[9px] font-black uppercase tracking-widest text-slate-400">{curso.modalidade}</span>
                    </span>
                    {selectedCurso === curso.id && <ChevronRight size={16} />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <main className="p-6 md:p-8">
          {loadingTemplate ? (
            <div className="flex min-h-[520px] items-center justify-center gap-3 text-sm font-bold text-slate-500">
              <Loader2 className="animate-spin text-blue-600" /> Carregando modelo…
            </div>
          ) : selected ? (
            <div className="space-y-8">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-600">Modelo selecionado</p>
                <h4 className="mt-1 text-2xl font-black text-[#001a33]">{selected.nome}</h4>
              </div>

              <section>
                <div className="mb-4 flex items-center gap-2">
                  <ImageIcon size={20} className="text-blue-600" />
                  <h5 className="text-lg font-black text-[#001a33]">Capa e contracapa A4 horizontal</h5>
                </div>
                <div className="grid gap-6 xl:grid-cols-2">
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
                    title="Verso / contracapa"
                    description="Página final opcional"
                    imageUrl={form.contracapaUrl}
                    loading={uploading === 'contracapa'}
                    onSelect={() => contracapaInputRef.current?.click()}
                    onRemove={() => setForm((current) => ({ ...current, contracapaUrl: null }))}
                  />
                </div>
              </section>

              <section>
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
            </div>
          ) : null}
        </main>
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
    <div className="relative aspect-[1.414/1] overflow-hidden bg-slate-100">
      {imageUrl ? (
        <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
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
    <div className="flex items-center justify-between gap-4 p-4">
      <div>
        <p className="text-sm font-black text-[#001a33]">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="flex gap-2">
        {imageUrl && !usingDefault && (
          <button type="button" onClick={onRemove} className="rounded-lg border border-slate-200 p-2 text-slate-400 hover:border-red-200 hover:text-red-500" title="Remover">
            <X size={16} />
          </button>
        )}
        <button type="button" onClick={onSelect} className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white hover:bg-blue-700">
          {imageUrl ? <Check size={14} /> : <Upload size={14} />}
          {imageUrl && !usingDefault ? 'Substituir' : 'Enviar'}
        </button>
      </div>
    </div>
  </div>
);

export default DiariosPage;
