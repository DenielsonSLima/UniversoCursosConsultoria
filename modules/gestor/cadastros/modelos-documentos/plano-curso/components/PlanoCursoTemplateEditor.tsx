import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Droplets,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Signature,
} from 'lucide-react';

import DocumentHeader from '../../../../components/DocumentHeader';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import {
  marcaDaguaService,
  type CompanyWatermark,
} from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { usePlanoCursoTemplate } from '../hooks/usePlanoCursoTemplate';
import type {
  ConteudoModeloPlanoCurso,
  RotulosModeloPlanoCurso,
} from '../types/plano-curso.types';

const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const MIN_PREVIEW_SCALE = 0.38;

const STATUS_META = {
  RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-600' },
  EM_REVISAO: { label: 'Em revisão', className: 'bg-amber-50 text-amber-700' },
  ATIVO: { label: 'Ativo', className: 'bg-emerald-50 text-emerald-700' },
  ARQUIVADO: { label: 'Arquivado', className: 'bg-rose-50 text-rose-700' },
} as const;

const SAMPLE_CONTENT = {
  componente: 'Enfermagem em urgência e emergência',
  docente: 'Docente responsável',
  dias: 'terça, quarta e quinta · 9 encontros',
  objetivos: 'Compreender técnicas e protocolos aplicados à urgência e emergência.',
  criterios: ['Avaliação escrita', 'Atividade prática', 'Trabalho em grupo'],
  insumos: ['Datashow', 'Manequim de simulação', 'Materiais de apoio'],
  aulas: [
    ['Aula 1 · 05/03/2026', 'Apresentação da ementa e conceitos de urgência e emergência.'],
    ['Aula 2 · 10/03/2026', 'Atendimento pré-hospitalar e protocolos iniciais.'],
    ['Aula 3 · 11/03/2026', 'Suporte básico de vida e simulação prática.'],
  ],
};

const PreviewWatermark = ({ source, opacity, scale, rotate }: {
  source: string | null;
  opacity: number;
  scale: number;
  rotate: boolean;
}) => source ? (
  <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
    <img
      src={source}
      alt=""
      className={`max-w-none object-contain ${rotate ? '-rotate-[28deg]' : ''}`}
      style={{ width: `${scale}%`, opacity }}
    />
  </div>
) : null;

const PreviewField = ({ label, children, minHeight = 0 }: {
  label: string;
  children: ReactNode;
  minHeight?: number;
}) => (
  <div className="border-b border-slate-300 px-3 py-2 last:border-b-0" style={{ minHeight }}>
    <p className="text-[12px] font-black uppercase tracking-wide text-[#001a33]">{label}</p>
    <div className="mt-1 text-[13px] font-medium leading-5 text-slate-800">{children}</div>
  </div>
);

const PreviewPage = ({
  draft,
  company,
  watermark,
  watermarkOpacity,
  watermarkScale,
  watermarkRotate,
  continuation = false,
}: {
  draft: ConteudoModeloPlanoCurso;
  company: any;
  watermark: string | null;
  watermarkOpacity: number;
  watermarkScale: number;
  watermarkRotate: boolean;
  continuation?: boolean;
}) => (
  <div className="relative h-[1123px] w-[794px] overflow-hidden bg-white px-[76px] pb-[62px] pt-[58px] text-slate-900 shadow-xl">
    {draft.exibirMarcaDagua ? (
      <PreviewWatermark
        source={watermark}
        opacity={watermarkOpacity}
        scale={watermarkScale}
        rotate={watermarkRotate}
      />
    ) : null}
    <div className="relative z-10">
      <DocumentHeader company={company || undefined} orientation="portrait" />
      <div className="mb-5 text-center">
        <h5 className="text-[22px] font-black uppercase tracking-[0.08em] text-[#001a33]">
          {draft.titulo}{continuation ? ' — continuação' : ''}
        </h5>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
          {draft.subtitulo
            .replaceAll('{{CURSO}}', 'Técnico em Enfermagem')
            .replaceAll('{{TURMA}}', 'Turma ENF-T40')}
        </p>
      </div>

      {!continuation ? (
        <div className="overflow-hidden border border-slate-400">
          <PreviewField label={draft.rotulos.componenteCurricular}>{SAMPLE_CONTENT.componente}</PreviewField>
          <PreviewField label={draft.rotulos.docente}>{SAMPLE_CONTENT.docente}</PreviewField>
          <PreviewField label={draft.rotulos.diasAulas}>{SAMPLE_CONTENT.dias}</PreviewField>
          <PreviewField label={draft.rotulos.objetivosDisciplina} minHeight={100}>{SAMPLE_CONTENT.objetivos}</PreviewField>
          <PreviewField label={draft.rotulos.criteriosAvaliacao} minHeight={126}>
            {SAMPLE_CONTENT.criterios.map((item) => <p key={item}>• {item}</p>)}
          </PreviewField>
          <PreviewField label={draft.rotulos.insumosRecursos} minHeight={98}>
            {SAMPLE_CONTENT.insumos.join(' · ')}
          </PreviewField>
        </div>
      ) : (
        <div className="overflow-hidden border border-slate-400">
          <PreviewField label={draft.rotulos.conteudoProgramatico} minHeight={505}>
            <p className="mb-4 text-[11px] italic text-slate-500">{draft.instrucoesConteudo}</p>
            <div className="space-y-4">
              {SAMPLE_CONTENT.aulas.map(([title, content]) => (
                <div key={title}>
                  <p className="font-black text-[#001a33]">{title}</p>
                  <p>{content}</p>
                </div>
              ))}
            </div>
          </PreviewField>
        </div>
      )}

      {continuation && draft.exibirAssinaturaDocente ? (
        <div className="mt-14 text-center text-[12px] font-bold text-[#001a33]">
          <p>Japoatã, 8 de agosto de 2026.</p>
          <div className="mx-auto mt-9 w-[390px] border-t border-slate-700 pt-2 uppercase tracking-wider">
            {draft.rotulos.assinaturaDocente}
          </div>
        </div>
      ) : null}
    </div>
  </div>
);

export const PlanoCursoTemplateEditor = () => {
  const { templateQuery, saveMutation } = usePlanoCursoTemplate();
  const [draft, setDraft] = useState<ConteudoModeloPlanoCurso | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [watermarkInfo, setWatermarkInfo] = useState<CompanyWatermark | null>(null);
  const [previewViewport, setPreviewViewport] = useState<HTMLDivElement | null>(null);
  const [previewScale, setPreviewScale] = useState(0.68);
  const loadedRevision = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      empresasService.getCompanyPrincipal().catch(() => null),
      marcaDaguaService.getCompaniesWithWatermark().catch(() => []),
    ]).then(([company, watermarks]) => {
      if (!mounted) return;
      setCompanyInfo(company);
      if (!Array.isArray(watermarks)) return;
      const companyName = String(company?.nomeFantasia || '').trim().toLocaleLowerCase('pt-BR');
      const usable = watermarks.filter((item) => Boolean(item.watermarkUrl));
      const sameInstitution = companyName
        ? usable.find((item) => item.nomeFantasia.trim().toLocaleLowerCase('pt-BR') === companyName)
        : null;
      const matrix = usable.find((item) => /\bmatriz\b/i.test(item.nomeFantasia));
      setWatermarkInfo(sameInstitution || matrix || null);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!templateQuery.data || loadedRevision.current === templateQuery.data.revisao) return;
    loadedRevision.current = templateQuery.data.revisao;
    setDraft(templateQuery.data.conteudo);
  }, [templateQuery.data]);

  useEffect(() => {
    if (!previewViewport || typeof window === 'undefined' || !window.ResizeObserver) return;
    const sync = () => {
      const available = previewViewport.getBoundingClientRect().width;
      if (!available) return;
      const next = Math.min(1, Math.max(MIN_PREVIEW_SCALE, available / PAGE_WIDTH));
      setPreviewScale((current) => Math.abs(current - next) < 0.005 ? current : next);
    };
    sync();
    const observer = new window.ResizeObserver(sync);
    observer.observe(previewViewport);
    return () => observer.disconnect();
  }, [previewViewport]);

  const isDirty = useMemo(() => Boolean(
    draft && templateQuery.data
      && JSON.stringify(draft) !== JSON.stringify(templateQuery.data.conteudo),
  ), [draft, templateQuery.data]);

  const update = <K extends keyof ConteudoModeloPlanoCurso>(
    key: K,
    value: ConteudoModeloPlanoCurso[K],
  ) => setDraft((current) => current ? { ...current, [key]: value } : current);

  const updateLabel = (key: keyof RotulosModeloPlanoCurso, value: string) => {
    setDraft((current) => current ? {
      ...current,
      rotulos: { ...current.rotulos, [key]: value },
    } : current);
  };

  const updatePagination = (
    key: keyof ConteudoModeloPlanoCurso['paginacao'],
    value: number,
  ) => setDraft((current) => current ? {
    ...current,
    paginacao: { ...current.paginacao, [key]: value },
  } : current);

  if (templateQuery.isError) {
    return (
      <div role="alert" className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-rose-100 bg-white p-8 shadow-sm">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-rose-600" size={30} />
          <h3 className="mt-4 text-base font-black uppercase text-[#001a33]">Modelo indisponível</h3>
          <p className="mt-2 text-sm font-medium text-slate-500">Não foi possível carregar a revisão canônica do Plano de Curso.</p>
          <button type="button" onClick={() => void templateQuery.refetch()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white">
            <RefreshCw size={15} /> Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (templateQuery.isPending || !templateQuery.data || !draft) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="animate-spin text-violet-700" size={32} />
          <span className="text-xs font-black uppercase tracking-[0.18em]">Carregando modelo do Plano de Curso</span>
        </div>
      </div>
    );
  }

  const watermarkUrl = watermarkInfo?.watermarkUrl || null;
  const rawOpacity = Number(watermarkInfo?.watermarkOpacity ?? 0.1);
  const watermarkOpacity = Number.isFinite(rawOpacity)
    ? Math.min(1, Math.max(0, rawOpacity > 1 ? rawOpacity / 100 : rawOpacity))
    : 0.1;
  const rawScale = Number(watermarkInfo?.watermarkScale ?? 50);
  const watermarkScale = Number.isFinite(rawScale) ? Math.min(100, Math.max(5, rawScale)) : 50;
  const watermarkRotate = watermarkInfo?.watermarkRotate !== false;
  const statusView = STATUS_META[templateQuery.data.status];

  const labelFields: Array<[keyof RotulosModeloPlanoCurso, string]> = [
    ['componenteCurricular', 'Componente curricular'],
    ['docente', 'Docente'],
    ['diasAulas', 'Dias das aulas'],
    ['objetivosDisciplina', 'Objetivos'],
    ['criteriosAvaliacao', 'Critérios de avaliação'],
    ['insumosRecursos', 'Insumos e recursos'],
    ['conteudoProgramatico', 'Conteúdo programático'],
    ['dataLocal', 'Local e data'],
    ['assinaturaDocente', 'Assinatura'],
  ];

  return (
    <div className="mx-auto max-w-7xl animate-fadeIn">
      <header className="mb-6 flex flex-col justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-700 text-white shadow-lg shadow-violet-950/15">
            <BookOpenCheck size={23} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Plano de Curso</h3>
              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-violet-700">A4 retrato</span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusView.className}`}>
                {statusView.label}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">Revisão {templateQuery.data.revisao} · dados e páginas finais são preparados pela RPC acadêmica.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => saveMutation.mutate(draft)}
          disabled={!isDirty || saveMutation.isPending || templateQuery.data.status === 'ARQUIVADO'}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ed1c4e] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saveMutation.isPending ? 'Salvando...' : 'Salvar versão'}
        </button>
      </header>

      {saveMutation.isError ? (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <p className="text-sm font-semibold">{saveMutation.error instanceof Error ? saveMutation.error.message : 'Não foi possível salvar a nova revisão.'}</p>
        </div>
      ) : null}
      {saveMutation.isSuccess && !isDirty ? (
        <div role="status" aria-live="polite" className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 size={19} />
          <p className="text-sm font-semibold">Modelo salvo. Novos planos usarão a revisão canônica retornada pelo servidor.</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(390px,0.95fr)]">
        <section className="space-y-6 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <FileText className="text-violet-700" size={19} />
            <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Identificação e rótulos</h4>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Nome interno</span>
              <input value={draft.nomeModelo} onChange={(event) => update('nomeModelo', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-violet-500 focus:bg-white" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Título do documento</span>
              <input value={draft.titulo} onChange={(event) => update('titulo', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-violet-500 focus:bg-white" />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Subtítulo e variáveis</span>
            <input value={draft.subtitulo} onChange={(event) => update('subtitulo', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-[#001a33] outline-none focus:border-violet-500 focus:bg-white" />
            <span className="mt-2 block text-xs font-medium text-slate-400">
              Variáveis aceitas: <code>{'{{CURSO}}'}</code> e <code>{'{{TURMA}}'}</code>. Outros marcadores são rejeitados pelo servidor.
            </span>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            {labelFields.map(([key, label]) => (
              <label key={key} className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                <input value={draft.rotulos[key]} onChange={(event) => updateLabel(key, event.target.value)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 outline-none focus:border-violet-500 focus:bg-white" />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Orientação do conteúdo programático</span>
            <textarea value={draft.instrucoesConteudo} onChange={(event) => update('instrucoesConteudo', event.target.value)} rows={3} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 outline-none focus:border-violet-500 focus:bg-white" />
          </label>

          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="mb-3 flex items-start gap-2">
              <BookOpenCheck className="mt-0.5 shrink-0 text-violet-700" size={17} />
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-violet-950">Paginação canônica</p>
                <p className="mt-1 text-xs font-semibold text-violet-700">Estes limites são enviados como configuração; somente o backend distribui os encontros nas páginas.</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-violet-800">Encontros na primeira página</span>
                <input type="number" min={0} max={12} value={draft.paginacao.encontrosPrimeiraPagina} onChange={(event) => updatePagination('encontrosPrimeiraPagina', Number(event.target.value))} className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm font-bold text-violet-950 outline-none focus:border-violet-500" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-violet-800">Encontros nas continuações</span>
                <input type="number" min={1} max={12} value={draft.paginacao.encontrosDemaisPaginas} onChange={(event) => updatePagination('encontrosDemaisPaginas', Number(event.target.value))} className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2.5 text-sm font-bold text-violet-950 outline-none focus:border-violet-500" />
              </label>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-[#001a33]">
              <span className="flex items-center gap-2"><Droplets size={15} className="text-violet-700" /> Marca-d’água</span>
              <input type="checkbox" checked={draft.exibirMarcaDagua} onChange={(event) => update('exibirMarcaDagua', event.target.checked)} className="h-4 w-4 accent-violet-700" />
            </label>
            <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-[#001a33]">
              <span className="flex items-center gap-2"><Signature size={15} className="text-violet-700" /> Assinatura do docente</span>
              <input type="checkbox" checked={draft.exibirAssinaturaDocente} onChange={(event) => update('exibirAssinaturaDocente', event.target.checked)} className="h-4 w-4 accent-violet-700" />
            </label>
          </div>
        </section>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Prévia A4 em duas páginas</span>
              <span className="text-[10px] font-bold text-slate-500">Dados demonstrativos</span>
            </div>
            <div ref={setPreviewViewport} className="max-h-[760px] w-full overflow-auto rounded-xl bg-slate-200 p-2">
              <div style={{ height: (PAGE_HEIGHT * 2 + 28) * previewScale, width: PAGE_WIDTH * previewScale }}>
                <div className="origin-top-left space-y-7" style={{ transform: `scale(${previewScale})`, width: PAGE_WIDTH }}>
                  <PreviewPage draft={draft} company={companyInfo} watermark={watermarkUrl} watermarkOpacity={watermarkOpacity} watermarkScale={watermarkScale} watermarkRotate={watermarkRotate} />
                  <PreviewPage continuation draft={draft} company={companyInfo} watermark={watermarkUrl} watermarkOpacity={watermarkOpacity} watermarkScale={watermarkScale} watermarkRotate={watermarkRotate} />
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
