import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../../../../lib/supabase';
import type { BaneseFinancialTerms, BanesePaymentRecord } from '../banese-payment.types';

interface UseBanesePaymentDetailsOptions {
  alunoId: string;
  paymentId: string | null;
  summary: BanesePaymentRecord | null;
}

type StudentChargeDto = {
  id: string;
  groupMarker: string;
  description: string;
  category: string | null;
  chargeType: string | null;
  installmentNumber: number | null;
  amount: number;
  amountPaid: number | null;
  dueDate: string | null;
  paymentDate: string | null;
  status: string;
  bankStatus: string;
  environment: 'sandbox' | 'production';
  courseName: string | null;
  courseModality: string | null;
  className: string | null;
  boleto: { digitableLine: string; barcode: string };
  financialTerms: BaneseFinancialTerms;
  pix: {
    state: 'available' | 'sandbox-unavailable' | 'pending';
    copyAndPaste: string | null;
    qrCodeImage: string | null;
  };
};

type StudentPaymentDto = {
  payment: StudentChargeDto;
  installments: StudentChargeDto[];
  group: { marker: string; kind: 'single' | 'carnet'; installmentCount: number };
  payer: { name: string; documentMasked: string };
};

const functionErrorMessage = async (error: unknown) => {
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  const body = context?.json ? await context.json().catch(() => null) : null;
  return body?.error || (error instanceof Error ? error.message : 'Não foi possível carregar a cobrança Banese.');
};

const assertPaymentDto = (value: unknown): StudentPaymentDto => {
  const candidate = value as Partial<StudentPaymentDto> | null;
  if (
    !candidate?.payment?.id
    || !Array.isArray(candidate.installments)
    || !candidate.group?.marker
    || !candidate.payer?.name
  ) {
    throw new Error('O servidor retornou uma cobrança Banese incompleta.');
  }
  return candidate as StudentPaymentDto;
};

const mapCharge = (
  charge: StudentChargeDto,
  dto: StudentPaymentDto,
): BanesePaymentRecord => ({
  id: charge.id,
  descricao: charge.description,
  categoria: charge.category,
  tipo_lancamento: charge.chargeType,
  parcela_numero: charge.installmentNumber,
  valor: charge.amount,
  valor_pago: charge.amountPaid,
  data_vencimento: charge.dueDate,
  data_pagamento: charge.paymentDate,
  status: charge.status,
  gateway_provider: 'banese_card',
  gateway_environment: charge.environment,
  gateway_payment_method: 'BOLETO',
  gateway_status: charge.bankStatus,
  gateway_pix_payload: charge.pix.copyAndPaste,
  gateway_pix_encoded_image: charge.pix.qrCodeImage,
  gateway_boleto_linha_digitavel: charge.boleto.digitableLine,
  gateway_boleto_codigo_barras: charge.boleto.barcode,
  gateway_financial_terms: charge.financialTerms,
  gateway_group_marker: dto.group.marker,
  gateway_group_kind: dto.group.kind,
  cursoNome: charge.courseName,
  modalidade: charge.courseModality,
  turmaNome: charge.className,
  parceiros: {
    nome: dto.payer.name,
    documentMasked: dto.payer.documentMasked,
  },
});

const useBanesePaymentDetails = ({
  alunoId,
  paymentId,
  summary,
}: UseBanesePaymentDetailsOptions) => useQuery<BanesePaymentRecord[]>({
  queryKey: ['aluno-banese-payment', alunoId, paymentId],
  enabled: Boolean(alunoId && paymentId && summary),
  queryFn: async () => {
    if (!paymentId || !summary) return [];
    const { data, error } = await supabase.functions.invoke('banese-student-payment', {
      body: { action: 'get', receivableId: paymentId },
    });
    if (error) throw new Error(await functionErrorMessage(error));
    if (data?.error) throw new Error(String(data.error));
    const dto = assertPaymentDto(data?.data);
    return dto.installments.map((charge) => mapCharge(charge, dto));
  },
  staleTime: 15_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
});

export default useBanesePaymentDetails;
