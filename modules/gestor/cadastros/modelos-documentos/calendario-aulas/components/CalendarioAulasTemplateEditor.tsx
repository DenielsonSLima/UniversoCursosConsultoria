import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Droplets,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react';
import DocumentHeader from '../../../../components/DocumentHeader';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { useCalendarioAulasTemplate } from '../hooks/useCalendarioAulasTemplate';
import type { ConteudoModeloCalendarioAulas } from '../types/calendario-aulas.types';

const PREVIEW_ROWS = [
  ['Componente curricular', '12/08/2026', '08:00 — 16:00', 'Professor(a) responsável'],
  ['Componente curricular', '19/08/2026', '08:00 — 16:00', 'Professor(a) responsável'],
  ['Práticas', '26/08/2026', 'Horário não informado', 'Professor(a) responsável'],
] as const;

// A prévia não é um layout responsivo do documento: é uma página A4 inteira
// reduzida proporcionalmente. Assim, o DocumentHeader mantém as mesmas
// proporções usadas pelos editores de Declaração e Contrato.
const PREVIEW_PAGE_WIDTH = 794;
const PREVIEW_PAGE_HEIGHT = 1123;
const PREVIEW_PAGE_PADDING = 76;
const MIN_PREVIEW_SCALE = 0.42;

export const CalendarioAulasTemplateEditor = () => {
  const { templateQuery, saveMutation } = useCalendarioAulasTemplate();
  const [draft, setDraft] = useState<ConteudoModeloCalendarioAulas | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [watermarkInfo, setWatermarkInfo] = useState<any>(null);
  const [previewViewport, setPreviewViewport] = useState<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.72);
  const loadedVersion = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      empresasService.getCompanyPrincipal().catch(() => null),
      marcaDaguaService.getCompaniesWithWatermark().catch(() => []),
    ]).then(([company, watermarks]) => {
      if (!isMounted) return;
      if (company) setCompanyInfo(company);
      if (!Array.isArray(watermarks) || watermarks.length === 0) return;

      const institutionalWatermark =
        watermarks.find((item: any) => item.id === company?.id && Boolean(item.watermarkUrl))
        || watermarks.find((item: any) => Boolean(item.watermarkUrl))
        || watermarks[0];
      setWatermarkInfo(institutionalWatermark);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!templateQuery.data || loadedVersion.current === templateQuery.data.revisao) return;
    loadedVersion.current = templateQuery.data.revisao;
    setDraft(templateQuery.data.conteudo);
  }, [templateQuery.data]);

  useEffect(() => {
    if (!previewViewport || typeof window === 'undefined' || !window.ResizeObserver) return;

    const syncPreviewScale = () => {
      const availableWidth = previewViewport.getBoundingClientRect().width;
      if (!availableWidth) return;
      const nextScale = Math.min(1, Math.max(MIN_PREVIEW_SCALE, availableWidth / PREVIEW_PAGE_WIDTH));
      setPreviewScale((current) => Math.abs(current - nextScale) < 0.005 ? current : nextScale);
    };

    syncPreviewScale();
    const observer = new window.ResizeObserver(syncPreviewScale);
    observer.observe(previewViewport);
    return () => observer.disconnect();
  }, [previewViewport]);

  const isDirty = useMemo(() => (
    Boolean(draft && templateQuery.data && JSON.stringify(draft) !== JSON.stringify(templateQuery.data.conteudo))
  ), [draft, templateQuery.data]);

  const previewWatermarkUrl = watermarkInfo?.watermarkUrl || null;
  const rawWatermarkOpacity = Number(watermarkInfo?.watermarkOpacity ?? 0.1);
  const previewWatermarkOpacity = Number.isFinite(rawWatermarkOpacity)
    ? Math.min(1, Math.max(0, rawWatermarkOpacity > 1 ? rawWatermarkOpacity / 100 : rawWatermarkOpacity))
    : 0.1;
  const rawWatermarkScale = Number(watermarkInfo?.watermarkScale ?? 50);
  const previewWatermarkScale = Number.isFinite(rawWatermarkScale)
    ? Math.min(100, Math.max(5, rawWatermarkScale))
    : 50;
  const previewWatermarkRotate = watermarkInfo?.watermarkRotate !== false;

  const update = <K extends keyof ConteudoModeloCalendarioAulas>(
    key: K,
    value: ConteudoModeloCalendarioAulas[K],
  ) => setDraft((current) => current ? { ...current, [key]: value } : current);

  const updateHeader = (
    key: keyof ConteudoModeloCalendarioAulas['cabecalhosTabela'],
    value: string,
  ) => setDraft((current) => current ? {
    ...current,
    cabecalhosTabela: { ...current.cabecalhosTabela, [key]: value },
  } : current);

  if (templateQuery.isError) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-rose-100 bg-white p-8 shadow-sm">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-rose-600" size={30} />
          <h3 className="mt-4 text-base font-black uppercase text-[#001a33]">Modelo indisponível</h3>
          <p className="mt-2 text-sm font-medium text-slate-500">Não foi possível carregar a versão canônica do calendário de aulas.</p>
          <button type="button" onClick={() => void templateQuery.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white">
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (templateQuery.isPending || !templateQuery.data || !draft) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin text-blue-600" size={32} />
          <span className="text-xs font-black uppercase tracking-[0.18em]">Carregando modelo de calendário</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn mx-auto max-w-7xl">
      <header className="mb-7 flex flex-col justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-700 text-white shadow-lg shadow-indigo-950/15">
            <CalendarDays size={23} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Calendário de aulas</h3>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-700">A4 retrato</span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${templateQuery.data.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {templateQuery.data.status === 'ATIVO' ? 'Ativo' : 'Rascunho'}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">Revisão {templateQuery.data.revisao || 0} · uma grade canônica por turma, sem criar datas ou horários no navegador.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => draft && saveMutation.mutate(draft)}
          disabled={!isDirty || saveMutation.isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ed1c4e] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saveMutation.isPending ? 'Salvando...' : 'Salvar versão'}
        </button>
      </header>

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-indigo-950">
        <FileSpreadsheet className="mt-0.5 shrink-0" size={19} />
        <p className="text-sm font-semibold leading-relaxed">A exportação busca apenas a turma escolhida, após o filtro de modalidade. Componentes, datas, horários e professores são preparados e ordenados pela RPC acadêmica antes da renderização.</p>
      </div>

      {saveMutation.isError && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <p className="text-sm font-semibold">{saveMutation.error instanceof Error ? saveMutation.error.message : 'Não foi possível salvar a nova versão.'}</p>
        </div>
      )}

      {saveMutation.isSuccess && !isDirty && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 size={19} />
          <p className="text-sm font-semibold">Modelo salvo. Exportações futuras usarão a revisão canônica retornada pelo servidor.</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <section className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <CalendarDays className="text-indigo-700" size={19} />
            <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Cabeçalho e tabela</h4>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Nome interno do modelo</span>
              <input value={draft.nomeModelo} onChange={(event) => update('nomeModelo', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-indigo-500 focus:bg-white" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Título</span>
              <input value={draft.titulo} onChange={(event) => update('titulo', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-indigo-500 focus:bg-white" />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Subtítulo / variáveis</span>
            <input value={draft.subtitulo} onChange={(event) => update('subtitulo', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-[#001a33] outline-none focus:border-indigo-500 focus:bg-white" />
            <span className="mt-2 block text-xs font-medium text-slate-400">Ex.: {'{{CURSO}} · {{TURMA}}'} · as variáveis são resolvidas pelo exportador seguro.</span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Rodapé</span>
              <textarea value={draft.rodape} onChange={(event) => update('rodape', event.target.value)} rows={3} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 outline-none focus:border-indigo-500 focus:bg-white" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Sem horário oficial</span>
              <textarea value={draft.observacaoSemHorario} onChange={(event) => update('observacaoSemHorario', event.target.value)} rows={3} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 outline-none focus:border-indigo-500 focus:bg-white" />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-[11px] font-black uppercase tracking-wider text-[#001a33]">Cabeçalhos da tabela</p>
            <div className="grid gap-3 md:grid-cols-2">
              {([
                ['componente', 'Componente curricular'],
                ['data', 'Data'],
                ['horario', 'Horário'],
                ['professorObservacao', 'Professor(a)'],
              ] as const).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                  <input value={draft.cabecalhosTabela[key]} onChange={(event) => updateHeader(key, event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500" />
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              { key: 'exibirMarcaDagua' as const, label: 'Marca-d’água' },
              { key: 'exibirModulo' as const, label: 'Exibir módulo' },
            ].map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-[#001a33]">
                {item.key === 'exibirMarcaDagua' ? <Droplets size={15} className="text-indigo-600" /> : item.label}
                <input type="checkbox" checked={draft[item.key]} onChange={(event) => update(item.key, event.target.checked)} className="h-4 w-4 accent-indigo-700" />
              </label>
            ))}
          </div>

        </section>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Prévia A4 retrato</span>
              <span className="text-[10px] font-bold text-slate-500">Grade canônica</span>
            </div>
            <div ref={setPreviewViewport} className="w-full overflow-hidden">
              <div
                className="relative mx-auto"
                style={{
                  width: `${PREVIEW_PAGE_WIDTH * previewScale}px`,
                  height: `${PREVIEW_PAGE_HEIGHT * previewScale}px`,
                }}
              >
                <article
                  className="absolute left-0 top-0 overflow-hidden rounded-sm bg-white shadow-lg"
                  style={{
                    width: `${PREVIEW_PAGE_WIDTH}px`,
                    height: `${PREVIEW_PAGE_HEIGHT}px`,
                    padding: `${PREVIEW_PAGE_PADDING}px`,
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                  }}
                >
                  {draft.exibirMarcaDagua && previewWatermarkUrl ? (
                    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden" aria-hidden="true">
                      <img
                        src={previewWatermarkUrl}
                        alt=""
                        className="max-w-none"
                        style={{
                          opacity: previewWatermarkOpacity,
                          width: `${previewWatermarkScale}%`,
                          transform: previewWatermarkRotate ? 'rotate(-45deg)' : 'none',
                        }}
                      />
                    </div>
                  ) : null}
                  <div className="relative z-10">
                    <DocumentHeader company={companyInfo || undefined} orientation="portrait" />
                    <div className="mt-6 text-center">
                      <h5 className="text-xl font-black uppercase text-[#001a33]">{draft.titulo}</h5>
                      <p className="mt-2 text-sm font-bold text-slate-600">{draft.subtitulo}</p>
                      {draft.exibirModulo && <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Módulo informado pela turma</p>}
                    </div>
                  </div>
                  <div className="relative z-10 mt-10 overflow-hidden border border-slate-400">
                    <div className="grid grid-cols-[1.35fr_.7fr_.8fr_1.05fr] bg-slate-100 text-center text-[10px] font-black uppercase leading-4 text-[#001a33]">
                      <span className="border-r border-slate-400 p-3">{draft.cabecalhosTabela.componente}</span>
                      <span className="border-r border-slate-400 p-3">{draft.cabecalhosTabela.data}</span>
                      <span className="border-r border-slate-400 p-3">{draft.cabecalhosTabela.horario}</span>
                      <span className="p-3">{draft.cabecalhosTabela.professorObservacao}</span>
                    </div>
                    {PREVIEW_ROWS.map((row, index) => (
                      <div key={index} className="grid grid-cols-[1.35fr_.7fr_.8fr_1.05fr] border-t border-slate-300 text-[10px] leading-4 text-slate-700">
                        {row.map((cell, cellIndex) => <span key={cellIndex} className={`flex min-h-12 items-center justify-center p-3 text-center ${cellIndex < row.length - 1 ? 'border-r border-slate-300' : ''}`}>{cellIndex === 2 && index === 2 ? draft.observacaoSemHorario : cell}</span>)}
                      </div>
                    ))}
                  </div>
                  <div className="absolute bottom-[76px] left-[76px] right-[76px] z-10 flex items-end justify-between gap-4 border-t border-slate-200 pt-4">
                    <p className="max-w-[340px] text-[10px] leading-4 text-slate-500">{draft.rodape}</p>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
