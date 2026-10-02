import { object, ProescError } from './contract.ts';
import { parseV2Envelope, readV2Json, v2Document, v2Identifier, type V2Credentials } from './v2-invoices.ts';

export type ProescV2Person = {
  personId: string;
  /** Process-only: hash, then remove before persistence or logging. */
  studentDocument: string | null;
  enrollments: { sourceEnrollmentId: string; sourceClassId: string }[];
};
export type V2PeopleQuery = { unitId: string; page: number; limit?: number; personId?: string };

export function parseProescV2PeoplePage(payload: unknown, query: V2PeopleQuery) {
  const envelope = parseV2Envelope(payload, query.page);
  const records = envelope.rows.map((value): ProescV2Person => {
    const row = object(value);
    const personId = v2Identifier(row.id);
    if (query.personId && query.personId !== personId) throw new ProescError('Pessoa V2 diferente do filtro.', 502);
    if (!Array.isArray(row.enrollments) || row.enrollments.length > 100) {
      throw new ProescError('Matrículas Proesc V2 ausentes ou inválidas.', 502);
    }
    const enrollments = row.enrollments.map((value) => {
      const enrollment = object(value);
      return { sourceEnrollmentId: v2Identifier(enrollment.id), sourceClassId: v2Identifier(object(enrollment.class).id) };
    });
    if (new Set(enrollments.map((item) => item.sourceEnrollmentId)).size !== enrollments.length) {
      throw new ProescError('Matrícula repetida no cadastro Proesc V2.', 502);
    }
    return { personId, studentDocument: v2Document(row.cpf_number), enrollments };
  });
  if (new Set(records.map((person) => person.personId)).size !== records.length) {
    throw new ProescError('Pessoa repetida na página Proesc V2.', 502);
  }
  return { records, total: envelope.total, currentPage: envelope.currentPage, lastPage: envelope.lastPage };
}

export async function readProescV2PeoplePage(options: V2Credentials & V2PeopleQuery) {
  if (!Number.isInteger(options.page) || options.page < 1 || options.page > 10000
    || !Number.isInteger(options.limit ?? 50) || (options.limit ?? 50) < 1 || (options.limit ?? 50) > 50) {
    throw new ProescError('Página ou limite de pessoas Proesc V2 inválido.');
  }
  const url = new URL('https://api.proesc.com/api/v2/people');
  url.searchParams.set('unit_id', v2Identifier(options.unitId));
  url.searchParams.set('page', String(options.page));
  url.searchParams.set('limit', String(options.limit ?? 50));
  if (options.personId !== undefined) url.searchParams.set('id', v2Identifier(options.personId));
  return parseProescV2PeoplePage(await readV2Json(url, options), options);
}
