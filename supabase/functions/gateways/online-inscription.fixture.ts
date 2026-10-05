type Row = Record<string, any>;

export const createOnlineInscriptionAdmin = (initialRows: Row[] = [], options: {
  transactionExists?: boolean;
  beforeInsert?: (payload: Row, rows: Map<string, Row>) => void;
} = {}) => {
  const keyFor = (row: Row) => String(row.ead_checkout_attempt_id ? row.id : row.matricula_id);
  const rows = new Map<string, Row>(initialRows.map((row, index) => [keyFor(row), {
    updated_at: `2026-07-22T10:00:0${index}.000Z`, ...row,
  }]));
  const upserts: Row[] = [];
  const transactionLinks: Row[] = [];
  let writeSequence = 0;
  const admin = {
    from(table: string) {
      if (!['inscricoes_online', 'payment_gateway_transactions'].includes(table)) throw new Error(`Tabela inesperada: ${table}`);
      const filters: Row = {};
      let command = 'read';
      let payload: Row = {};
      const matching = () => [...rows.values()].filter(row => Object.entries(filters).every(([key, value]) =>
        value === null ? row[key] == null : row[key] === value));
      const execute = async () => {
        if (table === 'payment_gateway_transactions') {
          transactionLinks.push({ payload, filters: { ...filters } });
          return { data: options.transactionExists ? { id: 'transaction-1' } : null, error: null };
        }
        if (command === 'read') {
          const found = matching();
          return { data: found[0] || null, error: found.length > 1 ? { code: 'PGRST116' } : null };
        }
        let existing: Row | undefined;
        if (command === 'insert') {
          options.beforeInsert?.(payload, rows);
          const conflicts = [...rows.values()].some(row => row.id === payload.id ||
            (row.receivable_id && row.receivable_id === payload.receivable_id) ||
            (!row.ead_checkout_attempt_id && !payload.ead_checkout_attempt_id && row.matricula_id === payload.matricula_id));
          if (conflicts) return { data: null, error: { code: '23505' } };
        } else {
          existing = matching()[0];
          if (!existing) return { data: null, error: null };
        }
        writeSequence += 1;
        const next: Row = { id: existing?.id || `inscription-${rows.size + 1}`, ...existing, ...payload,
          updated_at: `2026-10-04T12:00:${String(writeSequence).padStart(2, '0')}.000Z` };
        // Contrato monotônico legado: retries não reabrem inscrições terminais.
        if (existing?.status === 'PAGO') next.status = 'PAGO';
        else if (existing?.status === 'CANCELADO' && !['PAGO', 'CANCELADO'].includes(payload.status)) next.status = 'CANCELADO';
        if (next.status === 'PAGO') {
          next.pago_em = existing?.pago_em || payload.pago_em;
          next.confirmado_em = existing?.confirmado_em || payload.confirmado_em;
          next.erro = null;
        }
        if (existing) rows.delete(keyFor(existing));
        rows.set(keyFor(next), next);
        upserts.push({ ...payload });
        return { data: { id: next.id, status: next.status }, error: null };
      };
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { filters[column] = value; return query; },
        is: (column: string, value: unknown) => { filters[column] = value; return query; },
        update: (value: Row) => { command = 'update'; payload = value; return query; },
        insert: (value: Row) => { command = 'insert'; payload = value; return query; },
        maybeSingle: execute,
        single: execute,
        then: (resolve: any, reject: any) => execute().then(resolve, reject),
      };
      return query;
    },
  };
  return { admin, rows, upserts, transactionLinks };
};
