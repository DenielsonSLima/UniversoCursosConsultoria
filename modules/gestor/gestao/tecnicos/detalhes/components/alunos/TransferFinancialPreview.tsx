import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import type { TransferFinancialPreview as Preview } from '../../transfer-finance.contract';

export const transferFinancialLabels: Record<string, string> = {
  PROESC: 'Proesc', BANESE_API: 'Banese API', BANESE_CNAB: 'Banese CNAB', LOCAL: 'Local', LEGADO: 'Outro legado',
  PAGO: 'Pago', VENCIDO: 'Anterior à saída', NO_DIA: 'No dia da saída', FUTURO: 'Após a saída', SEM_DATA: 'Sem data confirmada',
  PRESERVAR: 'Preservar', CONTINUAR_ORIGEM: 'Manter na origem', CANCELAR_LOCAL: 'Cancelar registro local',
  AGUARDAR_BANESE: 'Solicitar baixa ao Banese', REVISAO_EXTERNA: 'Revisão externa necessária',
  PAGAMENTO_PRESERVADO: 'Pagamento preservado', CONTINUIDADE_ORIGEM: 'Cobrança mantida na origem',
  PRESERVADO_PELO_CORTE: 'Preservado pela data de saída', CANCELADO_BANESE: 'Cancelamento Banese confirmado',
  REVISAO_BANESE: 'Cancelamento Banese em revisão', AGUARDANDO_BANESE: 'Aguardando confirmação Banese',
  CANCELADO_LOCAL: 'Registro local cancelado', PRESERVADO: 'Preservado',
};
export const transferMoney = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const transferDate = (value: string | null) => value ? value.split('-').reverse().join('/') : 'Sem data';

export default function TransferFinancialPreview({ preview, loading, error, locked, onRetry }: {
  preview?: Preview; loading: boolean; error: string | null; locked: boolean; onRetry: () => void;
}) {
  return <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4" aria-label="Prévia financeira da transferência">
    <h4 className="text-xs font-black uppercase text-violet-900">Confira as cobranças</h4>
    {locked && <p className="text-xs font-semibold text-amber-800">A confirmação mantém os dados revisados. Se a resposta não chegou, tente novamente para consultar a mesma operação.</p>}
    {loading && <p className="flex items-center gap-2 text-xs text-slate-600"><Loader2 className="animate-spin" size={14} /> Conferindo títulos...</p>}
    {error && <div className="text-xs font-semibold text-red-700"><p>{error}</p><button type="button" onClick={onRetry}
      disabled={loading || locked} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 disabled:opacity-50">
      <RefreshCw size={13} /> Recarregar prévia</button></div>}
    {!preview && !loading && !error && <p className="text-xs text-slate-600">Selecione data e destino para consultar a prévia.</p>}
    {preview && <>
      <p className="text-xs text-slate-700">{preview.tipo === 'EXTERNA_ENVIADA'
        ? `Somente vencimentos posteriores a ${transferDate(preview.dataTransferencia)} podem ser cancelados. Pagos, anteriores e do próprio dia ficam preservados.`
        : 'Todas as cobranças continuam vinculadas à matrícula de origem. Nenhum pagamento, título ou boleto será movido, excluído ou reemitido.'}</p>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div>Preservados: <strong>{preview.resumo.preservados}</strong></div>
        <div>Cancelamentos locais: <strong>{preview.resumo.locaisACancelar}</strong></div>
        <div>Solicitações Banese: <strong>{preview.resumo.banesePendentes}</strong></div>
        <div>Revisão externa: <strong>{preview.resumo.revisaoExterna}</strong></div>
      </dl>
      {preview.resumo.banesePendentes > 0 && <p className="text-xs text-amber-900">A baixa dos boletos depende de confirmação do Banese. A conclusão acadêmica não confirma o cancelamento bancário.</p>}
      {preview.resumo.revisaoExterna > 0 && <p className="text-xs text-amber-900">Cobranças externas permanecem intactas. A pendência ficará disponível em “Financeiro das transferências” para conferência com a origem.</p>}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-violet-100 bg-white">
        {preview.itens.length === 0 ? <p className="p-3 text-xs text-slate-500">Nenhuma cobrança vinculada à matrícula.</p>
          : preview.itens.map((item) => <div key={item.id} className="border-b border-slate-100 p-3 text-xs last:border-0">
            <p className="font-bold text-slate-800">{item.descricao}</p>
            <p className="mt-1 text-slate-600">{transferFinancialLabels[item.origem]} · {transferDate(item.vencimento)} · {transferMoney(item.valor)}</p>
            <p className="mt-1 font-semibold text-violet-800">{transferFinancialLabels[item.faixa]} — {transferFinancialLabels[item.acao]}</p>
          </div>)}
      </div>
    </>}
  </section>;
}
