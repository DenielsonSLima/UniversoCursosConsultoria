export const id = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const fixture = () => {
  const installments = Array.from({ length: 12 }, (_, i) => {
    const dueDate = i < 3 ? `2026-${10 + i}-15` : `2027-${String(i - 2).padStart(2, '0')}-15`;
    return { id: id(i + 10), key: `ciclo-1-parc-${i + 1}`, value: '279.90', dueDate,
      financialTerms: { nominalAmount: 279.9, dueDate,
        discount: { type: 'fixed', value: 19.9, validUntil: dueDate },
        penalty: { type: 'percentage', value: 2, startsOn: dueDate.slice(0, 8) + '16' },
        interest: { type: 'monthly-percentage', value: 1, startsOn: dueDate.slice(0, 8) + '16' } } };
  });
  return { operationId: id(1), matriculaId: id(2), fingerprint: 'a'.repeat(64), status: 'READY',
    firstDueDate: '2026-10-15', installmentCount: 12, activeTotal: '3358.80',
    historicalCycle2Count: 13, localFeeDisposition: 'WAIVED', installments,
    consent: { consented: true, requestId: id(3) },
    authorizationRequestIds: Object.fromEntries(installments.map((r, i) => [r.id, id(40 + i)])),
    cycleContext: { requestId: id(4), matriculaId: id(2), turmaId: id(5), poloId: id(6), replayed: true,
      ciclo: { numero: 1, status: 'PREPARADO', total: '3358.80', quantidadeItens: 12, quantidadeBancaria: 12,
        quantidadeLocal: 0, emitidosBanese: 0, pendentesEmissao: 12, emRevisao: 0,
        recebiveis: installments.map((r, i) => ({ id: r.id, chave: r.key, tipo: 'PARCELA', numero: i + 1,
          descricao: `Mensalidade ${i + 1}`, valor: r.value, vencimento: r.dueDate,
          status: 'PENDENTE', emissaoBanese: 'PENDENTE', destinoCobranca: 'BANESE' })) }, cicloManual: null } };
};
