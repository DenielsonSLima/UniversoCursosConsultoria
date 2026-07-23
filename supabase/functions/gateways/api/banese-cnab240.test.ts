import assert from "node:assert/strict";
import {
  cnab240ByteLength,
  decodeCnab240Ansi,
  encodeCnab240Ansi,
  encodeCnab240File,
} from "./banese-cnab240.codec.ts";
import { parseCnab240Payload } from "./banese-cnab240.parser.ts";
import {
  parseCnabReasonCodes,
  validateBaneseCnab240Return,
} from "./banese-cnab240.validator.ts";

const fixed = (value: string, length: number, numeric = false) => {
  if (value.length > length) throw new Error(`Campo maior que ${length}.`);
  return numeric ? value.padStart(length, "0") : value.padEnd(length, " ");
};

const put = (
  record: string,
  start: number,
  end: number,
  value: string,
  numeric = false,
) =>
  record.slice(0, start - 1) +
  fixed(value, end - start + 1, numeric) +
  record.slice(end);

const baseRecord = () => " ".repeat(240);

const fileHeader = () => {
  let line = baseRecord();
  line = put(line, 1, 3, "047");
  line = put(line, 4, 7, "0000");
  line = put(line, 8, 8, "0");
  line = put(line, 143, 143, "2");
  line = put(line, 144, 151, "21072026");
  line = put(line, 164, 166, "101");
  return line;
};

const lotHeader = () => {
  let line = baseRecord();
  line = put(line, 1, 3, "047");
  line = put(line, 4, 7, "0001");
  line = put(line, 8, 8, "1");
  line = put(line, 9, 9, "T");
  line = put(line, 10, 11, "01");
  line = put(line, 14, 16, "060");
  return line;
};

const segmentT = (
  movement = "06",
  reason = "61",
  nossoNumero = "123456789",
  sequence = 1,
  nominalCents = "25000",
) => {
  let line = baseRecord();
  line = put(line, 1, 3, "047");
  line = put(line, 4, 7, "0001");
  line = put(line, 8, 8, "3");
  line = put(line, 9, 13, String(sequence), true);
  line = put(line, 14, 14, "T");
  line = put(line, 16, 17, movement, true);
  line = put(line, 38, 57, nossoNumero, true);
  line = put(line, 82, 96, nominalCents, true);
  line = put(line, 214, 223, reason);
  return line;
};

const segmentU = (
  movement = "06",
  occurrenceDate = "21072026",
  paidCents = "25000",
  sequence = 1,
) => {
  let line = baseRecord();
  line = put(line, 1, 3, "047");
  line = put(line, 4, 7, "0001");
  line = put(line, 8, 8, "3");
  line = put(line, 9, 13, String(sequence), true);
  line = put(line, 14, 14, "U");
  line = put(line, 16, 17, movement, true);
  line = put(line, 78, 92, paidCents, true);
  line = put(line, 138, 145, occurrenceDate, true);
  line = put(line, 214, 233, "0", true);
  return line;
};

const lotTrailer = () => {
  let line = baseRecord();
  line = put(line, 1, 3, "047");
  line = put(line, 4, 7, "0001");
  line = put(line, 8, 8, "5");
  line = put(line, 18, 23, "4", true);
  return line;
};

const fileTrailer = () => {
  let line = baseRecord();
  line = put(line, 1, 3, "047");
  line = put(line, 4, 7, "9999");
  line = put(line, 8, 8, "9");
  line = put(line, 18, 23, "1", true);
  line = put(line, 24, 29, "6", true);
  return line;
};

const goldenReturn = ({
  movement = "06",
  reason = "61",
  nossoNumero = "123456789",
  occurrenceDate = "21072026",
  nominalCents = "25000",
  paidCents = "25000",
  tSequence = 1,
  uSequence = 1,
}: {
  movement?: string;
  reason?: string;
  nossoNumero?: string;
  occurrenceDate?: string;
  nominalCents?: string;
  paidCents?: string;
  tSequence?: number;
  uSequence?: number;
} = {}) =>
  [
    fileHeader(),
    lotHeader(),
    segmentT(movement, reason, nossoNumero, tSequence, nominalCents),
    segmentU(movement, occurrenceDate, paidCents, uSequence),
    lotTrailer(),
    fileTrailer(),
  ].join("\r\n") + "\r\n";

const goldenRecords = () => goldenReturn().split("\r\n").slice(0, -1);

Deno.test("golden G038 repete sequencial em T/U e liquida motivo 61 via PIX", () => {
  const result = parseCnab240Payload(goldenReturn());

  assert.equal(result.summary.fileLines, 6);
  assert.equal(result.summary.errors, 0);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    lineNumber: 4,
    lote: "0001",
    nossoNumero: "123456789",
    movementCode: "06",
    nominalAmount: 250,
    paidAmount: 250,
    occurrenceDate: "2026-07-21",
    segmentTMovement: "06",
    liquidationReasonCodes: ["61"],
    settlementChannel: "PIX",
    paid: true,
    rawTLine: segmentT(),
    rawULine: segmentU(),
  });
});

Deno.test("movimento 09 e baixa, nao pagamento", () => {
  const result = parseCnab240Payload(
    goldenReturn({ movement: "09", reason: "09" }),
  );
  assert.equal(result.summary.errors, 0);
  assert.equal(result.events[0].movementCode, "09");
  assert.equal(result.events[0].paid, false);
  assert.equal(result.events[0].settlementChannel, null);
});

Deno.test("expoe valor nominal do T separado do valor pago no U", () => {
  const result = parseCnab240Payload(
    goldenReturn({ nominalCents: "30000", paidCents: "25000" }),
  );
  assert.equal(result.events[0].nominalAmount, 300);
  assert.equal(result.events[0].paidAmount, 250);
});

Deno.test("aceita nominal zero em retorno de rejeicao sem tratar como pagamento", () => {
  const result = parseCnab240Payload(
    goldenReturn({
      movement: "03",
      reason: "08",
      nominalCents: "0",
      paidCents: "0",
      occurrenceDate: "00000000",
    }),
  );
  assert.equal(result.summary.errors, 0);
  assert.equal(result.events[0].nominalAmount, 0);
  assert.equal(result.events[0].paid, false);
});

Deno.test("movimento 17 liquida como boleto quando nao ha motivo 61", () => {
  const result = parseCnab240Payload(
    goldenReturn({ movement: "17", reason: "04" }),
  );
  assert.equal(result.events[0].paid, true);
  assert.equal(result.events[0].settlementChannel, "BOLETO");
  assert.deepEqual(result.events[0].liquidationReasonCodes, ["04"]);
});

Deno.test("C047 aceita e preserva os pares Alfa do manual Banese v1.16", () => {
  const validAlphaCodes = [
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "A9",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "ZY",
    "ZZ",
    "ZW",
  ];

  for (const reason of validAlphaCodes) {
    const result = parseCnab240Payload(
      goldenReturn({
        movement: "03",
        reason,
        nominalCents: "0",
        paidCents: "0",
        occurrenceDate: "00000000",
      }),
    );
    assert.equal(result.summary.errors, 0, `C047 rejeitou ${reason}`);
    assert.deepEqual(result.events[0].liquidationReasonCodes, [reason]);
    assert.equal(result.events[0].paid, false);
  }

  const combined = parseCnab240Payload(
    goldenReturn({
      movement: "03",
      reason: "A1A9B1B5ZY",
      nominalCents: "0",
      paidCents: "0",
      occurrenceDate: "00000000",
    }),
  );
  assert.deepEqual(combined.events[0].liquidationReasonCodes, [
    "A1",
    "A9",
    "B1",
    "B5",
    "ZY",
  ]);
});

Deno.test("C047 rejeita Alfa fora do dominio, charset ou par completo", () => {
  for (const reason of ["C1", "a1", "A!", "A"]) {
    const result = parseCnab240Payload(
      goldenReturn({
        movement: "03",
        reason,
        nominalCents: "0",
        paidCents: "0",
        occurrenceDate: "00000000",
      }),
    );
    assert.equal(result.events.length, 0, `C047 aceitou ${reason}`);
    assert.ok(
      result.outcomes.some((item) => item.action === "invalid_reason_codes"),
    );
  }

  assert.deepEqual(parseCnabReasonCodes("A1"), {
    codes: [],
    invalidChunks: ["A1"],
  });
  assert.deepEqual(parseCnabReasonCodes("A1        X"), {
    codes: [],
    invalidChunks: ["A1        X"],
  });
});

Deno.test("Nosso Numero do correspondente no U nao substitui o Nosso Numero do T", () => {
  const result = parseCnab240Payload(goldenReturn({ nossoNumero: "15" }));
  assert.equal(result.summary.errors, 0);
  assert.equal(result.events[0].nossoNumero, "000000015");
});

Deno.test("rejeita registros com 239 ou 241 bytes sem completar ou truncar", () => {
  const shortRecords = goldenRecords();
  shortRecords[2] = shortRecords[2].slice(0, 239);
  const shortResult = parseCnab240Payload(shortRecords.join("\r\n"));
  assert.equal(shortResult.events.length, 0);
  assert.ok(
    shortResult.outcomes.some((item) =>
      item.action === "invalid_record_length"
    ),
  );

  const longRecords = goldenRecords();
  longRecords[2] += "X";
  const longResult = parseCnab240Payload(longRecords.join("\r\n"));
  assert.equal(longResult.events.length, 0);
  assert.ok(
    longResult.outcomes.some((item) => item.action === "invalid_record_length"),
  );
});

Deno.test("rejeita arquivo que nao pertence ao banco 047", () => {
  const records = goldenRecords();
  records[3] = put(records[3], 1, 3, "001");
  const validation = validateBaneseCnab240Return(records.join("\r\n"));
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((item) => item.code === "INVALID_BANK"));
});

Deno.test("rejeita data AAAAMMDD no campo DDMMAAAA", () => {
  const result = parseCnab240Payload(
    goldenReturn({ occurrenceDate: "20260721" }),
  );
  assert.equal(result.events.length, 0);
  assert.ok(
    result.outcomes.some((item) => item.action === "invalid_occurrence_date"),
  );
});

Deno.test("rejeita liquidacao 06 sem valor pago", () => {
  const result = parseCnab240Payload(goldenReturn({ paidCents: "0" }));
  assert.equal(result.events.length, 0);
  assert.ok(
    result.outcomes.some((item) => item.action === "invalid_paid_amount"),
  );
});

Deno.test("rejeita T e U adjacentes com sequenciais diferentes", () => {
  const result = parseCnab240Payload(
    goldenReturn({ tSequence: 1, uSequence: 2 }),
  );
  assert.equal(result.events.length, 0);
  assert.ok(
    result.outcomes.some((item) => item.action === "segment_sequence_mismatch"),
  );
});

Deno.test("codec preserva ANSI de um byte e rejeita caractere fora do layout", () => {
  const ansiRecord = `COBRANÇA${" ".repeat(232)}`;
  assert.equal(cnab240ByteLength(ansiRecord), 240);
  const encoded = encodeCnab240Ansi(ansiRecord);
  assert.equal(encoded.length, 240);
  assert.equal(decodeCnab240Ansi(encoded), ansiRecord);

  assert.equal(cnab240ByteLength(`😀${" ".repeat(239)}`), null);
  assert.throws(
    () => encodeCnab240File([`😀${" ".repeat(239)}`]),
    /nao ANSI/i,
  );
});

Deno.test("codec exporta registros de 240 bytes com CRLF", () => {
  const records = goldenRecords();
  const encoded = encodeCnab240File(records);
  assert.equal(encoded.length, records.length * 240 + records.length * 2);
});
