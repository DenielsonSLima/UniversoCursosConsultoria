import { supabase } from '../../../lib/supabase';
import type {
  ProfessorFinancialFilters,
  ProfessorFinancialListPayload,
  ProfessorFinancialPayment,
  ProfessorFinancialReceiptPayload,
  ProfessorFinancialReceiptRequest,
  ProfessorFinancialStatus,
} from './financeiro.types';

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

const asBoolean = (value: unknown, label: string) => {
  if (typeof value !== 'boolean') throw new Error(`${label} não retornou um booleano válido.`);
  return value;
};

const parsePayment = (value: unknown): ProfessorFinancialPayment => {
  const row = asRecord(value, 'O lançamento financeiro');
  const polo = asRecord(row.polo, 'O polo do lançamento');
  return {
    id: asString(row.id, 'O lançamento financeiro'),
    description: asString(row.description, 'A descrição do lançamento'),
    category: asString(row.category, 'A categoria do lançamento'),
    valueExpected: asNumber(row.valueExpected, 'O valor previsto'),
    valuePaid: asNumber(row.valuePaid, 'O valor efetivamente pago'),
    valueOutstanding: asNumber(row.valueOutstanding, 'O valor em aberto'),
    dueDate: asOptionalString(row.dueDate, 'A data de vencimento'),
    paymentDate: asOptionalString(row.paymentDate, 'A data de pagamento'),
    paymentMethod: asOptionalString(row.paymentMethod, 'A forma de pagamento'),
    statusCode: asString(row.statusCode, 'O status canônico'),
    statusLabel: asString(row.statusLabel, 'O rótulo do status'),
    receiptEligible: asBoolean(row.receiptEligible, 'A elegibilidade do recibo'),
    polo: {
      id: asString(polo.id, 'O polo do lançamento'),
      name: asString(polo.name, 'O nome do polo'),
      city: asOptionalString(polo.city, 'A cidade do polo'),
      state: asOptionalString(polo.state, 'O estado do polo'),
    },
  };
};

const parseCountMap = (value: unknown): Record<ProfessorFinancialStatus, number> => {
  const counts = asRecord(value, 'As contagens dos filtros');
  return {
    ABERTO: asNumber(counts.ABERTO, 'A contagem em aberto'),
    ATRASADO: asNumber(counts.ATRASADO, 'A contagem em atraso'),
    PAGO: asNumber(counts.PAGO, 'A contagem paga'),
    TODOS: asNumber(counts.TODOS, 'A contagem total'),
  };
};

const parseListPayload = (value: unknown): ProfessorFinancialListPayload => {
  const payload = asRecord(value, 'O Financeiro Docente');
  const summary = asRecord(payload.summary, 'O resumo financeiro');
  const filters = asRecord(payload.filters, 'Os filtros financeiros');
  const pagination = asRecord(payload.pagination, 'A paginação financeira');
  return {
    items: asArray(payload.items, 'O Financeiro Docente').map(parsePayment),
    summary: {
      totalReceived: asNumber(summary.totalReceived, 'O total recebido'),
      totalIncoming: asNumber(summary.totalIncoming, 'O total a receber'),
      recordCount: asNumber(summary.recordCount, 'O total de lançamentos'),
    },
    filters: {
      categories: asArray(filters.categories, 'As categorias').map((item) => (
        asString(item, 'Uma categoria financeira')
      )),
      counts: parseCountMap(filters.counts),
    },
    pagination: {
      currentPage: asNumber(pagination.currentPage, 'A página atual'),
      pageSize: asNumber(pagination.pageSize, 'O tamanho da página'),
      totalItems: asNumber(pagination.totalItems, 'O total filtrado'),
      totalPages: asNumber(pagination.totalPages, 'O total de páginas'),
    },
  };
};

const parseReceiptPayload = (value: unknown): ProfessorFinancialReceiptPayload => {
  const payload = asRecord(value, 'O recibo de honorários');
  const model = asRecord(payload.model, 'O modelo do recibo');
  const receipt = asRecord(payload.receipt, 'O conteúdo do recibo');
  const institution = asRecord(payload.institution, 'O cabeçalho institucional');
  const watermark = asRecord(payload.watermark, 'A marca d água do recibo');

  if (model.key !== 'recibo' || model.source !== 'MODELO_RECIBO_PADRAO'
      || model.orientation !== 'portrait'
      || model.documentKind !== 'RECIBO_HONORARIOS_PROFESSOR') {
    throw new Error('O backend retornou um modelo incompatível para o recibo de honorários.');
  }
  if (receipt.statusCode !== 'PAGO') {
    throw new Error('O backend não confirmou a baixa necessária para emitir o recibo.');
  }
  if (!['CONFIGURACAO_POLO', 'FALLBACK_MODELO_RECIBO'].includes(String(watermark.source))) {
    throw new Error('O backend não informou a origem da marca d água do recibo.');
  }

  return {
    model: {
      key: 'recibo',
      source: 'MODELO_RECIBO_PADRAO',
      revision: asNumber(model.revision, 'A revisão do modelo'),
      orientation: 'portrait',
      documentKind: 'RECIBO_HONORARIOS_PROFESSOR',
    },
    receipt: {
      id: asString(receipt.id, 'O identificador do recibo'),
      receiptNumber: asString(receipt.receiptNumber, 'O número do recibo'),
      title: asString(receipt.title, 'O título do recibo'),
      statusCode: 'PAGO',
      statusLabel: asString(receipt.statusLabel, 'O status do recibo'),
      description: asString(receipt.description, 'A descrição do recibo'),
      category: asString(receipt.category, 'A categoria do recibo'),
      beneficiaryName: asString(receipt.beneficiaryName, 'O beneficiário do recibo'),
      valueExpected: asNumber(receipt.valueExpected, 'O valor previsto do recibo'),
      valuePaid: asNumber(receipt.valuePaid, 'O valor pago do recibo'),
      valueOutstanding: asNumber(receipt.valueOutstanding, 'O saldo do recibo'),
      dueDate: asOptionalString(receipt.dueDate, 'O vencimento do recibo'),
      dueDateLabel: asString(receipt.dueDateLabel, 'O vencimento formatado'),
      paidAt: asOptionalString(receipt.paidAt, 'A data de pagamento do recibo'),
      paidAtLabel: asString(receipt.paidAtLabel, 'O pagamento formatado'),
      paymentMethod: asString(receipt.paymentMethod, 'A forma de pagamento do recibo'),
      poloName: asString(receipt.poloName, 'O polo do recibo'),
      poloLocation: asString(receipt.poloLocation, 'A localização do recibo'),
      declaration: asString(receipt.declaration, 'A declaração do recibo'),
      footerNote: asString(receipt.footerNote, 'A observação do recibo'),
      emittedAt: asString(receipt.emittedAt, 'A emissão do recibo'),
      emittedAtLabel: asString(receipt.emittedAtLabel, 'A emissão formatada'),
    },
    institution: {
      id: asString(institution.id, 'A instituição do recibo'),
      name: asString(institution.name, 'O nome da instituição'),
      cnpj: asOptionalString(institution.cnpj, 'O CNPJ institucional'),
      address: asOptionalString(institution.address, 'O endereço institucional'),
      number: asOptionalString(institution.number, 'O número institucional'),
      complement: asOptionalString(institution.complement, 'O complemento institucional'),
      neighborhood: asOptionalString(institution.neighborhood, 'O bairro institucional'),
      city: asOptionalString(institution.city, 'A cidade institucional'),
      state: asOptionalString(institution.state, 'O estado institucional'),
      postalCode: asOptionalString(institution.postalCode, 'O CEP institucional'),
      phone: asOptionalString(institution.phone, 'O contato institucional'),
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
      source: watermark.source as ProfessorFinancialReceiptPayload['watermark']['source'],
    },
  };
};

export const professorFinanceiroService = {
  async list(
    professorId: string,
    poloId: string,
    filters: ProfessorFinancialFilters,
    signal?: AbortSignal,
  ) {
    let request = supabase.rpc('portal_professor_financeiro_listar', {
      p_professor_id: professorId,
      p_polo_id: poloId,
      p_busca: filters.search || null,
      p_data_inicial: filters.startDate || null,
      p_data_final: filters.endDate || null,
      p_categoria: filters.category === 'TODOS' ? null : filters.category,
      p_status: filters.status,
      p_pagina: filters.page,
      p_tamanho_pagina: filters.pageSize,
    });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    return parseListPayload(data);
  },

  async getReceipt(requestData: ProfessorFinancialReceiptRequest, signal?: AbortSignal) {
    let request = supabase.rpc('portal_professor_financeiro_preparar_recibo', {
      p_professor_id: requestData.professorId,
      p_polo_id: requestData.poloId,
      p_lancamento_id: requestData.paymentId,
    });
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw new Error(error.message);
    return parseReceiptPayload(data);
  },
};
