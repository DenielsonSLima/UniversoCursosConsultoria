/* global ReadableStreamDefaultReader: readonly, TextDecoder: readonly -- APIs Web disponíveis no runtime Deno. */
import {
  parseProescV1Accounting,
  PROESC_V1_MAX_ROWS,
  proescV1Identifier,
  type ProescV1AccountingPage,
  type ProescV1AccountingSource,
} from './v1-accounting.ts';

type ReadErrorCode = 'INVALID_REQUEST' | 'HTTP_ERROR' | 'REDIRECT' | 'TIMEOUT'
  | 'ABORTED' | 'TRANSPORT_ERROR' | 'RESPONSE_LIMIT' | 'INVALID_RESPONSE' | 'SEMANTIC_ERROR';

const messages: Record<ReadErrorCode, string> = {
  INVALID_REQUEST: 'Parâmetros inválidos para leitura Proesc V1.',
  HTTP_ERROR: 'O Proesc V1 recusou ou não concluiu a leitura solicitada.',
  REDIRECT: 'O Proesc V1 redirecionou a leitura; o redirecionamento foi bloqueado.',
  TIMEOUT: 'O Proesc V1 não concluiu a leitura dentro do tempo limite.',
  ABORTED: 'A leitura Proesc V1 foi interrompida.',
  TRANSPORT_ERROR: 'Não foi possível conectar ao Proesc V1.',
  RESPONSE_LIMIT: 'A resposta Proesc V1 ultrapassou o limite seguro de leitura.',
  INVALID_RESPONSE: 'O Proesc V1 retornou uma resposta inválida ou incompleta.',
  SEMANTIC_ERROR: 'A resposta Proesc V1 informou falha na operação.',
};

export class ProescV1ReadError extends Error {
  constructor(public readonly code: ReadErrorCode, public readonly upstreamStatus = 0) {
    super(messages[code]);
    this.name = 'ProescV1ReadError';
  }
}

export interface ProescV1ClientOptions {
  token: string;
  transport?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  maxRows?: number;
  signal?: AbortSignal;
}

export interface ProescV1Configuration {
  units: Array<{ id: string; name: string }>;
  academicYears: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}

export type ProescV1AccountingQuery = ProescV1AccountingSource & { externalKey?: string };
type Resource = 'configuration_data' | 'accounting_data';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);

function boundedInteger(value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new ProescV1ReadError('INVALID_REQUEST');
  return value;
}

function requireSource(query: ProescV1AccountingQuery): ProescV1AccountingQuery {
  try {
    return {
      unitId: proescV1Identifier(query.unitId),
      year: boundedInteger(query.year, 1900, 2200),
      month: boundedInteger(query.month, 1, 12),
      ...(query.externalKey !== undefined ? { externalKey: proescV1Identifier(query.externalKey) } : {}),
    };
  } catch { throw new ProescV1ReadError('INVALID_REQUEST'); }
}

function configuration(payload: Record<string, unknown>, maxRows: number): ProescV1Configuration {
  const collection = (key: string): Array<{ id: string; name: string }> => {
    const values = payload[key];
    if (!Array.isArray(values) || values.length > maxRows) throw new ProescV1ReadError('INVALID_RESPONSE', 200);
    const result = values.map((value: unknown) => {
      if (!isRecord(value)) throw new ProescV1ReadError('INVALID_RESPONSE', 200);
      const name = key === 'units' ? value.unidade ?? value.name : value.name;
      // eslint-disable-next-line no-control-regex -- Rejeita deliberadamente controles ASCII nos nomes remotos.
      if (typeof name !== 'string' || !name.trim() || name.length > 300 || /[\x00-\x1f\x7f]/.test(name)) {
        throw new ProescV1ReadError('INVALID_RESPONSE', 200);
      }
      return { id: proescV1Identifier(value.id), name };
    });
    if (new Set(result.map((entry) => entry.id)).size !== result.length) {
      throw new ProescV1ReadError('INVALID_RESPONSE', 200);
    }
    return result;
  };
  return { units: collection('units'), academicYears: collection('academic_years'), categories: collection('categories') };
}

export function createProescV1Client(options: ProescV1ClientOptions) {
  if (typeof options.token !== 'string' || options.token.length < 12 || options.token.length > 8192
    // eslint-disable-next-line no-control-regex -- Credenciais não podem conter espaços nem controles ASCII.
    || /[\s\x00-\x1f\x7f]/.test(options.token)) throw new ProescV1ReadError('INVALID_REQUEST');
  const transport = options.transport ?? fetch;
  const timeoutMs = boundedInteger(options.timeoutMs ?? 12_000, 1, 30_000);
  const maxBytes = boundedInteger(options.maxBytes ?? 4_000_000, 1, 8_000_000);
  const maxRows = boundedInteger(options.maxRows ?? PROESC_V1_MAX_ROWS, 1, PROESC_V1_MAX_ROWS);

  async function read<T>(resource: Resource, params: Record<string, string>, parse: (payload: Record<string, unknown>) => T): Promise<T> {
    // Mesmo uma chamada JavaScript sem tipos não pode escolher outro host/recurso.
    if (!['configuration_data', 'accounting_data'].includes(resource)) throw new ProescV1ReadError('INVALID_REQUEST');
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timedOut = false;
    let rejectAbort: (reason: ProescV1ReadError) => void = () => undefined;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const onAbort = () => {
      controller.abort();
      rejectAbort(new ProescV1ReadError(timedOut ? 'TIMEOUT' : 'ABORTED'));
    };
    const timer = setTimeout(() => { timedOut = true; onAbort(); }, timeoutMs);
    options.signal?.addEventListener('abort', onAbort, { once: true });

    const perform = async () => {
      if (options.signal?.aborted) throw new ProescV1ReadError('ABORTED');
      const url = new URL(`https://app.proesc.com/api/v1/${resource}`);
      url.search = new URLSearchParams({ ...params, token: options.token }).toString();
      let response: Response;
      try {
        response = await transport(url, {
          method: 'GET', redirect: 'error', signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
      } catch {
        throw new ProescV1ReadError(timedOut ? 'TIMEOUT' : controller.signal.aborted ? 'ABORTED' : 'TRANSPORT_ERROR');
      }
      const rejectResponse = async (code: ReadErrorCode): Promise<never> => {
        void response.body?.cancel().catch(() => undefined);
        throw new ProescV1ReadError(code, response.status);
      };
      if (controller.signal.aborted) return rejectResponse(timedOut ? 'TIMEOUT' : 'ABORTED');
      if (response.status >= 300 && response.status < 400) return rejectResponse('REDIRECT');
      if (response.status !== 200) return rejectResponse('HTTP_ERROR');
      if (response.headers.has('content-range')) return rejectResponse('INVALID_RESPONSE');
      if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')) {
        return rejectResponse('INVALID_RESPONSE');
      }
      const declaredLength = response.headers.get('content-length');
      if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
        return rejectResponse('RESPONSE_LIMIT');
      }
      reader = response.body?.getReader();
      if (!reader) throw new ProescV1ReadError('INVALID_RESPONSE', response.status);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await Promise.race([reader.read(), aborted]);
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBytes) throw new ProescV1ReadError('RESPONSE_LIMIT', response.status);
        chunks.push(chunk.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw new ProescV1ReadError('INVALID_RESPONSE', response.status); }
      if (!isRecord(payload)) throw new ProescV1ReadError('INVALID_RESPONSE', response.status);
      if (payload.status === 'error') throw new ProescV1ReadError('SEMANTIC_ERROR', response.status);
      if (payload.status !== 'success') throw new ProescV1ReadError('INVALID_RESPONSE', response.status);
      try { return parse(payload); }
      catch (error) {
        if (error instanceof ProescV1ReadError) throw error;
        throw new ProescV1ReadError('INVALID_RESPONSE', response.status);
      }
    };

    try { return await Promise.race([perform(), aborted]); }
    catch (error) {
      if (error instanceof ProescV1ReadError) throw error;
      // Nunca encaminhar message/cause/Location do fetch ou corpo do provedor:
      // a V1 transporta a credencial na URL e pode ecoá-la em qualquer um deles.
      throw new ProescV1ReadError('INVALID_RESPONSE');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      if (reader) {
        void reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
  }

  return {
    configurationData: (): Promise<ProescV1Configuration> => read('configuration_data', {}, (payload) => configuration(payload, maxRows)),
    accountingData: (input: ProescV1AccountingQuery): Promise<ProescV1AccountingPage> => {
      const query = requireSource(input);
      const params: Record<string, string> = {
        unidade_id: query.unitId,
        ano_letivo: String(query.year),
        mes: String(query.month).padStart(2, '0'),
        ...(query.externalKey === undefined ? {} : { id_chave: query.externalKey }),
      };
      return read('accounting_data', params, (payload) => {
        const page = parseProescV1Accounting(payload, query, maxRows);
        if (query.externalKey !== undefined && page.rows.some((row) => row.externalKey !== query.externalKey)) {
          throw new ProescV1ReadError('INVALID_RESPONSE', 200);
        }
        return page;
      });
    },
  };
}
