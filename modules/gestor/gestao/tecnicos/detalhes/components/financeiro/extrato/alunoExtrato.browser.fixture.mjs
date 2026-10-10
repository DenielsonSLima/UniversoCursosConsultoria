export const enrollmentId = '10000000-0000-4000-8000-000000000001';
export const classId = '20000000-0000-4000-8000-000000000001';

export function issuedReceivable(overrides = {}) {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    descricao: 'Parcela sintética 1/12',
    valor: 300,
    status: 'PENDENTE',
    data_vencimento: '2026-11-15',
    forma_pagamento: 'BOLETO',
    gateway_provider: 'banese_card',
    gateway_payment_method: 'BOLETO',
    gateway_payment_id: 'synthetic-bank-id',
    gateway_status: 'PENDING',
    gateway_boleto_issued_at: '2026-10-09T12:00:00Z',
    boleto_nosso_numero: 'synthetic-reference',
    boleto_desconto_configurado: 20,
    boleto_desconto_valido_ate: '2026-11-15',
    boleto_desconto_situacao: 'VIGENTE',
    emissao_gerenciada_turma: true,
    emissao_ciclo_status: 'EMITIDO',
    destino_cobranca: 'BANESE',
    operation_capabilities: {
      sourceSystem: 'BANESE', provenanceKind: 'NATIVE_ISSUED',
      canSettle: true, canCancel: true, canEmit: false,
      canOpenExisting: true, canReconcile: false, readOnlyReason: null,
    },
    ...overrides,
  };
}

export function createFixture(recebiveis = [issuedReceivable()], overrides = {}) {
  return {
    matriculaId: enrollmentId,
    turmaId: classId,
    poloId: '40000000-0000-4000-8000-000000000001',
    alunoNome: 'ESTUDANTE DE TESTE',
    turmaNome: 'TURMA SINTÉTICA',
    cursoNome: 'Curso de teste',
    poloNome: 'Unidade de teste',
    statusMatricula: 'ATIVO',
    total: 300, recebido: 0, pendente: 300, vencido: 0, pagos: 0, pendentes: 1,
    recebiveis,
    ...overrides,
  };
}

export const supabaseStub = `
export const supabase = {
  async rpc(name, args) {
    window.calls.push({ kind: 'rpc', name, args });
    if (name !== 'get_aluno_extrato_financeiro') throw new Error('Unexpected RPC: ' + name);
    return window.fixture.readError
      ? { data: null, error: new Error('Leitura não autorizada.') }
      : { data: structuredClone(window.fixture), error: null };
  },
  functions: { async invoke(name, args) {
    window.calls.push({ kind: 'function', name, args });
    if (name !== 'banese-boleto-document') throw new Error('Unexpected operation: ' + name);
    if (window.fixture.documentError) return { data: null, error: new Error('Sem permissão para consultar o boleto.') };
    return { data: new Blob(['%PDF-1.4\\n%%EOF'], { type: 'application/pdf' }), error: null };
  } },
  channel(name) {
    const channel = {
      name, handlers: [],
      on(type, filter, callback) { this.handlers.push({ type, filter, callback }); return this; },
      subscribe(callback) { this.onStatus = callback; window.channels.push(this); callback('SUBSCRIBED'); return this; },
    };
    return channel;
  },
  removeChannel(channel) { window.channels = window.channels.filter(item => item !== channel); },
};
`;
