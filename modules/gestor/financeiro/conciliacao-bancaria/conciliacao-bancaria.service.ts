import { supabase } from '../../../../lib/supabase';
import type {
  BaneseCnabApplyReturnInput,
  BaneseCnabApplyReturnResult,
  BaneseCnabDownloadFileInput,
  BaneseCnabDownloadFileResult,
  BaneseCnabDownloadedFileResult,
  BaneseCnabFileDetailsResult,
  BaneseCnabGenerateRemittanceInput,
  BaneseCnabGenerateRemittanceResult,
  BaneseCnabOverview,
  BaneseCnabGetFileInput,
  BaneseCnabGetFileResult,
  BaneseCnabPreviewReturnInput,
  BaneseCnabPreviewReturnResult,
  BaneseCnabRemittancePreviewInput,
  BaneseCnabRemittancePreviewResult,
  BaneseCnabRevalidateReturnInput,
  BaneseCnabRevalidateReturnResult,
  BaneseCnabRetryActivationInput,
  BaneseCnabRetryActivationResult,
} from './conciliacao-bancaria.types';
import { fetchBaneseRemittanceBlob } from './conciliacao-bancaria.download';
import { validateBaneseCnabReturnFile } from './conciliacao-bancaria.utils';

const BANESE_CNAB240_FUNCTION = 'banese-cnab240-api';
export const BANESE_CNAB240_OVERVIEW_QUERY_KEY = ['banese-cnab240', 'overview'] as const;

const extractFunctionErrorMessage = async (error: any) => {
  const context = error?.context;
  const canReadJson = context && typeof context.json === 'function';
  const body = canReadJson ? await context.json().catch(() => null) : null;
  return body?.error || body?.message || error?.message || 'Erro ao comunicar com a conciliação Banese.';
};

const invokeBaneseCnab240 = async <T>(body: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.functions.invoke(BANESE_CNAB240_FUNCTION, { body });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  if (data?.success !== true || !data.data || typeof data.data !== 'object') {
    throw new Error('A API CNAB240 Banese retornou uma resposta inválida.');
  }
  return data.data as T;
};

const assertReturnResult = (
  result: BaneseCnabFileDetailsResult,
  requestedEnvironment: BaneseCnabPreviewReturnInput['environment'],
) => {
  if (!result.file || typeof result.file.id !== 'string' || !result.file.id.trim()) {
    throw new Error('A API CNAB240 Banese não retornou o identificador seguro do arquivo.');
  }
  if (!['sandbox', 'production'].includes(result.file.environment)) {
    throw new Error('A API CNAB240 Banese não confirmou o ambiente bancário do arquivo.');
  }
  if (result.file.environment !== requestedEnvironment) {
    throw new Error('A API CNAB240 Banese retornou o arquivo em um ambiente diferente do solicitado.');
  }
  if (result.file.direction !== 'RETORNO') {
    throw new Error('A API CNAB240 Banese retornou um arquivo que não é de retorno.');
  }
  if (!Array.isArray(result.records)) {
    throw new Error('A API CNAB240 Banese retornou uma lista de registros inválida.');
  }
};

function assertEnvironment(value: unknown): asserts value is 'sandbox' | 'production' {
  if (!['sandbox', 'production'].includes(String(value || ''))) {
    throw new Error('A API CNAB240 Banese não confirmou o ambiente bancário.');
  }
}

const validateReceivableIds = (receivableIds: string[]) => {
  if (!Array.isArray(receivableIds) || receivableIds.length === 0 || receivableIds.length > 200) {
    throw new Error('Selecione entre 1 e 200 cobranças elegíveis para a remessa.');
  }
  if (new Set(receivableIds).size !== receivableIds.length) {
    throw new Error('A seleção da remessa contém cobranças duplicadas.');
  }
};

const isValidInstallmentValue = (value: unknown) => value === null
  || (typeof value === 'number' && Number.isInteger(value) && value > 0);

const isValidFinancialTerm = (
  term: unknown,
  dateField: 'validUntil' | 'startsOn',
  allowedTypes: readonly string[],
) => {
  if (term === null) return true;
  if (!term || typeof term !== 'object') return false;
  const candidate = term as Record<string, unknown>;
  return typeof candidate.type === 'string'
    && allowedTypes.includes(candidate.type)
    && typeof candidate.value === 'number'
    && Number.isFinite(candidate.value)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(candidate[dateField] || ''));
};

const assertRemittancePreviewItems = (items: BaneseCnabRemittancePreviewResult['items']) => {
  for (const item of items) {
    const terms = item?.financialTerms;
    if (
      !item
      || !isValidInstallmentValue(item.installmentNumber)
      || !isValidInstallmentValue(item.installmentCount)
      || (
        item.installmentNumber !== null
        && item.installmentCount !== null
        && item.installmentNumber > item.installmentCount
      )
      || !terms
      || !Number.isFinite(terms.nominalAmount)
      || !/^\d{4}-\d{2}-\d{2}$/.test(terms.dueDate)
      || !isValidFinancialTerm(terms.discount, 'validUntil', ['fixed', 'percentage'])
      || !isValidFinancialTerm(terms.penalty, 'startsOn', ['fixed', 'percentage'])
      || !isValidFinancialTerm(terms.interest, 'startsOn', ['daily-fixed', 'monthly-percentage'])
    ) {
      throw new Error('A prévia da remessa retornou condições financeiras incompletas.');
    }
  }
};

const assertExchangeFile = (
  file: BaneseCnabGenerateRemittanceResult['file'],
  requestedEnvironment: BaneseCnabRemittancePreviewInput['environment'],
) => {
  if (!file || typeof file.id !== 'string' || !file.id.trim()) {
    throw new Error('A API CNAB240 Banese não retornou o arquivo gerado.');
  }
  assertEnvironment(file.environment);
  if (file.environment !== requestedEnvironment) {
    throw new Error('A API CNAB240 Banese retornou um arquivo em ambiente diferente do solicitado.');
  }
};

export const baneseCnab240Service = {
  async getOverview(): Promise<BaneseCnabOverview> {
    const result = await invokeBaneseCnab240<BaneseCnabOverview>({ action: 'overview' });
    assertEnvironment(result.environment);
    if (!Array.isArray(result.eligibleReceivables) || !Array.isArray(result.files)) {
      throw new Error('A API CNAB240 Banese retornou um resumo incompleto.');
    }
    return result;
  },

  async previewRemittance(
    input: BaneseCnabRemittancePreviewInput,
  ): Promise<BaneseCnabRemittancePreviewResult> {
    validateReceivableIds(input.receivableIds);
    const result = await invokeBaneseCnab240<BaneseCnabRemittancePreviewResult>({
      action: 'preview-remittance',
      environment: input.environment,
      receivableIds: input.receivableIds,
    });
    assertEnvironment(result.environment);
    if (result.environment !== input.environment || !Array.isArray(result.items)) {
      throw new Error('A prévia da remessa não corresponde ao ambiente bancário selecionado.');
    }
    assertRemittancePreviewItems(result.items);
    if (!/^[0-9a-f]{64}$/i.test(result.previewFingerprint)) {
      throw new Error('A prévia da remessa não retornou uma impressão de confirmação válida.');
    }
    return result;
  },

  async generateRemittance(
    input: BaneseCnabGenerateRemittanceInput,
  ): Promise<BaneseCnabGenerateRemittanceResult> {
    validateReceivableIds(input.receivableIds);
    if (!/^[0-9a-f]{64}$/i.test(input.previewFingerprint)) {
      throw new Error('Gere uma nova prévia antes de confirmar a remessa.');
    }
    const result = await invokeBaneseCnab240<BaneseCnabGenerateRemittanceResult>({
      action: 'generate-remittance',
      environment: input.environment,
      receivableIds: input.receivableIds,
      previewFingerprint: input.previewFingerprint,
      confirmProduction: input.confirmProduction,
    });
    assertExchangeFile(result.file, input.environment);
    if (result.file.direction !== 'REMESSA' || result.file.status !== 'GENERATED') {
      throw new Error('A API CNAB240 Banese não concluiu a geração segura da remessa.');
    }
    return result;
  },

  async downloadFile(input: BaneseCnabDownloadFileInput): Promise<BaneseCnabDownloadedFileResult> {
    const result = await invokeBaneseCnab240<BaneseCnabDownloadFileResult>({
      action: 'download-file',
      environment: input.environment,
      fileId: input.fileId,
    });
    assertExchangeFile(result.file, input.environment);
    if (result.file.direction !== 'REMESSA' || result.file.status !== 'GENERATED') {
      throw new Error('O arquivo solicitado não é uma remessa disponível para download.');
    }
    const blob = await fetchBaneseRemittanceBlob({
      signedUrl: result.signedUrl,
      fileName: result.file.fileName,
      expiresIn: result.expiresIn,
    });
    return {
      file: result.file,
      blob,
      expiresIn: result.expiresIn,
    };
  },

  async previewReturn(input: BaneseCnabPreviewReturnInput): Promise<BaneseCnabPreviewReturnResult> {
    const validation = validateBaneseCnabReturnFile({
      name: input.fileName,
      size: input.fileSizeBytes,
    });
    if ('message' in validation) throw new Error(validation.message);
    if (!input.fileContentBase64.trim()) throw new Error('O arquivo CNAB240 está vazio.');

    const result = await invokeBaneseCnab240<BaneseCnabPreviewReturnResult>({
      action: 'preview-return',
      environment: input.environment,
      fileName: input.fileName,
      fileContentBase64: input.fileContentBase64,
    });
    assertReturnResult(result, input.environment);
    return result;
  },

  async getFile(input: BaneseCnabGetFileInput): Promise<BaneseCnabGetFileResult> {
    const result = await invokeBaneseCnab240<BaneseCnabGetFileResult>({
      action: 'get-file',
      environment: input.environment,
      fileId: input.fileId,
    });
    assertReturnResult(result, input.environment);
    return result;
  },

  async revalidateReturn(
    input: BaneseCnabRevalidateReturnInput,
  ): Promise<BaneseCnabRevalidateReturnResult> {
    const result = await invokeBaneseCnab240<BaneseCnabRevalidateReturnResult>({
      action: 'revalidate-return',
      environment: input.environment,
      fileId: input.fileId,
      confirmProduction: input.confirmProduction,
    });
    assertReturnResult(result, input.environment);
    return result;
  },

  async applyReturn(input: BaneseCnabApplyReturnInput): Promise<BaneseCnabApplyReturnResult> {
    const result = await invokeBaneseCnab240<BaneseCnabApplyReturnResult>({
      action: 'apply-return',
      environment: input.environment,
      fileId: input.fileId,
      confirmProduction: input.confirmProduction,
    });
    assertReturnResult(result, input.environment);
    return result;
  },

  async retryActivation(
    input: BaneseCnabRetryActivationInput,
  ): Promise<BaneseCnabRetryActivationResult> {
    const result = await invokeBaneseCnab240<BaneseCnabRetryActivationResult>({
      action: 'retry-activation',
      environment: input.environment,
      fileId: input.fileId,
      confirmProduction: input.confirmProduction,
    });
    assertReturnResult(result, input.environment);
    return result;
  },
};
