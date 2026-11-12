import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, FileText } from 'lucide-react';
import ReportPdfPreviewModal from '../pdf/ReportPdfPreviewModal';
import { createNfseIssuedPeriod } from '../../emissor-nfse/emitidas/nfse-issued-period';
import { getNfseCurrentMonth, isNfseScopeValid } from '../../emissor-nfse/types/nfse.scope';
import { useNfseEnvironment } from '../../emissor-nfse/hooks/useNfseEnvironment';
import { fetchNfseAccountingReport } from './nfse-accounting.service';
import { accountingDate, type NfseAccountingMode } from './nfse-accounting.types';
import { FilterField, FilterInput } from '../components/RelatorioShared';

interface Props { poloId?: string | null; contextKey?: string; isMatriz: boolean; canAccessNfse: boolean }
export default function RelatorioNfse({ poloId, contextKey, isMatriz, canAccessNfse }: Props) {
  const period = useMemo(() => createNfseIssuedPeriod(), []);
  const [dateFrom, setDateFrom] = useState(period.dateFrom);
  const [dateTo, setDateTo] = useState(period.dateTo);
  const [mode, setMode] = useState<NfseAccountingMode>('POLO');
  const [preview, setPreview] = useState(false);
  const [environment] = useNfseEnvironment({ poloId, contextKey });
  const client = useQueryClient();
  const scope = useMemo(() => ({ poloId: poloId || '', contextKey: contextKey || '', environment, month: getNfseCurrentMonth() }), [poloId, contextKey, environment]);
  let validPeriod = false;
  try { validPeriod = Boolean(accountingDate(dateFrom) && accountingDate(dateTo) && dateFrom <= dateTo); } catch { /* Inline validation below. */ }
  const allowed = isNfseScopeValid(scope) && canAccessNfse && (mode === 'POLO' || isMatriz);
  const preparePdf = useCallback(async (progress: (message: string) => void) => {
    if (!allowed || !validPeriod) throw new Error('Selecione um polo autorizado e um período válido.');
    progress('Consultando todas as notas do período e os totais do servidor…');
    const report = await client.fetchQuery({
      queryKey: ['relatorio-nfse-contabil', scope.contextKey, scope.poloId, environment, mode, dateFrom, dateTo],
      queryFn: ({ signal }) => fetchNfseAccountingReport(scope, mode, dateFrom, dateTo, signal),
      staleTime: 0, gcTime: 0, retry: false,
    });
    progress('Compondo o PDF paisagem com a identificação institucional…');
    const { prepareNfseAccountingPdf } = await import('./nfse-accounting.resources');
    return prepareNfseAccountingPdf(report);
  }, [allowed, validPeriod, client, scope, environment, mode, dateFrom, dateTo]);
  return <div className="h-full overflow-y-auto space-y-4">
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label="Data inicial de emissão"><FilterInput type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></FilterField>
        <FilterField label="Data final de emissão"><FilterInput type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></FilterField>
        <span className="pb-2 text-xs text-slate-500">{environment === 'PRODUCAO' ? 'Produção' : 'Homologação'} · A4 paisagem</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" aria-label="Modelo do relatório fiscal">
        <button type="button" onClick={() => setMode('POLO')} aria-pressed={mode === 'POLO'}
          className={`rounded-xl border p-4 text-left ${mode === 'POLO' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <FileText size={18} className="mb-2 text-blue-700" /><strong className="text-sm text-slate-800">Por polo</strong>
          <p className="mt-1 text-xs text-slate-500">Notas da unidade selecionada e totais por código de tributação nacional.</p>
        </button>
        {isMatriz && <button type="button" onClick={() => setMode('GERAL')} aria-pressed={mode === 'GERAL'}
          className={`rounded-xl border p-4 text-left ${mode === 'GERAL' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <Building2 size={18} className="mb-2 text-blue-700" /><strong className="text-sm text-slate-800">Geral · Matriz</strong>
          <p className="mt-1 text-xs text-slate-500">Polos ativos da mesma instituição, resumo por unidade e por tributação. Exige acesso a todos os polos incluídos.</p>
        </button>}
      </div>
      <p className="text-xs leading-relaxed text-slate-500">Duas linhas por nota, com emissão, competência, número, chave, parceiro, CPF/CNPJ, data do serviço, tributação nacional, NBS, valor bruto e ISS. Cancelamentos confirmados ficam fora deste relatório.</p>
      {!allowed && <p role="status" className="text-sm text-amber-700">Selecione um polo e confirme seu acesso ao Emissor NFS-e. O consolidado só pode ser aberto na matriz.</p>}
      {!validPeriod && <p role="alert" className="text-sm text-rose-700">Informe um período de emissão válido.</p>}
      <button type="button" disabled={!allowed || !validPeriod} onClick={() => setPreview(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-[#001a33] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><FileText size={16} />Visualizar relatório</button>
    </section>
    {preview && allowed && <ReportPdfPreviewModal key={`${scope.poloId}:${scope.contextKey}:${environment}:${mode}:${dateFrom}:${dateTo}`}
      title={mode === 'GERAL' ? 'NFS-e emitidas · Geral da matriz' : 'NFS-e emitidas · Por polo'}
      description="Modelo contábil em paisagem · 2 linhas por nota" preparePdf={preparePdf} onClose={() => setPreview(false)} />}
  </div>;
}
