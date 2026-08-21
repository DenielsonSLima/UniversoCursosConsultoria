import assert from 'node:assert/strict';
import {
  DOCUMENT_VALIDATION_POLICIES,
} from '../../shared/document-validation/document-validation.policies.ts';
import {
  formatPublicValidationDate,
  isPublicValidationDateExpired,
  mapCanonicalValidationRecord,
} from './validator.mapper.ts';
import { PUBLIC_VALIDATION_ERROR_MESSAGE } from './validator.errors.ts';
import {
  PUBLIC_ACADEMIC_DOCUMENT_TYPES,
  resolveValidatorRenderer,
  VALIDATOR_RENDERER_BY_TYPE,
} from './validator.rendering.ts';

declare const Deno: {
  readTextFile: (path: string | URL) => Promise<string>;
  test: (name: string, testFunction: () => void | Promise<void>) => void;
};

const canonicalRecord = (type: string, code: string) => ({
  type,
  code,
  status: 'ACTIVE',
  visibleFields: ['institutionName', 'issuedAt'],
  schemaVersion: 2,
  studentName: 'Maria da Silva',
  studentCpf: '12345678901',
  studentBirthDate: '2000-01-01',
  maskedMotherName: 'Ana S***',
  maskedEnrollmentNumber: '20****01',
  courseName: 'Técnico em Administração',
  className: 'T01',
  institutionName: 'Universo Cursos',
  institutionCnpj: '00.000.000/0001-00',
  unitName: 'Matriz',
  enrollmentStatus: 'ATIVO',
  issuedAt: '2026-07-28T03:00:00.000Z',
  issueCount: 1,
});

const SIGNATURE_EVENT_ID = '11111111-1111-4111-8111-111111111111';
const SIGNATURE_CODE = `SIG-${SIGNATURE_EVENT_ID.toUpperCase()}`;
const canonicalSignatureRecord = () => ({
  type: 'assinatura_eletronica',
  proofKind: 'SIGNATURE_EVENT',
  status: 'ACTIVE',
  code: SIGNATURE_CODE,
  document: {
    type: 'diario_classe',
    code: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    finalSha256: 'a'.repeat(64),
  },
  signature: {
    eventId: SIGNATURE_EVENT_ID,
    signerNameMasked: 'Maria d***',
    signerCpfMasked: '12*.***.**9-01',
    role: 'PROFESSOR',
    roleLabel: 'Professor(a)',
    signedAt: '2026-08-20T00:59:45-03:00',
    hash: 'b'.repeat(64),
  },
  institution: { name: 'Universo Cursos e Consultoria' },
  schemaVersion: 1,
});

const requireAcademicResult = (
  result: ReturnType<typeof mapCanonicalValidationRecord>,
) => {
  if (!result || result.type === 'assinatura_eletronica') {
    throw new Error('Resultado acadêmico esperado.');
  }
  return result;
};

Deno.test('todo tipo acadêmico público possui política e renderer explícitos', () => {
  for (const type of PUBLIC_ACADEMIC_DOCUMENT_TYPES) {
    assert.ok(DOCUMENT_VALIDATION_POLICIES[type]);
    assert.ok(VALIDATOR_RENDERER_BY_TYPE[type]);
  }
});

Deno.test('Pasta e Ficha usam o renderer cadastral público', () => {
  assert.equal(resolveValidatorRenderer('pasta_identificacao'), 'ficha_cadastral');
  assert.equal(resolveValidatorRenderer('ficha_matricula'), 'ficha_cadastral');

  assert.equal(
    mapCanonicalValidationRecord(
      canonicalRecord('pasta_identificacao', 'PASTA-0001'),
      'PASTA-0001',
    )?.type,
    'pasta_identificacao',
  );
  assert.equal(
    mapCanonicalValidationRecord(
      canonicalRecord('ficha_matricula', 'FICHA-MAT-0001'),
      'FICHA-MAT-0001',
    )?.type,
    'ficha_matricula',
  );
});

Deno.test('Diário possui renderer público explícito e contrato canônico', () => {
  assert.equal(resolveValidatorRenderer('diario_classe'), 'diario');
  const validationCode = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
  const active = mapCanonicalValidationRecord(
    canonicalRecord('diario_classe', validationCode),
    validationCode.toLowerCase(),
  );
  const revoked = mapCanonicalValidationRecord(
    {
      ...canonicalRecord('diario_classe', validationCode),
      status: 'REVOKED',
    },
    validationCode,
  );
  assert.equal(active?.type, 'diario_classe');
  assert.equal(active?.status, 'valid');
  assert.equal(revoked?.type, 'diario_classe');
  assert.equal(revoked?.status, 'revoked');
});

Deno.test('Diário recusa resposta remota que tente publicar campo pessoal', () => {
  const validationCode = 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB';
  const result = mapCanonicalValidationRecord(
    {
      ...canonicalRecord('diario_classe', validationCode),
      visibleFields: [
        'institutionName',
        'issuedAt',
        'studentCpf',
      ],
    },
    validationCode,
  );

  assert.equal(result, null);
});

Deno.test('prova individual SIG usa contrato dedicado, mínimo e revogável', () => {
  assert.equal(resolveValidatorRenderer('assinatura_eletronica'), 'assinatura_eletronica');
  const active = mapCanonicalValidationRecord(
    canonicalSignatureRecord(),
    SIGNATURE_CODE,
  );
  const revoked = mapCanonicalValidationRecord(
    { ...canonicalSignatureRecord(), status: 'REVOKED' },
    SIGNATURE_CODE,
  );

  assert.equal(active?.type, 'assinatura_eletronica');
  assert.equal(active?.status, 'valid');
  assert.equal(
    active?.type === 'assinatura_eletronica'
      ? active.signature.signerCpfMasked
      : null,
    '12*.***.**9-01',
  );
  assert.equal(revoked?.status, 'revoked');
});

Deno.test('prova individual SIG continua aceitando a máscara histórica congelada', () => {
  const historical = canonicalSignatureRecord();
  historical.signature.signerCpfMasked = '***.***.***-01';

  const result = mapCanonicalValidationRecord(historical, SIGNATURE_CODE);

  assert.equal(result?.type, 'assinatura_eletronica');
  assert.equal(
    result?.type === 'assinatura_eletronica'
      ? result.signature.signerCpfMasked
      : null,
    '***.***.***-01',
  );
});

Deno.test('prova SIG falha fechada para PII bruta, Storage, chaves extras e código não SIG', () => {
  const base = canonicalSignatureRecord();
  assert.equal(
    mapCanonicalValidationRecord({
      ...base,
      signature: { ...base.signature, signerNameMasked: 'Maria da Silva' },
    }, SIGNATURE_CODE),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord({
      ...base,
      signature: { ...base.signature, signerCpfMasked: '123.456.789-01' },
    }, SIGNATURE_CODE),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord({ ...base, storagePath: 'envelopes/x.pdf' }, SIGNATURE_CODE),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord({
      ...base,
      signature: { ...base.signature, unknownProof: true },
    }, SIGNATURE_CODE),
    null,
  );
  assert.equal(mapCanonicalValidationRecord(base, 'DIA-NAO-SIG'), null);
});

Deno.test('contrato e credencial de preceptor têm renderer e perfil público próprios', () => {
  assert.equal(resolveValidatorRenderer('contrato_aluno'), 'declaracao');
  assert.equal(resolveValidatorRenderer('carteirinha_preceptor'), 'preceptor');

  const contrato = mapCanonicalValidationRecord(
    {
      ...canonicalRecord('contrato_aluno', 'CON-ALU-0001'),
      visibleFields: [
        'studentName',
        'courseName',
        'institutionName',
        'issuedAt',
        'unitName',
      ],
    },
    'CON-ALU-0001',
  );
  assert.equal(contrato?.type, 'contrato_aluno');
  assert.equal(contrato?.studentName, 'Maria d***');

  const preceptor = mapCanonicalValidationRecord(
    {
      ...canonicalRecord('carteirinha_preceptor', 'PRE-0001'),
      visibleFields: [
        'studentName',
        'institutionName',
        'issuedAt',
        'expiresAt',
        'unitName',
      ],
      studentName: 'Rafael da Silva',
      studentPhotoUrl: 'https://example.test/foto.jpg',
      studentCpf: '12345678901',
    },
    'PRE-0001',
  );
  assert.equal(preceptor?.type, 'carteirinha_preceptor');
  assert.equal(preceptor?.studentName, 'Rafael d***');
  assert.equal(preceptor?.studentPhotoUrl, null);
  assert.equal(preceptor?.maskedCpf, '***.***.***-**');
  assert.equal(preceptor?.visibleFields.includes('studentPhotoUrl'), false);
  assert.equal(preceptor?.visibleFields.includes('studentCpf'), false);
});

Deno.test('contrato e credencial recusam uma resposta remota que tente ampliar dados pessoais', () => {
  const result = mapCanonicalValidationRecord(
    {
      ...canonicalRecord('carteirinha_preceptor', 'PRE-PRIVACIDADE'),
      visibleFields: [
        'studentName',
        'studentCpf',
        'institutionName',
        'issuedAt',
      ],
    },
    'PRE-PRIVACIDADE',
  );

  assert.equal(result, null);
});

Deno.test('tipo desconhecido nunca produz estado público válido', () => {
  assert.equal(
    mapCanonicalValidationRecord(
      canonicalRecord('tipo_inexistente', 'XXX-1'),
      'XXX-1',
    ),
    null,
  );
});

Deno.test('status da validação é autoridade da RPC, mesmo com data passada', () => {
  const result = requireAcademicResult(mapCanonicalValidationRecord(
    {
      ...canonicalRecord('certificado_tecnico', 'CERT-TEC-0001'),
      status: 'ACTIVE',
      expiresAt: '2000-01-01T03:00:00.000Z',
    },
    'CERT-TEC-0001',
  ));

  assert.equal(result?.status, 'valid');
  assert.ok(result?.expiresAt);
});

Deno.test('literal Não informado permanece legível e não recebe máscara', () => {
  const result = requireAcademicResult(mapCanonicalValidationRecord(
    {
      ...canonicalRecord('pasta_identificacao', 'PASTA-0002'),
      maskedMotherName: 'Não informado',
    },
    'PASTA-0002',
  ));

  assert.equal(result?.maskedMotherName, 'Não informado');
});

Deno.test('mapper aplica as mesmas máscaras canônicas do backend', () => {
  const result = requireAcademicResult(mapCanonicalValidationRecord(
    {
      ...canonicalRecord('declaracao_matricula', 'DEC-MASCARA'),
      studentName: 'Maria de Oliveira Santos',
      studentCpf: '12345678901',
      maskedMotherName: null,
      visibleFields: [
        'studentName',
        'studentCpf',
        'maskedMotherName',
        'institutionName',
        'issuedAt',
      ],
    },
    'DEC-MASCARA',
  ));

  assert.equal(result?.studentName, 'Maria d***');
  assert.equal(result?.maskedCpf, '***.***.***-01');
  assert.equal(result?.maskedMotherName, 'Não informado');
});

Deno.test('mapper recebe visibleFields e schemaVersion do contrato v2', () => {
  const result = requireAcademicResult(mapCanonicalValidationRecord(
    {
      ...canonicalRecord('certificado_tecnico', 'CERT-0002'),
      visibleFields: ['courseName', 'institutionName', 'issuedAt'],
      schemaVersion: 2,
    },
    'CERT-0002',
  ));

  assert.deepEqual(
    result?.visibleFields,
    ['courseName', 'institutionName', 'issuedAt'],
  );
  assert.equal(result?.schemaVersion, 2);
});

Deno.test('mapper limita resultado realmente legado v1 ao perfil mínimo', () => {
  const legacyRecord: Record<string, unknown> = {
    ...canonicalRecord('declaracao_matricula', 'DEC-LEGADO'),
  };
  delete legacyRecord.schemaVersion;
  delete legacyRecord.visibleFields;
  const result = requireAcademicResult(mapCanonicalValidationRecord(
    legacyRecord,
    'DEC-LEGADO',
  ));

  assert.equal(result?.schemaVersion, 1);
  assert.deepEqual(result?.visibleFields, ['institutionName', 'issuedAt']);
});

Deno.test('mapper rejeita status e código canônico ausentes ou incompatíveis', () => {
  const base = canonicalRecord('certificado_tecnico', 'CERT-VALIDO');
  assert.equal(
    mapCanonicalValidationRecord({ ...base, status: undefined }, 'CERT-VALIDO'),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord({ ...base, status: 'UNKNOWN' }, 'CERT-VALIDO'),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord({ ...base, code: undefined }, 'CERT-VALIDO'),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord({ ...base, code: 'CERT-OUTRO' }, 'CERT-VALIDO'),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord({ ...base, code: 'cert-valido' }, 'CERT-VALIDO'),
    null,
  );
});

Deno.test('schema v2 sem visibleFields íntegro falha fechado', () => {
  const base = canonicalRecord('certificado_tecnico', 'CERT-SCHEMA');
  assert.equal(
    mapCanonicalValidationRecord(
      { ...base, visibleFields: undefined },
      'CERT-SCHEMA',
    ),
    null,
  );
  assert.equal(
    mapCanonicalValidationRecord(
      {
        ...base,
        visibleFields: ['institutionName', 'issuedAt', 'cpfCompleto'],
      },
      'CERT-SCHEMA',
    ),
    null,
  );
  const fieldsWithoutSchema: Record<string, unknown> = { ...base };
  delete fieldsWithoutSchema.schemaVersion;
  assert.equal(
    mapCanonicalValidationRecord(fieldsWithoutSchema, 'CERT-SCHEMA'),
    null,
  );
});

Deno.test('mapper remascara valores com asterisco sem confiar no emissor', () => {
  const result = requireAcademicResult(mapCanonicalValidationRecord(
    {
      ...canonicalRecord('declaracao_matricula', 'DEC-ASTERISCO'),
      visibleFields: [
        'studentName',
        'studentCpf',
        'studentBirthDate',
        'maskedEnrollmentNumber',
        'institutionName',
        'issuedAt',
      ],
      studentName: 'Maria * da Silva CPF 12345678901',
      studentCpf: '123.456.789-*1',
      studentBirthDate: '01/*1/2000',
      maskedEnrollmentNumber: 'MAT*123456',
    },
    'DEC-ASTERISCO',
  ));

  assert.equal(result?.studentName, 'Maria d***');
  assert.equal(result?.maskedCpf, '***.***.***-91');
  assert.equal(result?.maskedBirthDate, '**/**/2000');
  assert.equal(result?.maskedEnrollmentNumber, 'MAT****56');
});

Deno.test('datas civis usam calendário de Maceió sem recuo UTC', () => {
  assert.equal(formatPublicValidationDate('2026-07-28'), '28/07/2026');
  assert.equal(
    formatPublicValidationDate('2026-07-28T01:00:00.000Z'),
    '27/07/2026',
  );
  assert.equal(formatPublicValidationDate('2026-02-30'), null);
  assert.equal(
    isPublicValidationDateExpired(
      '2026-07-28',
      new Date('2026-07-29T02:59:59.999Z'),
    ),
    false,
  );
  assert.equal(
    isPublicValidationDateExpired(
      '2026-07-28',
      new Date('2026-07-29T03:00:00.000Z'),
    ),
    true,
  );
});

Deno.test('serviço público roteia SIG antes do legado e nunca lista tabelas', async () => {
  const serviceSource = await Deno.readTextFile(
    new URL('./validator.service.ts', import.meta.url),
  );

  assert.match(serviceSource, /validar_documento_por_codigo/);
  assert.match(serviceSource, /validar_assinatura_eletronica_por_codigo/);
  assert.doesNotMatch(serviceSource, /validar_carteirinha_legada_por_codigo/);
  assert.doesNotMatch(serviceSource, /\.from\s*\(/);
  assert.doesNotMatch(serviceSource, /documentos_templates/);
  assert.doesNotMatch(serviceSource, /matriculas/);
  assert.equal(serviceSource.match(/supabase\.rpc\s*\(/g)?.length, 2);
  assert.ok(
    serviceSource.indexOf("code.startsWith('SIG-')")
      < serviceSource.indexOf('return validateEmissionRegistry(code)'),
  );
  assert.match(serviceSource, /SIGNATURE_CODE_PATTERN\.test\(code\)[\s\S]*?: null/);
});

Deno.test('UI da prova SIG fixa segundos e UTC-03 sem alegar validade jurídica', async () => {
  const source = await Deno.readTextFile(
    new URL('./assinatura/AssinaturaEletronicaValidationResult.tsx', import.meta.url),
  );
  assert.match(source, /timeZone:\s*SIGNATURE_TIME_ZONE/);
  assert.match(source, /second:\s*'2-digit'/);
  assert.match(source, /timeZoneName:\s*'longOffset'/);
  assert.match(source, /America\/Maceio/);
  assert.doesNotMatch(source, /validade jur[ií]dica/i);
});

Deno.test('migration fecha validation_*, preserva ticker e elimina fallback legado', async () => {
  const migrationSource = await Deno.readTextFile(
    new URL(
      '../../../supabase/migrations/20260728051617_remove_legacy_public_document_validation_policy.sql',
      import.meta.url,
    ),
  );

  assert.match(
    migrationSource,
    /drop policy if exists "documentos_templates_public_validation_select"/i,
  );
  assert.match(
    migrationSource,
    /using\s*\(\s*id\s*=\s*'site_publico_ticker_config'\s*\)/i,
  );
  assert.doesNotMatch(migrationSource, /using\s*\([^)]*validation_/i);
  assert.match(
    migrationSource,
    /drop function if exists public\.validar_carteirinha_legada_por_codigo\(text\)/i,
  );
  assert.doesNotMatch(migrationSource, /create or replace function/i);
  assert.doesNotMatch(migrationSource, /grant execute/i);
});

Deno.test('página pública nunca repassa erro bruto do Supabase ao usuário', async () => {
  const pageSource = await Deno.readTextFile(
    new URL('./ValidatorPage.tsx', import.meta.url),
  );

  assert.match(
    PUBLIC_VALIDATION_ERROR_MESSAGE,
    /Não foi possível processar a validação/i,
  );
  assert.match(
    pageSource,
    /setValidationMessage\(PUBLIC_VALIDATION_ERROR_MESSAGE\)/,
  );
  assert.doesNotMatch(pageSource, /setValidationMessage\(\s*error\.message/);
  assert.doesNotMatch(pageSource, /error instanceof Error/);
});
