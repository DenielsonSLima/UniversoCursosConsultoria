import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useCarteirinhaPreceptorTemplate } from '../hooks/useCarteirinhaPreceptorTemplate';
import type { ConteudoModeloCarteirinhaPreceptor } from '../types/carteirinha-preceptor.types';

const QR_CELLS = Array.from({ length: 49 }, (_, index) => (index * 11 + 3) % 7 < 4);

export const CarteirinhaPreceptorTemplateEditor = () => {
  const { templateQuery, saveMutation } = useCarteirinhaPreceptorTemplate();
  const [draft, setDraft] = useState<ConteudoModeloCarteirinhaPreceptor | null>(null);
  const [showBack, setShowBack] = useState(false);
  const loadedVersion = useRef<number | null>(null);

  useEffect(() => {
    if (!templateQuery.data || loadedVersion.current === templateQuery.data.revisao) return;
    loadedVersion.current = templateQuery.data.revisao;
    setDraft(templateQuery.data.conteudo);
  }, [templateQuery.data]);

  const isDirty = useMemo(() => (
    Boolean(draft && templateQuery.data && JSON.stringify(draft) !== JSON.stringify(templateQuery.data.conteudo))
  ), [draft, templateQuery.data]);

  const update = <K extends keyof ConteudoModeloCarteirinhaPreceptor>(
    key: K,
    value: ConteudoModeloCarteirinhaPreceptor[K],
  ) => setDraft((current) => current ? { ...current, [key]: value } : current);

  if (templateQuery.isError) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-rose-100 bg-white p-8 shadow-sm">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-rose-600" size={30} />
          <h3 className="mt-4 text-base font-black uppercase text-[#001a33]">Modelo indisponível</h3>
          <p className="mt-2 text-sm font-medium text-slate-500">Não foi possível carregar o modelo canônico de carteirinha para preceptor.</p>
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
          <span className="text-xs font-black uppercase tracking-[0.18em]">Carregando modelo de preceptor</span>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn mx-auto max-w-7xl">
      <header className="mb-7 flex flex-col justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-700 text-white shadow-lg shadow-cyan-950/15">
            <CreditCard size={23} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Carteirinha de preceptor</h3>
              <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-cyan-800">Somente professor</span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${templateQuery.data.status === 'ATIVO' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {templateQuery.data.status === 'ATIVO' ? 'Ativo' : 'Rascunho'}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">Revisão {templateQuery.data.revisao || 0} · emitida apenas para parceiros do tipo Professor autorizados no polo.</p>
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

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-cyan-950">
        <BadgeCheck className="mt-0.5 shrink-0" size={19} />
        <p className="text-sm font-semibold leading-relaxed">Esta credencial não usa matrícula, dados de aluno ou a carteira estudantil existente. A elegibilidade e o QR opaco são verificados no servidor no instante da emissão.</p>
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
          <p className="text-sm font-semibold">Modelo salvo com versionamento. Carteirinhas já emitidas preservam o snapshot original.</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <CreditCard className="text-cyan-700" size={19} />
            <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Identidade da credencial</h4>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Nome interno do modelo</span>
              <input value={draft.nomeModelo} onChange={(event) => update('nomeModelo', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-cyan-500 focus:bg-white" />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Título da frente</span>
              <input value={draft.tituloFrente} onChange={(event) => update('tituloFrente', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none focus:border-cyan-500 focus:bg-white" />
            </label>
          </div>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Subtítulo da frente</span>
            <input value={draft.subtituloFrente} onChange={(event) => update('subtituloFrente', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-[#001a33] outline-none focus:border-cyan-500 focus:bg-white" />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Mensagem do verso</span>
            <textarea value={draft.mensagemVerso} onChange={(event) => update('mensagemVerso', event.target.value)} rows={5} className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none focus:border-cyan-500 focus:bg-white" />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Rodapé</span>
            <input value={draft.rodape} onChange={(event) => update('rodape', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none focus:border-cyan-500 focus:bg-white" />
          </label>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              { key: 'mostrarFoto' as const, label: 'Exibir foto' },
              { key: 'mostrarPolo' as const, label: 'Exibir polo' },
              { key: 'marcaDaguaHabilitada' as const, label: 'Marca-d’água' },
            ].map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-[#001a33]">
                {item.label}
                <input type="checkbox" checked={draft[item.key]} onChange={(event) => update(item.key, event.target.checked)} className="h-4 w-4 accent-cyan-700" />
              </label>
            ))}
          </div>

          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-violet-900"><QrCode size={18} /><span className="text-xs font-black uppercase tracking-wider">QR Code e validade</span></div>
              <input aria-label="Ativar QR Code" type="checkbox" checked={draft.qr.habilitado} onChange={(event) => update('qr', { ...draft.qr, habilitado: event.target.checked })} className="h-4 w-4 accent-violet-700" />
            </div>
            <p className="mt-2 text-xs font-medium leading-relaxed text-violet-800">O QR aponta para um identificador de validação. Nenhum dado pessoal, foto ou CPF é codificado.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px]">
              <select
                value={draft.qr.modoValidade}
                disabled={!draft.qr.habilitado}
                onChange={(event) => update('qr', { ...draft.qr, modoValidade: event.target.value === 'POR_DIAS' ? 'POR_DIAS' : 'SEM_VENCIMENTO', diasValidade: event.target.value === 'POR_DIAS' ? draft.qr.diasValidade || 365 : null })}
                className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-50"
              >
                <option value="POR_DIAS">Validade por dias</option>
                <option value="SEM_VENCIMENTO">Sem vencimento</option>
              </select>
              <input
                type="number"
                min="1"
                value={draft.qr.diasValidade ?? ''}
                disabled={!draft.qr.habilitado || draft.qr.modoValidade !== 'POR_DIAS'}
                onChange={(event) => update('qr', { ...draft.qr, diasValidade: event.target.value ? Number(event.target.value) : null })}
                placeholder="Dias"
                className="min-w-0 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-50"
              />
            </div>
          </div>
        </section>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-[2rem] border border-slate-200 bg-slate-100 p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Prévia CR80</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{showBack ? 'Verso' : 'Frente'} da credencial</p>
              </div>
              <button type="button" onClick={() => setShowBack((current) => !current)} className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600 shadow-sm hover:text-cyan-700">
                <RotateCcw size={14} /> Virar
              </button>
            </div>
            <div className="mx-auto aspect-[1.586/1] w-full max-w-[420px] overflow-hidden rounded-2xl bg-[#001a33] shadow-2xl">
              {showBack ? (
                <div className="relative flex h-full flex-col p-6 text-white">
                  {draft.marcaDaguaHabilitada && <span className="pointer-events-none absolute right-[-16px] top-[38%] -rotate-45 text-3xl font-black tracking-[0.2em] text-white/10">UNIVERSO</span>}
                  <ShieldCheck className="text-cyan-300" size={21} />
                  <p className="relative mt-5 max-w-[76%] text-xs leading-5 text-slate-200">{draft.mensagemVerso}</p>
                  <div className="relative mt-auto flex items-end justify-between gap-4 border-t border-white/15 pt-3">
                    <span className="max-w-[180px] text-[8px] font-bold uppercase tracking-wider text-slate-300">{draft.rodape}</span>
                    {draft.qr.habilitado && <div className="grid h-12 w-12 grid-cols-7 gap-px bg-white p-1">{QR_CELLS.map((isDark, index) => <span key={index} className={isDark ? 'bg-[#001a33]' : 'bg-white'} />)}</div>}
                  </div>
                </div>
              ) : (
                <div className="relative flex h-full items-stretch overflow-hidden">
                  <div className="relative flex flex-1 flex-col p-6 text-white">
                    {draft.marcaDaguaHabilitada && <span className="pointer-events-none absolute left-[-24px] top-8 text-4xl font-black tracking-[0.18em] text-white/10">U</span>}
                    <p className="relative text-[9px] font-black tracking-[0.2em] text-cyan-200">{draft.subtituloFrente}</p>
                    <h5 className="relative mt-3 text-base font-black uppercase leading-5">{draft.tituloFrente}</h5>
                    <p className="relative mt-auto text-sm font-black uppercase tracking-wide">NOME DO(A) PROFESSOR(A)</p>
                    <p className="relative mt-1 text-[9px] font-bold uppercase tracking-widest text-cyan-200">Professor · Polo emissor</p>
                  </div>
                  {draft.mostrarFoto && <div className="m-4 ml-0 flex w-[28%] items-center justify-center rounded-xl border border-white/20 bg-slate-300 text-[9px] font-black uppercase tracking-wider text-slate-500">Foto</div>}
                </div>
              )}
            </div>
            <p className="mt-4 flex items-center gap-2 text-[10px] font-medium leading-relaxed text-slate-500"><ShieldCheck size={13} className="text-cyan-700" /> A emissão final usa dados e validade retornados pelo backend.</p>
          </div>
        </aside>
      </div>
    </div>
  );
};
