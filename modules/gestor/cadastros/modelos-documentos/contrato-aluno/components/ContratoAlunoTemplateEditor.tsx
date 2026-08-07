import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Droplets,
  FileSignature,
  Loader2,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useContratoAlunoTemplate } from '../hooks/useContratoAlunoTemplate';
import {
  CONTRATO_ALUNO_MODALIDADE_LABEL,
  type ConteudoModeloContratoAluno,
  type ContratoAlunoModalidade,
} from '../types/contrato-aluno.types';

interface ContratoAlunoTemplateEditorProps {
  modalidade: ContratoAlunoModalidade;
}

const sourceCopy = {
  MINUTA_TECNICA: 'Base vinculada à minuta técnica institucional.',
  AGUARDANDO_REVISAO_JURIDICA: 'Aguardando revisão jurídica antes de qualquer emissão.',
} as const;

const statusMeta = {
  RASCUNHO: { label: 'Rascunho', className: 'bg-slate-100 text-slate-600' },
  EM_REVISAO: { label: 'Em revisão', className: 'bg-amber-50 text-amber-700' },
  ATIVO: { label: 'Ativo para emissão', className: 'bg-emerald-50 text-emerald-700' },
} as const;

export const ContratoAlunoTemplateEditor = ({ modalidade }: ContratoAlunoTemplateEditorProps) => {
  const { templateQuery, saveMutation, approveMutation } = useContratoAlunoTemplate(modalidade);
  const [draft, setDraft] = useState<ConteudoModeloContratoAluno | null>(null);
  const [isActivationPromptOpen, setIsActivationPromptOpen] = useState(false);
  const [activationAcknowledged, setActivationAcknowledged] = useState(false);
  const loadedVersion = useRef<string | null>(null);

  useEffect(() => {
    if (!templateQuery.data) return;
    const nextVersion = `${modalidade}:${templateQuery.data.revisao}`;
    if (loadedVersion.current === nextVersion) return;
    loadedVersion.current = nextVersion;
    setDraft(templateQuery.data.conteudo);
  }, [modalidade, templateQuery.data]);

  const isDirty = useMemo(() => (
    Boolean(draft && templateQuery.data && JSON.stringify(draft) !== JSON.stringify(templateQuery.data.conteudo))
  ), [draft, templateQuery.data]);

  const update = <K extends keyof ConteudoModeloContratoAluno>(
    key: K,
    value: ConteudoModeloContratoAluno[K],
  ) => setDraft((current) => current ? { ...current, [key]: value } : current);

  const save = () => {
    if (draft) saveMutation.mutate(draft);
  };

  if (templateQuery.isError) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-[2rem] border border-rose-100 bg-white p-8 shadow-sm">
        <div className="max-w-md text-center">
          <AlertTriangle className="mx-auto text-rose-600" size={30} />
          <h3 className="mt-4 text-base font-black uppercase text-[#001a33]">Modelo indisponível</h3>
          <p className="mt-2 text-sm font-medium text-slate-500">Não foi possível carregar a versão canônica do contrato.</p>
          <button
            type="button"
            onClick={() => void templateQuery.refetch()}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#001a33] px-5 py-3 text-xs font-black uppercase tracking-wider text-white"
          >
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
          <span className="text-xs font-black uppercase tracking-[0.18em]">Carregando modelo de contrato</span>
        </div>
      </div>
    );
  }

  const hasReviewWarning = draft.fonte === 'AGUARDANDO_REVISAO_JURIDICA';
  const currentStatus = statusMeta[templateQuery.data.status];
  const requestActivation = () => {
    setActivationAcknowledged(false);
    setIsActivationPromptOpen(true);
  };
  const confirmActivation = () => {
    if (!activationAcknowledged) return;
    approveMutation.mutate(undefined, {
      onSuccess: () => setIsActivationPromptOpen(false),
    });
  };

  return (
    <div className="animate-fadeIn mx-auto max-w-7xl">
      <header className="mb-7 flex flex-col justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#001a33] text-white shadow-lg shadow-blue-950/15">
            <FileSignature size={23} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black uppercase tracking-tight text-[#001a33]">Contrato do aluno</h3>
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-blue-700">
                {CONTRATO_ALUNO_MODALIDADE_LABEL[modalidade]}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${currentStatus.className}`}>
                {currentStatus.label}
              </span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Revisão {templateQuery.data.revisao || 0} · alterações são versionadas e auditadas no servidor.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={save}
          disabled={!isDirty || saveMutation.isPending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#ed1c4e] px-5 py-3 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-rose-500/20 transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
          {saveMutation.isPending ? 'Salvando...' : 'Salvar versão'}
        </button>
      </header>

      {hasReviewWarning && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <p className="text-sm font-semibold leading-relaxed">
            {sourceCopy[draft.fonte]} O sistema mantém este rascunho separado para não adaptar cláusulas técnicas automaticamente.
          </p>
        </div>
      )}

      <section className={`mb-6 rounded-2xl border p-5 ${templateQuery.data.status === 'ATIVO' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex gap-3">
            <ShieldCheck className={`mt-0.5 shrink-0 ${templateQuery.data.status === 'ATIVO' ? 'text-emerald-700' : 'text-amber-700'}`} size={20} />
            <div>
              <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Disponibilidade para emissão</h4>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-relaxed text-slate-700">
                {templateQuery.data.status === 'ATIVO'
                  ? 'Este modelo será solicitado pela Secretaria na emissão. A RPC continua sendo a autoridade para validar modalidade, versão, permissão e elegibilidade.'
                  : 'Enquanto o modelo estiver em revisão, o backend bloqueia a emissão desta modalidade. Salve o texto e faça a aprovação explícita, que fica registrada no servidor.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestActivation}
            disabled={templateQuery.data.status === 'ATIVO' || isDirty || approveMutation.isPending}
            className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {approveMutation.isPending ? 'Aprovando...' : 'Aprovar para emissão'}
          </button>
        </div>
        {isDirty && (
          <p className="mt-3 text-xs font-semibold text-amber-800">Salve esta versão antes de registrá-la como aprovada para emissão.</p>
        )}
      </section>

      {saveMutation.isError && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <p className="text-sm font-semibold">{saveMutation.error instanceof Error ? saveMutation.error.message : 'Não foi possível salvar a nova versão.'}</p>
        </div>
      )}

      {saveMutation.isSuccess && !isDirty && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 size={19} />
          <p className="text-sm font-semibold">Versão salva. A emissão usará sempre o snapshot canônico aprovado pelo servidor.</p>
        </div>
      )}

      {approveMutation.isError && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={19} />
          <p className="text-sm font-semibold">{approveMutation.error instanceof Error ? approveMutation.error.message : 'Não foi possível registrar a aprovação do contrato.'}</p>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <section className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <FileSignature className="text-[#ed1c4e]" size={19} />
            <h4 className="text-sm font-black uppercase tracking-wider text-[#001a33]">Conteúdo e identidade</h4>
          </div>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Título do documento</span>
            <input
              value={draft.tituloDocumento}
              onChange={(event) => update('tituloDocumento', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-[#001a33] outline-none transition focus:border-blue-500 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Cabeçalho institucional</span>
            <input
              value={draft.cabecalho}
              onChange={(event) => update('cabecalho', event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-[#001a33] outline-none transition focus:border-blue-500 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Corpo do modelo</span>
            <textarea
              value={draft.corpo}
              onChange={(event) => update('corpo', event.target.value)}
              rows={14}
              className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
            />
            <span className="mt-2 block text-xs font-medium text-slate-400">Variáveis, dados de matrícula e condições financeiras serão resolvidos pela emissão segura, nunca pelo navegador.</span>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Rodapé</span>
              <textarea
                value={draft.rodape}
                onChange={(event) => update('rodape', event.target.value)}
                rows={3}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Nota de controle</span>
              <textarea
                value={draft.observacaoEscopo}
                onChange={(event) => update('observacaoEscopo', event.target.value)}
                rows={3}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
              />
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sky-900">
                  <Droplets size={18} />
                  <span className="text-xs font-black uppercase tracking-wider">Marca-d'água</span>
                </div>
                <input
                  aria-label="Ativar marca-d'água"
                  type="checkbox"
                  checked={draft.marcaDagua.habilitada}
                  onChange={(event) => update('marcaDagua', { ...draft.marcaDagua, habilitada: event.target.checked })}
                  className="h-4 w-4 accent-[#001a33]"
                />
              </div>
              <p className="mt-2 text-xs font-medium leading-relaxed text-sky-800">Usa a marca institucional do polo emissor, sem anexar arte local a este modelo.</p>
              <select
                value={draft.marcaDagua.intensidade}
                onChange={(event) => update('marcaDagua', { ...draft.marcaDagua, intensidade: event.target.value === 'MEDIA' ? 'MEDIA' : 'SUAVE' })}
                disabled={!draft.marcaDagua.habilitada}
                className="mt-3 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-900 disabled:opacity-50"
              >
                <option value="SUAVE">Intensidade suave</option>
                <option value="MEDIA">Intensidade média</option>
              </select>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-violet-900">
                  <QrCode size={18} />
                  <span className="text-xs font-black uppercase tracking-wider">QR e validade</span>
                </div>
                <span className="rounded-full bg-violet-700 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">Obrigatório</span>
              </div>
              <p className="mt-2 text-xs font-medium leading-relaxed text-violet-800">O QR leva somente a um código opaco de validação, gerado pela emissão. Apenas a validade e o rótulo são configuráveis.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <select
                  value={draft.qr.modoValidade}
                  onChange={(event) => update('qr', {
                    ...draft.qr,
                    modoValidade: event.target.value === 'POR_DIAS' ? 'POR_DIAS' : 'SEM_VENCIMENTO',
                    diasValidade: event.target.value === 'POR_DIAS' ? draft.qr.diasValidade || 30 : null,
                  })}
                  className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-50"
                >
                  <option value="SEM_VENCIMENTO">Sem vencimento</option>
                  <option value="POR_DIAS">Por dias</option>
                </select>
                <input
                  aria-label="Dias de validade"
                  type="number"
                  min="1"
                  value={draft.qr.diasValidade ?? ''}
                  disabled={draft.qr.modoValidade !== 'POR_DIAS'}
                  onChange={(event) => update('qr', { ...draft.qr, diasValidade: event.target.value ? Number(event.target.value) : null })}
                  placeholder="Dias"
                  className="min-w-0 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Prévia estrutural</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><ShieldCheck size={13} /> QR seguro</span>
            </div>
            <article className="relative min-h-[610px] overflow-hidden rounded-sm bg-white px-8 py-10 shadow-lg">
              {draft.marcaDagua.habilitada && (
                <div className={`pointer-events-none absolute inset-0 flex items-center justify-center ${draft.marcaDagua.intensidade === 'MEDIA' ? 'opacity-[0.09]' : 'opacity-[0.05]'}`}>
                  <span className="-rotate-45 text-5xl font-black tracking-[0.25em] text-[#001a33]">UNIVERSO</span>
                </div>
              )}
              <div className="relative text-center">
                <p className="text-[9px] font-black tracking-[0.16em] text-[#001a33]">{draft.cabecalho}</p>
                <div className="mx-auto mt-4 h-px w-20 bg-[#ed1c4e]" />
                <h5 className="mt-5 text-sm font-black uppercase leading-5 text-[#001a33]">{draft.tituloDocumento}</h5>
              </div>
              <div className="relative mt-8 whitespace-pre-wrap text-justify text-[10px] leading-5 text-slate-700">
                {draft.corpo || 'Conteúdo do modelo de contrato.'}
              </div>
              <div className="relative mt-10 border-t border-slate-200 pt-4">
                <p className="text-[8px] leading-4 text-slate-500">{draft.rodape}</p>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <p className="max-w-[150px] text-[8px] font-bold uppercase tracking-wider text-slate-500">{draft.qr.rotulo}</p>
                  <div className="grid h-11 w-11 grid-cols-5 gap-px bg-white p-1 ring-1 ring-slate-300">
                    {Array.from({ length: 25 }, (_, index) => <span key={index} className={(index * 7) % 5 < 3 ? 'bg-[#001a33]' : 'bg-white'} />)}
                  </div>
                </div>
              </div>
            </article>
          </div>
        </aside>
      </div>

      {isActivationPromptOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#001a33]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="confirmar-ativacao-contrato">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
              <AlertTriangle size={22} />
            </div>
            <h4 id="confirmar-ativacao-contrato" className="mt-4 text-lg font-black uppercase tracking-tight text-[#001a33]">Confirmar ativação para emissão</h4>
            <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">
              A aprovação é uma operação independente do salvamento. Confirme que o texto de {CONTRATO_ALUNO_MODALIDADE_LABEL[modalidade]} foi revisado e aprovado juridicamente para essa modalidade.
            </p>
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-medium leading-relaxed text-slate-600">
              A confirmação visual não altera o conteúdo. A RPC confere a revisão, exige QR Code, registra o responsável e cria uma trilha de aprovação no servidor.
            </p>
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-[#001a33]">
              <input type="checkbox" checked={activationAcknowledged} onChange={(event) => setActivationAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-700" />
              <span>Confirmo que o conteúdo foi revisado para esta modalidade e está autorizado para emissão.</span>
            </label>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsActivationPromptOpen(false)} disabled={approveMutation.isPending} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={confirmActivation} disabled={!activationAcknowledged || approveMutation.isPending} className="rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300">{approveMutation.isPending ? 'Registrando...' : 'Registrar aprovação'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
