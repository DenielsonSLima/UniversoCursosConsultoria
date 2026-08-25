import { getAlunoFinancialModalityAccent } from './financeiro.presentation.ts';
import type {
  AlunoFinancialItem,
  AlunoFinancialListPayload,
  AlunoFinancialReceiptPayload,
  AlunoFinancialStatus,
  AlunoFinancialSummary,
} from './financeiro.types.ts';

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} não retornou um objeto válido.`);
  }
  return value as JsonRecord;
};

const asArray = (value: unknown, label: string) => {
  if (!Array.isArray(value)) throw new Error(`${label} não retornou uma lista válida.`);
  return value;
};

const asString = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} não retornou um texto válido.`);
  }
  return value;
};

const asText = (value: unknown, label: string) => {
  if (typeof value !== 'string') {
    throw new Error(`${label} não retornou um texto válido.`);
  }
  return value;
};

const asOptionalString = (value: unknown, label: string) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${label} não retornou um texto válido.`);
  return value;
};

const asNumber = (value: unknown, label: string) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} não retornou um número válido.`);
  return parsed;
};

const asOptionalNumber = (value: unknown, label: string) => (
  value === null || value === undefined || value === '' ? null : asNumber(value, label)
);

const asBoolean = (value: unknown, label: string) => {
  if (typeof value !== 'boolean') throw new Error(`${label} não retornou um booleano válido.`);
  return value;
};

const parseFinancialSummary = (value: unknown): AlunoFinancialSummary => {
  const summary = asRecord(value, 'O resumo do lançamento');
  return {
    baseValue: asNumber(summary.baseValue, 'O valor-base'),
    paidValue: asNumber(summary.paidValue, 'O valor efetivamente pago'),
    punctualDiscount: asNumber(summary.punctualDiscount, 'O desconto de pontualidade'),
    totalUntilDue: asNumber(summary.totalUntilDue, 'O total até o vencimento'),
    interestPercent: asNumber(summary.interestPercent, 'O percentual de juros'),
    interestValue: asNumber(summary.interestValue, 'O valor de juros'),
    lateFeeValue: asNumber(summary.lateFeeValue, 'O valor da multa'),
    totalWithLate: asNumber(summary.totalWithLate, 'O total em atraso'),
    highlightValue: asNumber(summary.highlightValue, 'O valor de destaque'),
    highlightLabel: asString(summary.highlightLabel, 'O rótulo do valor'),
    hasDiscount: asBoolean(summary.hasDiscount, 'A incidência de desconto'),
    hasLateCharge: asBoolean(summary.hasLateCharge, 'A incidência de encargos'),
    canLateCharge: asBoolean(summary.canLateCharge, 'A permissão de encargos'),
  };
};

const parsePartner = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const partner = asRecord(value, 'O pagador do lançamento');
  return {
    nome: asOptionalString(partner.nome, 'O nome do pagador'),
    cpf_cnpj: asOptionalString(partner.cpf_cnpj, 'O documento do pagador'),
    documentMasked: asOptionalString(partner.documentMasked, 'O documento mascarado'),
  };
};

export const parseAlunoFinancialItem = (value: unknown): AlunoFinancialItem => {
  const row = asRecord(value, 'O lançamento financeiro');
  const summary = parseFinancialSummary(row.financial_summary);
  const modality = asString(row.modalidade, 'A modalidade do lançamento');
  const turma = row.turmas === null || row.turmas === undefined
    ? null
    : asRecord(row.turmas, 'A turma do lançamento');

  return {
    id: asString(row.id, 'O identificador do lançamento'),
    cliente_id: asOptionalString(row.cliente_id, 'O aluno do lançamento'),
    matricula_id: asOptionalString(row.matricula_id, 'A matrícula do lançamento'),
    turma_id: asOptionalString(row.turma_id, 'A turma do lançamento'),
    polo_id: asOptionalString(row.polo_id, 'O polo do lançamento'),
    descricao: asString(row.descricao, 'A descrição do lançamento'),
    categoria: asString(row.categoria, 'A categoria do lançamento'),
    tipo_lancamento: asOptionalString(row.tipo_lancamento, 'O tipo do lançamento'),
    parcela_numero: asOptionalNumber(row.parcela_numero, 'A parcela do lançamento'),
    valor: asNumber(row.valor, 'O valor do lançamento'),
    valor_pago: asNumber(row.valor_pago, 'O valor efetivamente pago'),
    valueOutstanding: asNumber(row.valueOutstanding, 'O saldo em aberto'),
    data_vencimento: asOptionalString(row.data_vencimento, 'O vencimento'),
    data_pagamento: asOptionalString(row.data_pagamento, 'A data do pagamento'),
    status: asString(row.status, 'O status do lançamento'),
    statusCode: asString(row.statusCode, 'O status canônico'),
    statusLabel: asString(row.statusLabel, 'O rótulo do status'),
    isOverdue: asBoolean(row.isOverdue, 'A indicação de atraso'),
    receiptEligible: asBoolean(row.receiptEligible, 'A elegibilidade do recibo'),
    forma_pagamento: asOptionalString(row.forma_pagamento, 'A forma de pagamento'),
    origem_pagamento: asOptionalString(row.origem_pagamento, 'A origem do pagamento'),
    modalidade: modality,
    cursoId: asOptionalString(row.cursoId, 'O curso do lançamento'),
    cursoNome: asText(row.cursoNome, 'O nome do curso'),
    turmaNome: asText(row.turmaNome, 'O nome da turma'),
    chargeKind: asString(row.chargeKind, 'O tipo da cobrança'),
    isIsolatedDependency: asBoolean(row.isIsolatedDependency, 'A cobrança de disciplina'),
    asaas_invoice_url: asOptionalString(row.asaas_invoice_url, 'A fatura Asaas'),
    asaas_status: asOptionalString(row.asaas_status, 'O status Asaas'),
    asaas_transaction_receipt_url: asOptionalString(
      row.asaas_transaction_receipt_url,
      'O comprovante Asaas',
    ),
    gateway_provider: asOptionalString(row.gateway_provider, 'O gateway'),
    gateway_environment: asOptionalString(row.gateway_environment, 'O ambiente do gateway'),
    gateway_payment_method: asOptionalString(row.gateway_payment_method, 'O método do gateway'),
    gateway_payment_id: asOptionalString(row.gateway_payment_id, 'O pagamento do gateway'),
    gateway_status: asOptionalString(row.gateway_status, 'O status do gateway'),
    gateway_bank_slip_url: asOptionalString(row.gateway_bank_slip_url, 'O boleto do gateway'),
    gateway_invoice_url: asOptionalString(row.gateway_invoice_url, 'A fatura do gateway'),
    gateway_boleto_linha_digitavel: asOptionalString(
      row.gateway_boleto_linha_digitavel,
      'A linha digitável',
    ),
    gateway_boleto_codigo_barras: asOptionalString(
      row.gateway_boleto_codigo_barras,
      'O código de barras',
    ),
    gateway_boleto_nosso_numero: asOptionalString(
      row.gateway_boleto_nosso_numero,
      'O nosso número',
    ),
    turmas: turma,
    parceiros: parsePartner(row.parceiros),
    financialSummary: summary,
    financial_summary: summary,
    modalityAccent: getAlunoFinancialModalityAccent(modality),
  };
};

const parseCounts = (value: unknown): Record<AlunoFinancialStatus, number> => {
  const counts = asRecord(value, 'As contagens financeiras');
  return {
    ABERTO: asNumber(counts.ABERTO, 'A contagem em aberto'),
    ATRASADO: asNumber(counts.ATRASADO, 'A contagem em atraso'),
    PAGO: asNumber(counts.PAGO, 'A contagem paga'),
    TODOS: asNumber(counts.TODOS, 'A contagem total'),
  };
};

export const parseAlunoFinancialListPayload = (
  value: unknown,
): AlunoFinancialListPayload => {
  const payload = asRecord(value, 'O Financeiro do Aluno');
  const summary = asRecord(payload.summary, 'O resumo financeiro');
  const filters = asRecord(payload.filters, 'Os filtros financeiros');
  const pagination = asRecord(payload.pagination, 'A paginação financeira');
  return {
    items: asArray(payload.items, 'Os lançamentos').map(parseAlunoFinancialItem),
    summary: {
      totalPaid: asNumber(summary.totalPaid, 'O total pago'),
      totalPending: asNumber(summary.totalPending, 'O total pendente'),
      recordCount: asNumber(summary.recordCount, 'O total de registros'),
      openByModality: asArray(
        summary.openByModality,
        'O resumo por modalidade',
      ).map((valueByModality) => {
        const item = asRecord(valueByModality, 'Um resumo de modalidade');
        return {
          modality: asString(item.modality, 'A modalidade do resumo'),
          count: asNumber(item.count, 'A contagem da modalidade'),
          total: asNumber(item.total, 'O total da modalidade'),
        };
      }),
    },
    filters: { counts: parseCounts(filters.counts) },
    pagination: {
      currentPage: asNumber(pagination.currentPage, 'A página atual'),
      pageSize: asNumber(pagination.pageSize, 'O tamanho da página'),
      totalItems: asNumber(pagination.totalItems, 'O total filtrado'),
      totalPages: asNumber(pagination.totalPages, 'O total de páginas'),
    },
  };
};

export const parseAlunoFinancialReceiptPayload = (
  value: unknown,
): AlunoFinancialReceiptPayload => {
  const payload = asRecord(value, 'O recibo do aluno');
  const model = asRecord(payload.model, 'O modelo do recibo');
  const receipt = asRecord(payload.receipt, 'O conteúdo do recibo');
  const institution = asRecord(payload.institution, 'O cabeçalho institucional');
  const watermark = asRecord(payload.watermark, 'A marca d água');
  if (model.key !== 'recibo' || model.source !== 'MODELO_RECIBO_PADRAO'
      || model.orientation !== 'portrait'
      || model.documentKind !== 'RECIBO_PAGAMENTO_ALUNO') {
    throw new Error('O backend retornou um modelo incompatível para o recibo do aluno.');
  }
  if (receipt.statusCode !== 'PAGO') {
    throw new Error('O backend não confirmou a baixa necessária para emitir o recibo.');
  }
  if (!['CONFIGURACAO_POLO', 'FALLBACK_MODELO_RECIBO'].includes(String(watermark.source))) {
    throw new Error('O backend não informou a origem da marca d água.');
  }
  return {
    model: {
      key: 'recibo',
      source: 'MODELO_RECIBO_PADRAO',
      revision: asNumber(model.revision, 'A revisão do modelo'),
      orientation: 'portrait',
      documentKind: 'RECIBO_PAGAMENTO_ALUNO',
    },
    receipt: {
      id: asString(receipt.id, 'O identificador do recibo'),
      receiptNumber: asString(receipt.receiptNumber, 'O número do recibo'),
      title: asString(receipt.title, 'O título do recibo'),
      statusCode: 'PAGO',
      statusLabel: asString(receipt.statusLabel, 'O status do recibo'),
      description: asString(receipt.description, 'A descrição do recibo'),
      category: asString(receipt.category, 'A categoria do recibo'),
      payerName: asString(receipt.payerName, 'O pagador do recibo'),
      payerDocument: asOptionalString(receipt.payerDocument, 'O documento do pagador'),
      courseLabel: asString(receipt.courseLabel, 'O curso do recibo'),
      valueExpected: asNumber(receipt.valueExpected, 'O valor previsto'),
      valuePaid: asNumber(receipt.valuePaid, 'O valor efetivamente pago'),
      valueOutstanding: asNumber(receipt.valueOutstanding, 'O saldo do recibo'),
      dueDate: asOptionalString(receipt.dueDate, 'O vencimento do recibo'),
      dueDateLabel: asString(receipt.dueDateLabel, 'O vencimento formatado'),
      paidAt: asOptionalString(receipt.paidAt, 'A data de pagamento'),
      paidAtLabel: asString(receipt.paidAtLabel, 'O pagamento formatado'),
      paymentMethod: asString(receipt.paymentMethod, 'A forma de pagamento'),
      poloName: asString(receipt.poloName, 'O polo do recibo'),
      poloLocation: asString(receipt.poloLocation, 'A localização do recibo'),
      declaration: asString(receipt.declaration, 'A declaração do recibo'),
      footerNote: asString(receipt.footerNote, 'O rodapé do recibo'),
      emittedAt: asString(receipt.emittedAt, 'A emissão do recibo'),
      emittedAtLabel: asString(receipt.emittedAtLabel, 'A emissão formatada'),
    },
    institution: {
      id: asString(institution.id, 'A instituição do recibo'),
      name: asString(institution.name, 'O nome institucional'),
      cnpj: asOptionalString(institution.cnpj, 'O CNPJ institucional'),
      address: asOptionalString(institution.address, 'O endereço institucional'),
      number: asOptionalString(institution.number, 'O número institucional'),
      complement: asOptionalString(institution.complement, 'O complemento institucional'),
      neighborhood: asOptionalString(institution.neighborhood, 'O bairro institucional'),
      city: asOptionalString(institution.city, 'A cidade institucional'),
      state: asOptionalString(institution.state, 'O estado institucional'),
      postalCode: asOptionalString(institution.postalCode, 'O CEP institucional'),
      phone: asOptionalString(institution.phone, 'O telefone institucional'),
      email: asOptionalString(institution.email, 'O e-mail institucional'),
      isHeadquarters: asBoolean(institution.isHeadquarters, 'A identificação da Matriz'),
      unitName: asString(institution.unitName, 'O nome da unidade'),
      logoUrl: asOptionalString(institution.logoUrl, 'A logo institucional'),
    },
    watermark: {
      enabled: asBoolean(watermark.enabled, 'A ativação da marca d água'),
      label: asString(watermark.label, 'O rótulo da marca d água'),
      imageUrl: asOptionalString(watermark.imageUrl, 'A imagem da marca d água'),
      opacity: asNumber(watermark.opacity, 'A opacidade da marca d água'),
      scale: asNumber(watermark.scale, 'A escala da marca d água'),
      rotate: asBoolean(watermark.rotate, 'A rotação da marca d água'),
      source: watermark.source as AlunoFinancialReceiptPayload['watermark']['source'],
    },
  };
};
