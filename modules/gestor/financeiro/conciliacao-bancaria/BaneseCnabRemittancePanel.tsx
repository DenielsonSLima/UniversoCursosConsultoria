import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileOutput,
  Loader2,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { EnvironmentBadge } from '../../configuracoes/integracao-bancaria/integracao-bancaria.ui';
import { triggerBaneseRemittanceDownload } from './conciliacao-bancaria.download';
import { baneseCnab240Service } from './conciliacao-bancaria.service';
import {
  BANESE_RECONCILIATION_TIME_ZONE,
  describeCnabAvailabilityError,
} from './conciliacao-bancaria.utils';
import type {
  BaneseCnabExchangeFile,
  BaneseCnabGenerateRemittanceResult,
  BaneseCnabOverview,
  BaneseCnabRemittancePreviewResult,
} from './conciliacao-bancaria.types';

interface BaneseCnabRemittancePanelProps {
  overview?: BaneseCnabOverview;
  isLoading: boolean;
  error?: string | null;
  onRefresh: () => void;
  onChanged: () => Promise<void> | void;
}

const toCurrency = (value: number) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
}).format(value || 0);

const toDate = (value?: string | null) => {
  if (!value) return '-';
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR', { timeZone: BANESE_RECONCILIATION_TIME_ZONE });
};

const toFinancialTermValue = (type: string, value: number) => {
  if (/PERCENT/i.test(type)) {
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(value)}%`;
  }
  return toCurrency(value);
};

const installmentLabel = (number: number | null, count: number | null) => {
  if (number !== null && count !== null) return `Parcela ${number} de ${count}`;
  if (number !== null) return `Parcela ${number}`;
  if (count !== null) return `${count} parcela(s) no total`;
  return 'Parcela não informada';
};

const BaneseCnabRemittancePanel: React.FC<BaneseCnabRemittancePanelProps> = ({
  overview,
  isLoading,
  error,
  onRefresh,
  onChanged,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<BaneseCnabRemittancePreviewResult | null>(null);
  const [generated, setGenerated] = useState<BaneseCnabGenerateRemittanceResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [productionAcknowledged, setProductionAcknowledged] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const availabilityNotice = describeCnabAvailabilityError(error);

  const eligible = useMemo(
    () => overview?.eligibleReceivables || [],
    [overview?.eligibleReceivables],
  );
  const eligibleIds = useMemo(() => new Set(eligible.map((item) => item.id)), [eligible]);
  const recentRemittances = (overview?.files || [])
    .filter((file) => file.direction === 'REMESSA' && file.status === 'GENERATED')
    .slice(0, 5);
  const allSelected = eligible.length > 0 && selectedIds.length === eligible.length;

  useEffect(() => {
    setSelectedIds([]);
    setPreview(null);
    setGenerated(null);
    setProductionAcknowledged(false);
    setFeedback(null);
  }, [overview?.environment]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => eligibleIds.has(id)));
  }, [eligibleIds]);

  const resetConfirmation = () => {
    setPreview(null);
    setGenerated(null);
    setProductionAcknowledged(false);
    setFeedback(null);
  };

  const toggleReceivable = (receivableId: string) => {
    resetConfirmation();
    setSelectedIds((current) => current.includes(receivableId)
      ? current.filter((id) => id !== receivableId)
      : [...current, receivableId]);
  };

  const toggleAll = () => {
    resetConfirmation();
    setSelectedIds(allSelected ? [] : eligible.map((item) => item.id));
  };

  const handlePreview = async () => {
    if (!overview || selectedIds.length === 0) return;
    setFeedback(null);
    setPreviewing(true);
    try {
      const result = await baneseCnab240Service.previewRemittance({
        environment: overview.environment,
        receivableIds: selectedIds,
      });
      setPreview(result);
      setGenerated(null);
      setProductionAcknowledged(false);
      setFeedback({
        type: 'success',
        message: `Prévia pronta com ${result.titleCount} título(s). Nenhum NSA foi consumido e nenhum arquivo foi gerado.`,
      });
    } catch (previewError: any) {
      setPreview(null);
      setFeedback({
        type: 'error',
        message: previewError?.message || 'Não foi possível gerar a prévia da remessa.',
      });
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (!overview || !preview) return;
    if (preview.environment === 'production' && !productionAcknowledged) {
      setFeedback({
        type: 'error',
        message: 'Confirme explicitamente a geração da remessa de produção.',
      });
      return;
    }
    setFeedback(null);
    setGenerating(true);
    try {
      const result = await baneseCnab240Service.generateRemittance({
        environment: preview.environment,
        receivableIds: preview.items.map((item) => item.receivableId),
        previewFingerprint: preview.previewFingerprint,
        confirmProduction: productionAcknowledged,
      });
      setGenerated(result);
      setFeedback({
        type: 'success',
        message: `Remessa ${result.file.fileName} gerada. Faça o download e envie pelo canal oficial do Banese.`,
      });
      await Promise.resolve().then(onChanged).catch(() => undefined);
    } catch (generateError: any) {
      setFeedback({
        type: 'error',
        message: generateError?.message || 'Não foi possível gerar a remessa Banese.',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (file: BaneseCnabExchangeFile) => {
    setFeedback(null);

    if (file.direction !== 'REMESSA' || file.status !== 'GENERATED') {
      setFeedback({
        type: 'error',
        message: 'Somente remessas geradas com sucesso podem ser baixadas.',
      });
      return;
    }

    setDownloadingFileId(file.id);
    try {
      const result = await baneseCnab240Service.downloadFile({
        environment: file.environment,
        fileId: file.id,
      });
      triggerBaneseRemittanceDownload(result.blob, result.file.fileName);
      setFeedback({
        type: 'success',
        message: `${result.file.fileName} baixado com o nome oficial. O link privado expirava em ${result.expiresIn} segundos.`,
      });
    } catch (downloadError: any) {
      setFeedback({
        type: 'error',
        message: downloadError?.message || 'Não foi possível autorizar o download da remessa.',
      });
    } finally {
      setDownloadingFileId(null);
    }
  };

  return (
    <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <FileOutput size={22} />
          </span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Exportação bancária</p>
            <h3 className="mt-1 text-lg font-black text-[#001a33]">Remessa CNAB 240 Banese</h3>
            <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-500">
              Selecione cobranças de contingência, confira a prévia e só então gere o arquivo .rem para envio ao banco.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {overview ? <EnvironmentBadge environment={overview.environment} /> : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold leading-relaxed text-blue-800">
        <strong>Proteção contra duplicidade:</strong> títulos registrados ou com
        criação ambígua pela API não entram na remessa e permanecem excluídos
        automaticamente.
      </div>

      {availabilityNotice ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-900">
          <p className="font-black uppercase tracking-wide">{availabilityNotice.title}</p>
          <p className="mt-1">{availabilityNotice.message}</p>
          <p className="mt-2 text-[10px] text-amber-700">Retorno técnico: {availabilityNotice.detail}</p>
        </div>
      ) : null}

      {feedback ? (
        <div className={`mt-4 rounded-xl border p-4 text-xs font-bold ${feedback.type === 'success'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
          {feedback.message}
        </div>
      ) : null}

      {isLoading && !overview ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Carregando títulos elegíveis...
        </div>
      ) : overview ? (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Títulos elegíveis</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {eligible.length} disponível(is) · {selectedIds.length} selecionado(s)
                </p>
              </div>
              <button
                type="button"
                onClick={toggleAll}
                disabled={eligible.length === 0 || previewing || generating}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
              >
                {allSelected ? 'Limpar seleção' : 'Selecionar todos'}
              </button>
            </div>

            {eligible.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center">
                <ShieldCheck className="mx-auto text-emerald-600" size={22} />
                <p className="mt-2 text-xs font-black text-slate-700">Nenhuma cobrança elegível para remessa</p>
                <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-500">
                  A geração permanece bloqueada. Títulos já enviados pela API ou já vinculados a outro arquivo não são listados.
                </p>
              </div>
            ) : (
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                {eligible.map((item) => {
                  const selected = selectedIds.includes(item.id);
                  return (
                    <label
                      key={item.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${selected
                        ? 'border-blue-300 bg-blue-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleReceivable(item.id)}
                        disabled={previewing || generating}
                        className="mt-1 h-4 w-4 accent-blue-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black text-slate-700">{item.description}</span>
                        <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                          Nosso número {item.nossoNumero} · vence {toDate(item.dueDate)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs font-black text-slate-700">{toCurrency(item.nominalAmount)}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handlePreview}
              disabled={selectedIds.length === 0 || previewing || generating}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-lg shadow-blue-600/15 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {previewing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {previewing ? 'Validando títulos...' : 'Gerar prévia da remessa'}
            </button>
          </div>

          <div className="min-w-0 space-y-4 rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Confirmação e arquivo</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                A prévia não consome NSA. O número sequencial e o arquivo privado só são criados na confirmação.
              </p>
            </div>

            {preview ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Títulos</p>
                    <p className="mt-1 text-xl font-black text-[#001a33]">{preview.titleCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Valor nominal</p>
                    <p className="mt-1 text-sm font-black text-emerald-700">{toCurrency(preview.totalAmount)}</p>
                  </div>
                </div>

                <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {preview.items.map((item) => (
                    <div key={item.receivableId} className="rounded-lg bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-black text-slate-700">{item.description}</p>
                          <p className="mt-1 text-[10px] font-semibold text-slate-500">
                            Nosso número {item.nossoNumero} · {installmentLabel(item.installmentNumber, item.installmentCount)}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs font-black text-slate-700">
                          {toCurrency(item.financialTerms.nominalAmount)}
                        </span>
                      </div>
                      <p className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        Valor nominal {toCurrency(item.financialTerms.nominalAmount)} · vencimento {toDate(item.financialTerms.dueDate)}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {item.financialTerms.discount ? (
                          <p className="rounded-md bg-emerald-50 px-2 py-1.5 text-[9px] font-bold text-emerald-800">
                            Desconto · tipo {item.financialTerms.discount.type} · valor {toFinancialTermValue(item.financialTerms.discount.type, item.financialTerms.discount.value)} · válido até {toDate(item.financialTerms.discount.validUntil)}
                          </p>
                        ) : null}
                        {item.financialTerms.penalty ? (
                          <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[9px] font-bold text-amber-800">
                            Multa · tipo {item.financialTerms.penalty.type} · valor {toFinancialTermValue(item.financialTerms.penalty.type, item.financialTerms.penalty.value)} · inicia em {toDate(item.financialTerms.penalty.startsOn)}
                          </p>
                        ) : null}
                        {item.financialTerms.interest ? (
                          <p className="rounded-md bg-blue-50 px-2 py-1.5 text-[9px] font-bold text-blue-800">
                            Juros · tipo {item.financialTerms.interest.type} · valor {toFinancialTermValue(item.financialTerms.interest.type, item.financialTerms.interest.value)} · inicia em {toDate(item.financialTerms.interest.startsOn)}
                          </p>
                        ) : null}
                        {!item.financialTerms.discount
                          && !item.financialTerms.penalty
                          && !item.financialTerms.interest ? (
                            <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[9px] font-bold text-slate-500">
                              Sem desconto, multa ou juros configurados.
                            </p>
                          ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                {preview.environment === 'production' && !generated ? (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3">
                    <input
                      type="checkbox"
                      checked={productionAcknowledged}
                      onChange={(event) => setProductionAcknowledged(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-rose-600"
                    />
                    <span className="text-xs font-bold leading-relaxed text-rose-800">
                      Confirmo a geração desta remessa no ambiente de produção.
                    </span>
                  </label>
                ) : null}

                {!generated ? (
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={generating || (preview.environment === 'production' && !productionAcknowledged)}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50 ${preview.environment === 'production'
                      ? 'bg-rose-600 shadow-rose-600/15 hover:bg-rose-700'
                      : 'bg-emerald-600 shadow-emerald-600/15 hover:bg-emerald-700'}`}
                  >
                    {generating ? <Loader2 size={14} className="animate-spin" /> : <FileOutput size={14} />}
                    {generating ? 'Gerando arquivo privado...' : 'Confirmar e gerar remessa'}
                  </button>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="shrink-0 text-emerald-700" size={18} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Arquivo gerado</p>
                        <p className="mt-1 break-all text-xs font-black text-emerald-900">{generated.file.fileName}</p>
                        <p className="mt-1 text-[10px] font-semibold text-emerald-700">
                          NSA {generated.file.nsa || '-'} · {generated.file.titleCount} título(s)
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownload(generated.file)}
                      disabled={downloadingFileId === generated.file.id}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      {downloadingFileId === generated.file.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      Baixar arquivo .rem
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-xs font-semibold text-slate-500">
                Selecione ao menos uma cobrança elegível para iniciar a prévia.
              </div>
            )}

            {recentRemittances.length > 0 ? (
              <div className="border-t border-slate-200 pt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Remessas recentes</p>
                <div className="mt-2 space-y-2">
                  {recentRemittances.map((file) => (
                    <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-black text-slate-700">{file.fileName}</p>
                        <p className="mt-1 text-[9px] font-semibold text-slate-500">
                          NSA {file.nsa || '-'} · {toDate(file.generatedAt || file.createdAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        disabled={downloadingFileId === file.id}
                        title="Gerar novo link assinado"
                        className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-50"
                      >
                        {downloadingFileId === file.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};

export default BaneseCnabRemittancePanel;
