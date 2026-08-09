import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileEdit,
  FileSignature,
  Loader2,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { empresasService } from '../../../../configuracoes/empresas/empresas.service';
import { marcaDaguaService } from '../../../../configuracoes/marca-dagua/marca-dagua.service';
import { useContratoAlunoTemplate } from '../hooks/useContratoAlunoTemplate';
import {
  CONTRATO_ALUNO_MODALIDADE_LABEL,
  type ConteudoModeloContratoAluno,
  type ContratoAlunoModalidade,
} from '../types/contrato-aluno.types';
import { ContratoAlunoCanvas } from './ContratoAlunoCanvas';

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
  const [activeTab, setActiveTab] = useState<'editor' | 'preview' | 'split'>('split');
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [watermarkInfo, setWatermarkInfo] = useState<any>(null);
  const loadedVersion = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      empresasService.getCompanyPrincipal().catch(() => null),
      marcaDaguaService.getCompaniesWithWatermark().catch(() => []),
    ]).then(([company, watermarks]) => {
      if (!isMounted) return;
      if (company) setCompanyInfo(company);
      if (Array.isArray(watermarks) && watermarks.length > 0) {
        // Encontra a marca d'água cadastrada no polo/empresa ou a primeira que possui imagem
        const found =
          watermarks.find((w: any) => w.id === company?.id && Boolean(w.watermarkUrl || w.landscapeWatermarkUrl)) ||
          watermarks.find((w: any) => Boolean(w.watermarkUrl || w.landscapeWatermarkUrl)) ||
          watermarks[0];
        setWatermarkInfo(found);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

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

  const [activePageIndex, setActivePageIndex] = useState(0);

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
      <header className="mb-6 flex flex-col justify-between gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm lg:flex-row lg:items-center">
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

        <div className="flex items-center gap-3">
          {/* Mode Switcher Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('split')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition ${
                activeTab === 'split'
                  ? 'bg-white text-[#001a33] shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Lado a lado
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('editor')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition ${
                activeTab === 'editor'
                  ? 'bg-white text-[#001a33] shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileEdit size={14} /> Editor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition ${
                activeTab === 'preview'
                  ? 'bg-white text-[#001a33] shadow-sm'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Eye size={14} /> Prévia A4
            </button>
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
        </div>
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

      {/* Main Workspace Layout */}
      <div className={activeTab === 'split' ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start' : 'block'}>
        {(activeTab === 'split' || activeTab === 'editor') && (
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
                rows={16}
                className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
              />
              <span className="mt-2 block text-xs font-medium text-slate-400">Variáveis, dados de matrícula e condições financeiras serão resolvidos pela emissão segura. O sistema calcula a extensão do texto e distribui o conteúdo automaticamente pelas folhas A4.</span>
            </label>

            <label className="block rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
              <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-[#a30f36]">Destaques críticos em vermelho</span>
              <span className="mb-3 block text-xs font-medium leading-relaxed text-rose-800/75">
                Informe uma expressão por linha. O texto jurídico não é alterado: a emissão apenas aplica a cor às ocorrências exatas. Valores, datas, curso e condições financeiras do aluno já são destacados automaticamente.
              </span>
              <textarea
                value={draft.destaquesCriticos.join('\n')}
                onChange={(event) => update('destaquesCriticos', event.target.value.split('\n'))}
                rows={6}
                aria-label="Expressões críticas destacadas em vermelho"
                className="w-full resize-y rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-[#ed1c4e]"
              />
              <span className="mt-2 block text-xs font-medium text-rose-800/60">Títulos de cláusulas, parágrafos, ALUNO, CONTRATANTE, CONTRATADA e OBJETO ficam em negrito automaticamente.</span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Encerramento e assinaturas</span>
                <textarea
                  value={draft.rodape}
                  onChange={(event) => update('rodape', event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
                />
                <span className="mt-2 block text-xs font-medium text-slate-400">Local, assinaturas e testemunhas são impressos somente na última página.</span>
              </label>
              <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-wider text-slate-600">Nota de controle</span>
                <textarea
                  value={draft.observacaoEscopo}
                  onChange={(event) => update('observacaoEscopo', event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
                />
                <span className="mt-2 block text-xs font-medium text-slate-400">Uso interno do modelo; não aparece na prévia nem no documento emitido.</span>
              </label>
            </div>

            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-violet-900">
                  <QrCode size={18} />
                  <span className="text-xs font-black uppercase tracking-wider">QR e validade</span>
                </div>
                <span className="rounded-full bg-violet-700 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white">Obrigatório</span>
              </div>
              <p className="mt-2 text-xs font-medium leading-relaxed text-violet-800">O QR leva ao código opaco de validação gerado pela emissão.</p>
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
          </section>
        )}

        {(activeTab === 'split' || activeTab === 'preview') && (
          <aside className="w-full overflow-x-auto rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:self-start">
            <ContratoAlunoCanvas
              tituloDocumento={draft.tituloDocumento}
              cabecalho={draft.cabecalho}
              corpo={draft.corpo}
              destaquesCriticos={draft.destaquesCriticos}
              rodape={draft.rodape}
              observacaoEscopo={draft.observacaoEscopo}
              qr={draft.qr}
              polo={companyInfo}
              centralWatermark={watermarkInfo}
              activePageIndex={activePageIndex}
              onPageSelect={setActivePageIndex}
            />
          </aside>
        )}
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
