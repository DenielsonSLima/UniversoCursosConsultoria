/**
 * Formats a student UUID or raw registration ID into a human-readable student matrícula number.
 * IMPORTANT: Reads from academicosService (Supabase) — never from localStorage.
 * 
 * For synchronous use (e.g. in list renders), pass the config object directly.
 * E.g. 'a0000000-0000-0000-0000-000000000002' -> 'UNIV-26010002'
 */

import { AcademicosConfigData, DEFAULT_CONFIGS, academicosService } from '../modules/gestor/configuracoes/academicos/academicos.service';

export function formatMatricula(
  studentId: string,
  createdAt?: string,
  poloId?: string,
  config?: AcademicosConfigData
): string {
  if (!studentId) return 'N/A';
  if (studentId.length < 10) return studentId.toUpperCase();

  // Use injected config or defaults — NEVER localStorage
  const cfg = config ?? academicosService.getConfigsSync();
  const prefix = cfg.matriculaPrefix ?? DEFAULT_CONFIGS.matriculaPrefix;
  const digits = cfg.matriculaDigits ?? DEFAULT_CONFIGS.matriculaDigits;
  const usePoloCode = cfg.usePoloCode ?? DEFAULT_CONFIGS.usePoloCode;
  const yearFormat = cfg.yearFormat ?? DEFAULT_CONFIGS.yearFormat;

  // 1. Extract a sequential part from the end of the UUID (base 16 to base 10)
  const cleanId = studentId.replace(/[^0-9a-f]/gi, '');
  const lastPart = cleanId.substring(Math.max(0, cleanId.length - 4));
  const sequenceNum = parseInt(lastPart || '1', 16) % Math.pow(10, digits);
  const paddedSeq = String(sequenceNum).padStart(digits, '0');

  // 2. Format year
  let year = '';
  if (yearFormat !== 'none') {
    let rawYear = '2026';
    if (createdAt) {
      const match = createdAt.match(/^(\d{4})/);
      if (match) rawYear = match[1];
    }
    year = yearFormat === 'yy' ? rawYear.substring(2) : rawYear;
  }

  // 3. Format polo code (matriz is 01, Estância is 02, etc.)
  let poloCode = '';
  if (usePoloCode) {
    if (poloId === '55555555-5555-5555-5555-555555555555') {
      poloCode = '02';
    } else {
      poloCode = '01';
    }
  }

  return `${prefix}${year}${poloCode}${paddedSeq}`.toUpperCase();
}

/**
 * Async version: fetches configs from Supabase before formatting.
 * Use this when you can await (e.g. in useEffect or server-side rendering).
 */
export async function formatMatriculaAsync(
  studentId: string,
  createdAt?: string,
  poloId?: string
): Promise<string> {
  const config = await academicosService.getConfigs();
  return formatMatricula(studentId, createdAt, poloId, config);
}
