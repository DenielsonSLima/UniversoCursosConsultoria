import Building2 from 'lucide-react/dist/esm/icons/building-2';
import CalendarDays from 'lucide-react/dist/esm/icons/calendar-days';
import GraduationCap from 'lucide-react/dist/esm/icons/graduation-cap';
import ReceiptText from 'lucide-react/dist/esm/icons/receipt-text';
import UserRound from 'lucide-react/dist/esm/icons/user-round';
import WalletCards from 'lucide-react/dist/esm/icons/wallet-cards';
import type { BanesePaymentRecord, BanesePixPresentation } from '../banese-payment.types';
import {
  formatBaneseCurrency,
  formatBaneseDate,
  getBanesePayer,
  getBaneseStatusPresentation,
  maskBaneseDocument,
} from '../banese-payment.utils';
import BanesePaymentStatus from './BanesePaymentStatus';

interface BaneseChargeSummaryProps {
  record: BanesePaymentRecord;
  pix: BanesePixPresentation;
}

const summaryItems = (
  record: BanesePaymentRecord,
  pix: BanesePixPresentation,
) => {
  const isDependency = String(record.tipo_lancamento || '').toUpperCase() === 'DISCIPLINA';
  return [
  { label: 'Vencimento', value: formatBaneseDate(record.data_vencimento), icon: CalendarDays },
  { label: 'Forma de pagamento', value: pix.state === 'available' ? 'Boleto com Pix' : 'Boleto Banese', icon: WalletCards },
  ...(isDependency ? [] : [{ label: 'Modalidade', value: String(record.modalidade || 'Curso').replace('_', ' '), icon: GraduationCap }]),
  { label: 'Valor', value: formatBaneseCurrency(record.valor), icon: ReceiptText },
];
};

const BaneseChargeSummary = ({ record, pix }: BaneseChargeSummaryProps) => {
  const payer = getBanesePayer(record);
  const status = getBaneseStatusPresentation(record);

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 border-b border-slate-100 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#001a33] text-white">
            <Building2 size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Beneficiário</p>
            <p className="mt-1 text-sm font-black leading-snug text-[#001a33]">Universo Cursos e Consultoria Ltda.</p>
            <p className="mt-1 text-[11px] font-bold text-slate-500">CNPJ **.***.***/0001-**</p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-700">
            <UserRound size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Aluno pagador</p>
            <p className="mt-1 break-words text-sm font-black leading-snug text-[#001a33]">{payer.nome || 'Aluno identificado no portal'}</p>
            <p className="mt-1 text-[11px] font-bold text-slate-500">{payer.documentMasked || maskBaneseDocument(payer.cpf_cnpj)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-[1.6rem] border border-amber-200 bg-[#fffaf0] p-4 shadow-sm">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-700">Descrição da cobrança</p>
        <p className="mt-2 text-sm font-black leading-relaxed text-[#001a33]">{record.descricao || 'Cobrança de curso'}</p>
        {String(record.tipo_lancamento || '').toUpperCase() !== 'DISCIPLINA' && record.cursoNome ? <p className="mt-1 text-xs font-semibold text-slate-500">{record.cursoNome}{record.turmaNome && record.turmaNome !== 'N/A' ? ` • ${record.turmaNome}` : ''}</p> : null}
      </section>

      <div className="grid grid-cols-2 gap-2">
        {summaryItems(record, pix).map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-center gap-2 text-slate-400">
              <Icon size={14} />
              <p className="truncate text-[9px] font-black uppercase tracking-[0.14em]">{label}</p>
            </div>
            <p className="mt-2 break-words text-sm font-black capitalize text-[#001a33]">{value}</p>
          </div>
        ))}
      </div>

      <BanesePaymentStatus status={status} />
    </div>
  );
};

export default BaneseChargeSummary;
