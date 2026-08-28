import assert from "node:assert/strict";
import {
  BANESE_DOCUMENT_FIXTURE,
  baneseDocumentFixtureAt,
} from "../banese/internal/testing/document-fixture.ts";
import type { BaneseCarnetReceivableRow } from "../banese-carnet-document/document-policy.ts";
import {
  buildBaneseDocumentFilters,
  buildBaneseDocumentGroups,
  filterBaneseDocumentGroups,
  formatEnrollmentCode,
  maskStudentCpf,
  paginateBaneseDocumentGroups,
} from "./document-groups.ts";

const STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const PAYER_ID = "77777777-7777-4777-8777-777777777777";
const ENROLLMENT_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ENROLLMENT_ID = "88888888-8888-4888-8888-888888888888";
const THIRD_ENROLLMENT_ID = "12121212-1212-4212-8212-121212121212";
const POLO_ID = "44444444-4444-4444-8444-444444444444";
const OTHER_POLO_ID = "99999999-9999-4999-8999-999999999999";
const ISSUER_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_ISSUER_ID = "66666666-6666-4666-8666-666666666666";
const CLASS_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COURSE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_CLASS_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OTHER_COURSE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const rowAt = (
  index: number,
  overrides: Partial<BaneseCarnetReceivableRow> = {},
  nominalAmount = BANESE_DOCUMENT_FIXTURE.amount,
  dueDate = BANESE_DOCUMENT_FIXTURE.dueDate,
): BaneseCarnetReceivableRow => {
  const bank = baneseDocumentFixtureAt(index, dueDate, nominalAmount);
  return {
    id: bank.receivableId,
    cliente_id: STUDENT_ID,
    matricula_id: ENROLLMENT_ID,
    turma_id: CLASS_ID,
    polo_id: POLO_ID,
    descricao: `Parcela ${index + 1}`,
    tipo_lancamento: "PARCELA",
    parcela_numero: index + 1,
    valor: bank.amount,
    data_vencimento: bank.dueDate,
    status: "PENDENTE",
    gateway_provider: "banese_card",
    gateway_environment: "sandbox",
    gateway_payment_method: "BOLETO",
    gateway_status: "2",
    gateway_pix_payload: null,
    gateway_pix_encoded_image: null,
    gateway_boleto_issued_at: "2026-07-16T12:00:00Z",
    gateway_boleto_linha_digitavel: bank.digitableLine,
    gateway_boleto_codigo_barras: bank.barcode,
    gateway_boleto_nosso_numero: bank.ourNumber,
    gateway_boleto_convenio: "15528",
    gateway_boleto_agencia: "033",
    gateway_issuer_polo_id: ISSUER_ID,
    gateway_financial_terms: bank.financialTerms as Record<string, unknown>,
    gateway_financial_terms_confirmed_at: "2026-07-16T12:05:00Z",
    ...overrides,
  };
};

const buildInput = () => ({
  receivables: [
    rowAt(0),
    rowAt(1),
    rowAt(2),
    rowAt(3, { matricula_id: OTHER_ENROLLMENT_ID }),
    rowAt(4, { polo_id: OTHER_POLO_ID }),
    rowAt(5, { gateway_environment: "production" }),
    rowAt(6, { gateway_issuer_polo_id: OTHER_ISSUER_ID }),
    rowAt(7, { gateway_boleto_convenio: "99999" }),
    rowAt(8, { gateway_boleto_agencia: "034" }),
    rowAt(9, { gateway_financial_terms_confirmed_at: null }),
    rowAt(10, { cliente_id: PAYER_ID }),
  ],
  students: [{
    id: STUDENT_ID,
    nome: "João da Silva",
    cpf_cnpj: "123.456.789-09",
  }],
  enrollments: [
    {
      id: ENROLLMENT_ID,
      aluno_id: STUDENT_ID,
      turma_id: CLASS_ID,
      data_matricula: "2026-01-20T12:00:00Z",
    },
    {
      id: OTHER_ENROLLMENT_ID,
      aluno_id: STUDENT_ID,
      turma_id: CLASS_ID,
      data_matricula: "2026-02-20T12:00:00Z",
    },
  ],
  classes: [{
    id: CLASS_ID,
    nome: "Técnico em Administração 2026",
    codigo: "ADM-2026",
    curso_id: COURSE_ID,
    polo_id: POLO_ID,
  }],
  courses: [{ id: COURSE_ID, nome: "Técnico em Administração" }],
  enrollmentConfig: {
    matriculaPrefix: "UNI-",
    matriculaDigits: 4,
    yearFormat: "yy",
    usePoloCode: false,
  },
});

Deno.test("agrupa exatamente por matrícula, polo e vínculo bancário", () => {
  const groups = buildBaneseDocumentGroups(buildInput());
  assert.equal(groups.length, 8);
  assert.deepEqual(
    groups.map((group) => group.installmentCount).sort((a, b) => a - b),
    [1, 1, 1, 1, 1, 1, 1, 3],
  );
  assert.equal(
    groups.find((group) => group.installmentCount === 3)?.documentType,
    "carnet",
  );
  assert.ok(
    groups.filter((group) => group.installmentCount === 1)
      .every((group) => group.documentType === "boletos"),
  );
  assert.ok(groups.every((group) => group.id.startsWith("banese:")));
});

Deno.test("agrupa rematricula confirmada sem desconto com as mensalidades", () => {
  const input = buildInput();
  const rematricula = rowAt(11, {
    tipo_lancamento: "REMATRICULA",
    parcela_numero: 0,
    descricao: "Rematrícula",
    gateway_financial_terms: {
      ...rowAt(11).gateway_financial_terms,
      discount: null,
    },
  });
  const groups = buildBaneseDocumentGroups({
    ...input,
    receivables: [...input.receivables, rematricula],
  });
  const enrollmentGroup = groups.find((group) =>
    group.enrollmentId === ENROLLMENT_ID && group.installmentCount === 4
  );

  assert.ok(enrollmentGroup);
  assert.equal(enrollmentGroup.totalAmount, 80_000);
  assert.ok(enrollmentGroup.receivableIds.includes(rematricula.id));
  assert.equal(enrollmentGroup.representativeReceivableId, rematricula.id);
  assert.equal(
    enrollmentGroup.firstDueDate,
    [rowAt(0), rowAt(1), rowAt(2), rematricula]
      .map((row) => String(row.data_vencimento).slice(0, 10))
      .sort()[0],
  );
});

Deno.test("cenário T42 monta exatamente rematricula mais 12 mensalidades e ignora legado incompleto", () => {
  const rematricula = rowAt(
    20,
    {
      tipo_lancamento: "REMATRICULA",
      parcela_numero: 0,
      descricao: "Rematrícula",
      data_vencimento: "2026-10-15",
      gateway_boleto_issued_at: "2026-08-28T12:00:00Z",
      gateway_financial_terms: {
        ...baneseDocumentFixtureAt(20, "2026-10-15", 100).financialTerms,
        discount: null,
      },
    },
    100,
    "2026-10-15",
  );
  const mensalidades = Array.from({ length: 12 }, (_, index) => {
    const monthIndex = 10 + index;
    const year = 2026 + Math.floor(monthIndex / 12);
    const month = String((monthIndex % 12) + 1).padStart(2, "0");
    const dueDate = `${year}-${month}-15`;
    const bank = baneseDocumentFixtureAt(21 + index, dueDate, 279.9);
    return rowAt(
      21 + index,
      {
        parcela_numero: index + 1,
        descricao: `Mensalidade ${index + 1}/12`,
        data_vencimento: dueDate,
        gateway_boleto_issued_at: "2026-08-28T12:00:00Z",
        gateway_financial_terms: bank.financialTerms as Record<string, unknown>,
      },
      279.9,
      dueDate,
    );
  });
  const legacyWithoutBankIdentity = rowAt(40, {
    gateway_provider: null,
    gateway_payment_method: null,
    gateway_boleto_nosso_numero: null,
    gateway_boleto_linha_digitavel: null,
    gateway_boleto_codigo_barras: null,
    gateway_financial_terms_confirmed_at: null,
  }, 279.9);
  const input = buildInput();
  const groups = buildBaneseDocumentGroups({
    ...input,
    receivables: [legacyWithoutBankIdentity, ...mensalidades, rematricula],
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].installmentCount, 13);
  assert.equal(groups[0].reenrollmentCount, 1);
  assert.equal(groups[0].monthlyCount, 12);
  assert.equal(groups[0].totalAmount, 3_458.8);
  assert.equal(groups[0].representativeReceivableId, rematricula.id);
  assert.equal(
    groups[0].receivableIds.includes(legacyWithoutBankIdentity.id),
    false,
  );
  assert.equal(groups[0].firstDueDate, "2026-10-15");
  assert.equal(groups[0].lastDueDate, "2027-10-15");
});

Deno.test("escopo autenticado falha fechado para cobrança ou turma de outro polo", () => {
  const input = buildInput();
  const scoped = buildBaneseDocumentGroups({ ...input, poloId: POLO_ID });
  assert.equal(scoped.length, 7);
  assert.equal(
    scoped.some((group) => group.receivableIds.includes(rowAt(4).id)),
    false,
  );
  assert.deepEqual(
    buildBaneseDocumentGroups({
      ...input,
      poloId: POLO_ID,
      classes: input.classes.map((row) => ({
        ...row,
        polo_id: OTHER_POLO_ID,
      })),
    }),
    [],
  );
});

Deno.test("aceita busca por nome sem acento ou CPF e nunca devolve CPF aberto", () => {
  const byName = buildBaneseDocumentGroups({ ...buildInput(), search: "joao" });
  const byCpf = buildBaneseDocumentGroups({
    ...buildInput(),
    search: "123.456.789-09",
  });
  assert.equal(byName.length, 8);
  assert.equal(byCpf.length, 8);
  assert.equal(maskStudentCpf("123.456.789-09"), "***.***.***-09");
  assert.ok(byCpf.every((group) => group.maskedCpf === "***.***.***-09"));
  assert.equal(JSON.stringify(byCpf).includes("12345678909"), false);
  assert.equal(JSON.stringify(byCpf).includes("123.456.789-09"), false);
  assert.equal(JSON.stringify(byCpf).includes(PAYER_ID), false);
  assert.equal(JSON.stringify(byCpf).includes(STUDENT_ID), false);
});

Deno.test("busca matrícula, curso e turma e cria facetas antes dos filtros", () => {
  const input = buildInput();
  const expanded = {
    ...input,
    receivables: [
      ...input.receivables,
      rowAt(11, {
        matricula_id: THIRD_ENROLLMENT_ID,
        turma_id: OTHER_CLASS_ID,
      }),
    ],
    enrollments: [
      ...input.enrollments,
      {
        id: THIRD_ENROLLMENT_ID,
        aluno_id: STUDENT_ID,
        turma_id: OTHER_CLASS_ID,
        data_matricula: "2026-03-20T12:00:00Z",
      },
    ],
    classes: [
      ...input.classes,
      {
        id: OTHER_CLASS_ID,
        nome: "Turma Enfermagem 2026",
        codigo: "ENF-2026",
        curso_id: OTHER_COURSE_ID,
        polo_id: POLO_ID,
      },
    ],
    courses: [
      ...input.courses,
      { id: OTHER_COURSE_ID, nome: "Técnico em Enfermagem" },
    ],
  };
  const allGroups = buildBaneseDocumentGroups(expanded);
  const filters = buildBaneseDocumentFilters(allGroups);
  const filtered = filterBaneseDocumentGroups(
    allGroups,
    OTHER_COURSE_ID,
    OTHER_CLASS_ID,
  );
  assert.equal(filters.courses.length, 2);
  assert.equal(filters.classes.length, 2);
  assert.equal(filtered.length, 1);
  assert.equal(
    buildBaneseDocumentGroups({ ...expanded, search: "enfermagem" }).length,
    1,
  );
  assert.equal(
    buildBaneseDocumentGroups({ ...expanded, search: "ENF-2026" }).length,
    1,
  );
  const enrollmentCode = filtered[0].enrollmentCode;
  const byEnrollment = buildBaneseDocumentGroups({
    ...expanded,
    search: enrollmentCode,
  });
  assert.ok(byEnrollment.length > 0);
  assert.ok(
    byEnrollment.every((group) => group.enrollmentCode === enrollmentCode),
  );
});

Deno.test("pagina somente depois de formar os grupos", () => {
  const groups = buildBaneseDocumentGroups(buildInput());
  const page = paginateBaneseDocumentGroups(groups, 2, 2);
  assert.equal(page.total, 8);
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 2);
  assert.equal(page.groups.length, 2);
});

Deno.test("grupo acima do limite do carnê falha fechado no catálogo", () => {
  const input = buildInput();
  const groups = buildBaneseDocumentGroups({
    ...input,
    receivables: Array.from({ length: 31 }, (_, index) => rowAt(index)),
  });
  assert.deepEqual(groups, []);
});

Deno.test("formata matrícula com a configuração acadêmica já existente", () => {
  assert.equal(
    formatEnrollmentCode(
      ENROLLMENT_ID,
      "2026-01-20T12:00:00Z",
      POLO_ID,
      {
        matriculaPrefix: "UNI-",
        matriculaDigits: 4,
        yearFormat: "yyyy",
        usePoloCode: false,
      },
    ),
    "UNI-20263107",
  );
});
