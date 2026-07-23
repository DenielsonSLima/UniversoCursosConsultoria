import assert from "node:assert/strict";
import { calculateBaneseNossoNumero } from "../../banese/core/adapter/utils.ts";
import {
  cnab240Field,
  decodeCnab240Ansi,
  splitCnab240Lines,
} from "./banese-cnab240.codec.ts";
import {
  type BaneseCnab240RemittanceInput,
  type BaneseCnab240RemittanceTitleInput,
  buildBaneseCnab240Remittance,
} from "./banese-cnab240.remittance.ts";

const baseTitle = (): BaneseCnab240RemittanceTitleInput => ({
  entryType: "CNAB240_NEW_TITLE",
  registeredByApi: false,
  ourNumber: "000000015",
  documentNumber: "PARC-001",
  companyControlNumber: "RECEBIVEL-001",
  documentSpecies: 21,
  issueDate: "2026-07-21",
  writeOffDays: 30,
  payer: {
    name: "ALUNO HOMOLOGAÇÃO",
    document: "85742355004",
    address: "RUA DE TESTE, 100",
    district: "CENTRO",
    postalCode: "49000000",
    city: "ARACAJU",
    state: "SE",
  },
  financialTerms: {
    nominalAmount: 279.9,
    dueDate: "2026-08-10",
    discount: { type: "fixed", value: 19.9 },
    interest: { type: "monthly-percentage", value: 5 },
    penalty: null,
  },
});

const baseInput = (): BaneseCnab240RemittanceInput => ({
  edi7: "123456",
  agreement: "15528",
  nsa: 42,
  generatedAt: "2026-07-21T14:05:06Z",
  beneficiary: {
    name: "UNIVERSO CURSOS E CONSULTORIA",
    document: "13278137000154",
    agency: "033",
    accountNumber: "03100649",
    accountDigit: "0",
  },
  titles: [baseTitle()],
});

Deno.test("gera remessa v1.16 P/Q sem R, CRLF e filename Banese", () => {
  const result = buildBaneseCnab240Remittance(baseInput());

  assert.equal(
    result.fileName,
    "COB.240.123456.20260721.00042.15528.REM",
  );
  assert.equal(result.titleCount, 1);
  assert.equal(result.recordCount, 6);
  assert.equal(result.totalAmount, 279.9);
  assert.equal(result.records.length, 6);
  assert.equal(result.bytes.length, 6 * 240 + 6 * 2);
  assert.ok(result.records.every((record) => record.length === 240));
  assert.ok(
    result.records.every((record) => cnab240Field(record, 1, 3) === "047"),
  );

  const text = decodeCnab240Ansi(result.bytes);
  assert.ok(text.endsWith("\r\n"));
  assert.equal(splitCnab240Lines(text).length, 6);
  assert.equal(cnab240Field(result.records[0], 143, 143), "1");
  assert.equal(cnab240Field(result.records[0], 152, 157), "110506");
  assert.equal(cnab240Field(result.records[0], 158, 163), "000042");
  assert.equal(cnab240Field(result.records[0], 164, 166), "101");
  assert.equal(cnab240Field(result.records[0], 53, 57), "00000");
  assert.equal(cnab240Field(result.records[0], 58, 58), " ");
  assert.equal(cnab240Field(result.records[0], 59, 70), "0".repeat(12));
  assert.equal(cnab240Field(result.records[0], 71, 72), "  ");
  assert.equal(cnab240Field(result.records[1], 9, 9), "R");
  assert.equal(cnab240Field(result.records[1], 14, 16), "060");
  assert.equal(cnab240Field(result.records[1], 54, 58), "00000");
  assert.equal(cnab240Field(result.records[1], 59, 59), " ");
  assert.equal(cnab240Field(result.records[1], 60, 71), "0".repeat(12));
  assert.equal(cnab240Field(result.records[1], 72, 73), "  ");
  assert.equal(cnab240Field(result.records[1], 184, 199), "0".repeat(16));

  const segmentP = result.records[2];
  const segmentQ = result.records[3];
  assert.equal(cnab240Field(segmentP, 14, 14), "P");
  assert.equal(cnab240Field(segmentQ, 14, 14), "Q");
  assert.equal(cnab240Field(segmentP, 9, 13), "00001");
  assert.equal(cnab240Field(segmentQ, 9, 13), "00001");
  assert.equal(cnab240Field(segmentP, 16, 17), "01");
  assert.equal(cnab240Field(segmentP, 18, 22), "00000");
  assert.equal(cnab240Field(segmentP, 23, 23), " ");
  assert.equal(cnab240Field(segmentP, 24, 35), "0".repeat(12));
  assert.equal(cnab240Field(segmentP, 36, 37), "  ");
  assert.equal(cnab240Field(segmentP, 78, 85), "10082026");
  assert.equal(cnab240Field(segmentP, 86, 100), "27990".padStart(15, "0"));
  assert.equal(cnab240Field(segmentP, 118, 118), "2");
  assert.equal(cnab240Field(segmentP, 119, 126), "11082026");
  assert.equal(cnab240Field(segmentP, 127, 141), "500".padStart(15, "0"));
  assert.equal(cnab240Field(segmentP, 142, 142), "1");
  assert.equal(cnab240Field(segmentP, 151, 165), "1990".padStart(15, "0"));
  assert.equal(cnab240Field(segmentQ, 19, 33), "85742355004".padEnd(15, " "));

  const lotTrailer = result.records[4];
  const fileTrailer = result.records[5];
  assert.equal(cnab240Field(lotTrailer, 18, 23), "000004");
  assert.equal(cnab240Field(lotTrailer, 24, 29), "000001");
  assert.equal(cnab240Field(lotTrailer, 30, 46), "27990".padStart(17, "0"));
  assert.equal(cnab240Field(fileTrailer, 18, 23), "000001");
  assert.equal(cnab240Field(fileTrailer, 24, 29), "000006");
});

Deno.test("inclui R somente quando existe multa e repete G038", () => {
  const input = baseInput();
  input.titles[0].financialTerms.penalty = { type: "fixed", value: 5 };
  const result = buildBaneseCnab240Remittance(input);

  assert.equal(result.recordCount, 7);
  const segments = result.records
    .filter((record) => cnab240Field(record, 8, 8) === "3")
    .map((record) => cnab240Field(record, 14, 14));
  assert.deepEqual(segments, ["P", "Q", "R"]);
  const segmentR = result.records[4];
  assert.equal(cnab240Field(segmentR, 9, 13), "00001");
  assert.equal(cnab240Field(segmentR, 66, 66), "1");
  assert.equal(cnab240Field(segmentR, 67, 74), "11082026");
  assert.equal(cnab240Field(segmentR, 75, 89), "500".padStart(15, "0"));
  assert.equal(cnab240Field(result.records[5], 18, 23), "000005");
  assert.equal(cnab240Field(result.records[6], 24, 29), "000007");
});

Deno.test("incrementa G038 por titulo, mantendo todos os seus segmentos iguais", () => {
  const input = baseInput();
  const second = baseTitle();
  second.ourNumber = calculateBaneseNossoNumero("033", "00000002");
  second.documentNumber = "PARC-002";
  second.companyControlNumber = "RECEBIVEL-002";
  second.financialTerms = {
    nominalAmount: 120.1,
    dueDate: "2026-09-10",
    penalty: { type: "percentage", value: 2 },
  };
  input.titles.push(second);

  const result = buildBaneseCnab240Remittance(input);
  const details = result.records.filter((record) =>
    cnab240Field(record, 8, 8) === "3"
  );
  assert.deepEqual(
    details.map((record) => [
      cnab240Field(record, 14, 14),
      cnab240Field(record, 9, 13),
    ]),
    [["P", "00001"], ["Q", "00001"], ["P", "00002"], ["Q", "00002"], [
      "R",
      "00002",
    ]],
  );
  assert.equal(result.totalAmount, 400);
  assert.equal(result.titleCount, 2);
  assert.equal(result.recordCount, 9);
});

Deno.test("rejeita EDI7 ou NSA fora do contrato", () => {
  assert.throws(
    () => buildBaneseCnab240Remittance({ ...baseInput(), edi7: "12345" }),
    /EDI7.*6 digitos/i,
  );
  assert.throws(
    () => buildBaneseCnab240Remittance({ ...baseInput(), edi7: "ABC456" }),
    /EDI7.*6 digitos/i,
  );
  assert.throws(
    () => buildBaneseCnab240Remittance({ ...baseInput(), nsa: 0 }),
    /NSA.*1.*99999/i,
  );
  assert.throws(
    () => buildBaneseCnab240Remittance({ ...baseInput(), nsa: 100_000 }),
    /NSA.*1.*99999/i,
  );
});

Deno.test("exclui titulo registrado ou sem flag explicita de API", () => {
  const registered = baseInput();
  (registered.titles[0] as unknown as { registeredByApi: boolean })
    .registeredByApi = true;
  assert.throws(
    () => buildBaneseCnab240Remittance(registered),
    /registrado.*API/i,
  );

  const missingFlag = baseInput();
  delete (missingFlag.titles[0] as unknown as { registeredByApi?: boolean })
    .registeredByApi;
  assert.throws(
    () => buildBaneseCnab240Remittance(missingFlag),
    /registrado.*API/i,
  );

  const wrongEntry = baseInput();
  (wrongEntry.titles[0] as unknown as { entryType: string }).entryType =
    "API_TITLE";
  assert.throws(
    () => buildBaneseCnab240Remittance(wrongEntry),
    /CNAB240_NEW_TITLE/i,
  );
});

Deno.test("rejeita Nosso Numero com DV invalido ou duplicado", () => {
  const invalid = baseInput();
  invalid.titles[0].ourNumber = "000000014";
  assert.throws(
    () => buildBaneseCnab240Remittance(invalid),
    /DV.*Nosso Numero/i,
  );

  const duplicate = baseInput();
  duplicate.titles.push(baseTitle());
  assert.throws(
    () => buildBaneseCnab240Remittance(duplicate),
    /Nosso Numero.*duplicado/i,
  );
});

Deno.test("rejeita percentual financeiro que CNAB nao representa em 2 decimais", () => {
  const input = baseInput();
  input.titles[0].financialTerms.interest = {
    type: "monthly-percentage",
    value: 5.123,
  };
  assert.throws(
    () => buildBaneseCnab240Remittance(input),
    /Juros.*duas casas decimais/i,
  );
});
