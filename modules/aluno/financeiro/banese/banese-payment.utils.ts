import type {
  BaneseEnvironment,
  BanesePartner,
  BanesePaymentRecord,
  BanesePixPresentation,
  BaneseStatusPresentation,
} from './banese-payment.types';

const CANCELED_STATUSES = new Set(['CANCELADO', 'CANCELED', 'ESTORNADO', 'DEVOLVIDO', 'REFUNDED']);
const isCanceledBaneseTitle = (record: BanesePaymentRecord) => (
  CANCELED_STATUSES.has(String(record.status ?? '').toUpperCase())
  || CANCELED_STATUSES.has(String(record.gateway_status ?? '').toUpperCase())
  || String(record.gateway_status ?? '').toUpperCase() === 'CANCELED_BY_BANK'
);
const ALLOWED_LOCAL_PAYMENT_STATUSES = new Set(['PENDENTE', 'VENCIDO', 'AGUARDANDO_CONFIRMACAO']);
const ALLOWED_REMOTE_PAYMENT_STATUSES = new Set(['PENDING', 'OPEN', 'REGISTERED', 'CREATED', '2']);
const hasPayableBaneseStatus = (record: BanesePaymentRecord) => {
  const localStatus = String(record.status ?? '').toUpperCase();
  const remoteStatus = String(record.gateway_status ?? '').toUpperCase();
  return ALLOWED_LOCAL_PAYMENT_STATUSES.has(localStatus)
    && (!remoteStatus || ALLOWED_REMOTE_PAYMENT_STATUSES.has(remoteStatus));
};

export const onlyDigits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

export const formatBaneseCurrency = (value: unknown) => {
  const parsed = Number(value);
  return (Number.isFinite(parsed) ? parsed : 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

export const formatBaneseDate = (value: unknown) => {
  const [year, month, day] = String(value ?? '').slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : 'Não informado';
};

export const formatBaneseDigitableLine = (value: unknown) => {
  const digits = onlyDigits(value);
  if (digits.length !== 47) return digits;
  return [
    `${digits.slice(0, 5)}.${digits.slice(5, 10)}`,
    `${digits.slice(10, 15)}.${digits.slice(15, 21)}`,
    `${digits.slice(21, 26)}.${digits.slice(26, 32)}`,
    digits.slice(32, 33),
    digits.slice(33),
  ].join(' ');
};

export const maskBaneseDocument = (value: unknown) => {
  const protectedValue = String(value ?? '').trim();
  if (protectedValue.includes('*') && protectedValue.length <= 30) return protectedValue;
  const digits = onlyDigits(value);
  if (digits.length === 11) return `***.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `**.***.***/${digits.slice(8, 12)}-**`;
  return 'Documento protegido';
};

export const getBanesePayer = (record: BanesePaymentRecord): BanesePartner => {
  if (Array.isArray(record.parceiros)) return record.parceiros[0] ?? {};
  return record.parceiros ?? {};
};

export const normalizeBaneseEnvironment = (value: unknown): BaneseEnvironment =>
  String(value ?? '').toLowerCase() === 'production' ? 'production' : 'sandbox';

export const isBanesePayment = (record: BanesePaymentRecord | null | undefined) =>
  String(record?.gateway_provider ?? '').toLowerCase() === 'banese_card'
  && String(record?.gateway_payment_method ?? '').toUpperCase() === 'BOLETO';

export const hasRegisteredBaneseBoleto = (record: BanesePaymentRecord | null | undefined) =>
  isBanesePayment(record)
  && onlyDigits(record?.gateway_boleto_linha_digitavel).length === 47
  && onlyDigits(record?.gateway_boleto_codigo_barras).length === 44;

export const getBanesePaymentActionLabel = (record: BanesePaymentRecord) =>
  normalizeBaneseEnvironment(record.gateway_environment) === 'production'
    ? 'Abrir boleto + Pix'
    : 'Abrir boleto Banese';

const safeQrImageSource = (value: unknown) => {
  const candidate = String(value ?? '').trim();
  if (!candidate || candidate.length > 1_500_000) return null;
  const dataImage = candidate.match(/^data:image\/(png|jpeg);base64,([a-z0-9+/=\s]+)$/i);
  if (dataImage) {
    const compactPayload = dataImage[2].replace(/\s+/g, '');
    const validSignature = dataImage[1].toLowerCase() === 'png'
      ? compactPayload.startsWith('iVBORw0KGgo')
      : compactPayload.startsWith('/9j/');
    return validSignature ? `data:image/${dataImage[1].toLowerCase()};base64,${compactPayload}` : null;
  }
  const compact = candidate.replace(/\s+/g, '');
  if (compact.length < 64 || !/^[a-z0-9+/]+={0,2}$/i.test(compact)) return null;
  if (compact.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${compact}`;
  if (compact.startsWith('/9j/')) return `data:image/jpeg;base64,${compact}`;
  return null;
};

const pixCrc16 = (value: string) => {
  let result = 0xffff;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      result = (result & 0x8000) !== 0 ? ((result << 1) ^ 0x1021) & 0xffff : (result << 1) & 0xffff;
    }
  }
  return result.toString(16).toUpperCase().padStart(4, '0');
};

export const isValidBanesePixPayload = (value: unknown) => {
  const payload = String(value ?? '').trim();
  if (payload.length < 30 || payload.length > 600 || /\s/.test(payload)) return false;
  if (!/^00020[12]/.test(payload) || !payload.includes('BR.GOV.BCB.PIX')) return false;
  const match = payload.match(/6304([0-9A-F]{4})$/i);
  if (!match) return false;
  return pixCrc16(payload.slice(0, -4)) === match[1].toUpperCase();
};

export const getBanesePixPresentation = (record: BanesePaymentRecord): BanesePixPresentation => {
  const environment = normalizeBaneseEnvironment(record.gateway_environment);
  const payloadCandidate = String(record.gateway_pix_payload ?? '').trim();
  const payload = isValidBanesePixPayload(payloadCandidate) ? payloadCandidate : null;
  const imageSource = safeQrImageSource(record.gateway_pix_encoded_image);

  if (environment === 'sandbox') {
    return {
      state: 'sandbox-unavailable',
      payload: null,
      imageSource: null,
      title: 'Pix preparado para produção',
      message: 'O Banese informou que o Pix não opera na homologação. O boleto de teste continua disponível normalmente.',
    };
  }

  if (payload && imageSource) {
    return {
      state: 'available',
      payload,
      imageSource,
      title: 'Pix Banese disponível',
      message: 'Pague pelo QR Code ou use o Pix copia e cola no aplicativo do seu banco.',
    };
  }

  return {
    state: 'pending',
    payload: null,
    imageSource: null,
    title: 'Pix não disponível neste título',
    message: payload || imageSource
      ? 'O Banese devolveu somente parte do BolePix. Por segurança, use a linha digitável ou solicite a reemissão à secretaria.'
      : 'Este boleto foi registrado sem o BolePix oficial. Use a linha digitável ou solicite à secretaria o cancelamento e a reemissão; o sistema não fabrica um QR Code bancário.',
  };
};

const isMonthlyCharge = (record: BanesePaymentRecord) => {
  const type = String(record.tipo_lancamento ?? '').toUpperCase();
  const category = String(record.categoria ?? '').toUpperCase();
  const description = String(record.descricao ?? '').toLowerCase();
  if (type === 'MATRICULA' || type === 'REMATRICULA') return false;
  if (type) return type === 'PARCELA';
  return type === 'PARCELA'
    || category === 'MENSALIDADE'
    || description.includes('mensalidade')
    || description.includes('parcela');
};

const isUnitaryCharge = (record: BanesePaymentRecord) => {
  const type = String(record.tipo_lancamento ?? '').toUpperCase();
  const description = String(record.descricao ?? '').toLowerCase();
  return type === 'MATRICULA'
    || type === 'REMATRICULA'
    || description.includes('matrícula')
    || description.includes('matricula')
    || description.includes('rematrícula')
    || description.includes('rematricula');
};

const installmentSortValue = (record: BanesePaymentRecord) => {
  const number = Number(record.parcela_numero);
  return Number.isFinite(number) && number > 0 ? number : Number.MAX_SAFE_INTEGER;
};

export const getBaneseCarnetInstallments = (
  selected: BanesePaymentRecord,
  records: BanesePaymentRecord[],
) => {
  const selectedGroupKey = String(selected.gateway_group_marker ?? selected.matricula_id ?? '').trim();
  if (
    isUnitaryCharge(selected)
    || !isMonthlyCharge(selected)
    || !selectedGroupKey
    || isCanceledBaneseTitle(selected)
    || !hasPayableBaneseStatus(selected)
  ) return [selected];

  const grouped = records
    .filter((record) => (
      String(record.gateway_group_marker ?? record.matricula_id ?? '').trim() === selectedGroupKey
      && (!selected.cliente_id || !record.cliente_id || record.cliente_id === selected.cliente_id)
      && normalizeBaneseEnvironment(record.gateway_environment) === normalizeBaneseEnvironment(selected.gateway_environment)
      && !isUnitaryCharge(record)
      && isMonthlyCharge(record)
      && hasRegisteredBaneseBoleto(record)
      && !isCanceledBaneseTitle(record)
      && hasPayableBaneseStatus(record)
    ))
    .sort((left, right) => (
      installmentSortValue(left) - installmentSortValue(right)
      || String(left.data_vencimento ?? '').localeCompare(String(right.data_vencimento ?? ''))
      || left.id.localeCompare(right.id)
    ));

  if (grouped.length < 3) return [selected];
  const selectedPayerDocument = onlyDigits(getBanesePayer(selected).cpf_cnpj);
  const hasDifferentPayer = selectedPayerDocument && grouped.some((record) => {
    const payerDocument = onlyDigits(getBanesePayer(record).cpf_cnpj);
    return payerDocument && payerDocument !== selectedPayerDocument;
  });
  if (hasDifferentPayer) return [selected];

  const cameFromValidatedDto = Boolean(selected.gateway_group_marker);
  if (!cameFromValidatedDto) {
    const issuerKeys = grouped.map((record) => {
      const agreement = onlyDigits(record.gateway_boleto_convenio);
      const agency = onlyDigits(record.gateway_boleto_agencia).padStart(3, '0');
      const issuer = String(record.gateway_issuer_polo_id ?? '').trim();
      return agreement && agency !== '000' && issuer
        ? `${agreement}|${agency}|${issuer}`
        : null;
    });
    if (issuerKeys.some((key) => !key) || new Set(issuerKeys).size !== 1) return [selected];
  }

  const uniqueFields = [
    grouped.map((record) => onlyDigits(record.gateway_boleto_linha_digitavel)),
    grouped.map((record) => onlyDigits(record.gateway_boleto_codigo_barras)),
  ];
  if (!cameFromValidatedDto) {
    uniqueFields.push(grouped.map((record) => onlyDigits(record.gateway_boleto_nosso_numero)));
  }
  const hasMissingOrDuplicateBankTitle = uniqueFields.some((values) => (
    values.some((value) => !value)
    || new Set(values).size !== grouped.length
  ));
  return hasMissingOrDuplicateBankTitle ? [selected] : grouped;
};

export const getBaneseInstallmentLabel = (record: BanesePaymentRecord, index: number) => {
  const number = Number(record.parcela_numero);
  return Number.isFinite(number) && number > 0
    ? `Parcela ${String(number).padStart(2, '0')}`
    : `Parcela ${String(index + 1).padStart(2, '0')}`;
};

export const getBaneseStatusPresentation = (record: BanesePaymentRecord): BaneseStatusPresentation => {
  const localStatus = String(record.status ?? '').toUpperCase();
  const remoteStatus = String(record.gateway_status ?? '').toUpperCase();
  if (localStatus === 'DEVOLVIDO') {
    return { label: 'Devolvido', detail: 'O pagamento foi devolvido e esta cobrança está encerrada.', tone: 'neutral' };
  }
  if (
    ['CANCELADO', 'CANCELED', 'ESTORNADO', 'REFUNDED'].includes(localStatus)
    || ['CANCELED', 'CANCELED_BY_BANK', 'REFUNDED'].includes(remoteStatus)
  ) {
    return { label: 'Cancelado', detail: 'Esta cobrança não aceita mais pagamento.', tone: 'neutral' };
  }
  if (['SUSPENSO', 'SUSPENDED'].includes(localStatus) || remoteStatus === 'SUSPENDED') {
    return { label: 'Suspenso', detail: 'Esta cobrança está temporariamente indisponível para pagamento.', tone: 'neutral' };
  }
  if (
    ['PAGO', 'PAID', 'RECEIVED', 'CONFIRMED'].includes(localStatus)
    || ['PAID', 'RECEIVED', 'CONFIRMED'].includes(remoteStatus)
  ) {
    return { label: 'Pago', detail: 'Pagamento confirmado no sistema.', tone: 'success' };
  }
  if (['REJECTED', 'REJECTED_TIMEOUT', 'PROTESTED', 'UNKNOWN'].includes(remoteStatus)) {
    return { label: 'Indisponível', detail: 'O título precisa de revisão pelo setor financeiro.', tone: 'danger' };
  }
  if (remoteStatus === 'EXPIRED') {
    return { label: 'Expirado', detail: 'O título bancário expirou e precisa ser atualizado.', tone: 'danger' };
  }
  if (['REGISTERING', 'PROCESSING'].includes(remoteStatus)) {
    return { label: 'Registrando', detail: 'O Banese está finalizando o registro do título.', tone: 'neutral' };
  }
  if (localStatus === 'VENCIDO' || record.isOverdue) {
    return { label: 'Vencido', detail: 'O boleto segue disponível enquanto o Banese mantiver o título aberto.', tone: 'danger' };
  }
  return { label: 'Pendente', detail: 'Aguardando confirmação bancária.', tone: 'warning' };
};

export const canPayBaneseRecord = (record: BanesePaymentRecord) => {
  if (!hasRegisteredBaneseBoleto(record)) return false;
  return hasPayableBaneseStatus(record);
};
