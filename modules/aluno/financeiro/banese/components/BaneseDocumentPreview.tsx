import Barcode from 'lucide-react/dist/esm/icons/barcode';
import CheckCircle2 from 'lucide-react/dist/esm/icons/check-circle-2';
import CircleDollarSign from 'lucide-react/dist/esm/icons/circle-dollar-sign';
import LockKeyhole from 'lucide-react/dist/esm/icons/lock-keyhole';
import QrCode from 'lucide-react/dist/esm/icons/qr-code';
import type { BanesePaymentRecord, BanesePixPresentation } from '../banese-payment.types';
import {
  formatBaneseCurrency,
  formatBaneseDate,
  formatBaneseDigitableLine,
  getBanesePayer,
  maskBaneseDocument,
} from '../banese-payment.utils';

interface BaneseDocumentPreviewProps {
  record: BanesePaymentRecord;
  pix: BanesePixPresentation;
  installmentLabel?: string | null;
  disabled?: boolean;
}

const BaneseDocumentPreview = ({ record, pix, installmentLabel, disabled = false }: BaneseDocumentPreviewProps) => {
  const payer = getBanesePayer(record);
  const firstName = String(payer.nome || 'Aluno').trim().split(/\s+/)[0];
  const line = formatBaneseDigitableLine(record.gateway_boleto_linha_digitavel);
  const financialTerms = record.gateway_financial_terms;
  const termValue = (term: { type: string; value: number } | null, monthly = false) => {
    if (!term) return 'Não aplicado';
    if (term.type === 'fixed' || term.type === 'daily-fixed') {
      return `${formatBaneseCurrency(term.value)}${term.type === 'daily-fixed' ? ' ao dia' : ''}`;
    }
    return `${Number(term.value).toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%${monthly ? ' ao mês' : ''}`;
  };

  return (
    <section className="relative mx-auto w-full max-w-[820px] overflow-hidden rounded-[1.9rem] border border-slate-200 bg-white shadow-[0_28px_75px_rgba(15,23,42,0.13)]">
      <div className="absolute left-0 top-0 h-1.5 w-full bg-[linear-gradient(90deg,#001a33_0%,#001a33_55%,#087a57_55%,#087a57_88%,#e31925_88%)]" />

      <div className="border-b border-slate-100 px-5 pb-5 pt-7 sm:px-8 sm:pt-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <img src="/LogoUniverso.png" alt="Universo Cursos e Consultoria" className="h-auto w-44 object-contain sm:w-52" />
          <div className="flex w-fit items-center gap-3 rounded-2xl bg-[#001a33] px-4 py-3 text-white">
            <img src="/logos/payment-gateways/banese.png" alt="Banese" className="h-5 w-auto max-w-28 object-contain" />
            <div className="h-7 w-px bg-white/20" />
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.16em] text-emerald-200">Processado pelo</p>
              <p className="text-[10px] font-black uppercase tracking-[0.16em]">Banco 047</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-xl">
            <p className="font-serif text-2xl font-bold tracking-tight text-[#001a33] sm:text-3xl">Olá, {firstName}.</p>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
              Esta é a sua cobrança da Universo, registrada e processada pelo Banese.
            </p>
          </div>
          {installmentLabel ? (
            <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-blue-700">
              {installmentLabel}
            </span>
          ) : null}
        </div>

        <div className="mt-6 rounded-[1.6rem] bg-[#001a33] p-5 text-white sm:p-6">
          <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-300">Referência</p>
              <p className="mt-2 text-base font-black leading-snug">{record.descricao || record.cursoNome || 'Cobrança de curso'}</p>
              <p className="mt-2 text-xs font-semibold text-slate-300">
                {payer.nome || 'Aluno identificado'} • {payer.documentMasked || maskBaneseDocument(payer.cpf_cnpj)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200">Valor da cobrança</p>
              <p className="mt-1 font-serif text-3xl font-bold tracking-tight">{formatBaneseCurrency(record.valor)}</p>
              <p className="mt-1 text-[10px] font-bold text-slate-300">Vence em {formatBaneseDate(record.data_vencimento)}</p>
            </div>
          </div>
        </div>

        {financialTerms?.confirmed ? (
          <section className="mt-4 overflow-hidden rounded-[1.35rem] border border-emerald-100 bg-[linear-gradient(135deg,#f7fffb_0%,#ffffff_55%,#f4f8ff_100%)]">
            <div className="grid divide-y divide-emerald-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="p-4">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  Desconto até {formatBaneseDate(financialTerms.discount?.validUntil || record.data_vencimento)}
                </p>
                <p className="mt-1.5 text-sm font-black text-[#001a33]">{termValue(financialTerms.discount)}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">
                  {financialTerms.discount ? `Valor até o vencimento: ${formatBaneseCurrency(financialTerms.discount.amountUntilDue)}` : 'Valor nominal até o vencimento'}
                </p>
              </div>
              <div className="p-4">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-amber-700">Multa após o vencimento</p>
                <p className="mt-1.5 text-sm font-black text-[#001a33]">{termValue(financialTerms.penalty)}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">
                  {financialTerms.penalty ? `A partir de ${formatBaneseDate(financialTerms.penalty.startsOn)}` : 'Sem multa cadastrada'}
                </p>
              </div>
              <div className="p-4">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-blue-700">Juros após o vencimento</p>
                <p className="mt-1.5 text-sm font-black text-[#001a33]">{termValue(financialTerms.interest, true)}</p>
                <p className="mt-1 text-[10px] font-bold text-slate-500">
                  {financialTerms.interest ? `A partir de ${formatBaneseDate(financialTerms.interest.startsOn)}` : 'Sem juros cadastrados'}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <div className="mt-7">
          <div className="flex items-center gap-2">
            <CircleDollarSign size={18} className="text-emerald-700" />
            <h3 className="font-serif text-xl font-bold text-[#001a33]">Como realizar o pagamento</h3>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-[#001a33]">
                <Barcode size={17} />
                <p className="text-[10px] font-black uppercase tracking-[0.17em]">Boleto</p>
              </div>
              <p className="mt-3 break-all font-mono text-[11px] font-black leading-6 text-slate-700">
                {disabled ? 'Cobrança encerrada — linha de pagamento indisponível' : line || 'Linha digitável em preparação'}
              </p>
              <div className="mt-4 flex items-center gap-2 border-t border-slate-200 pt-3 text-[10px] font-bold text-slate-500">
                <CheckCircle2 size={14} className="text-emerald-600" />
                Título bancário validado pelo sistema
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-emerald-200 bg-emerald-50 p-4">
              {!disabled && pix.state === 'available' && pix.imageSource ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <img src={pix.imageSource} alt="QR Code Pix Banese desta cobrança" className="h-28 w-28 rounded-xl bg-white p-1.5 shadow-sm" />
                  <p className="mt-2 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-800">Pague também via Pix</p>
                </div>
              ) : (
                <div className="flex h-full min-h-36 flex-col items-center justify-center text-center">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl border border-dashed border-emerald-300 bg-white text-emerald-700">
                    <QrCode size={22} />
                  </div>
                  <p className="mt-3 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-800">Espaço reservado para o Pix</p>
                  <p className="mt-1 text-[10px] font-semibold leading-relaxed text-emerald-700/75">{disabled ? 'Pagamento encerrado' : pix.title}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-7 flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold leading-relaxed text-slate-500">
          <LockKeyhole size={17} className="mt-0.5 shrink-0 text-[#001a33]" />
          <p>Seus dados estão protegidos. Esta cobrança só pode ser visualizada dentro da sua área autenticada.</p>
        </div>
      </div>
    </section>
  );
};

export default BaneseDocumentPreview;
