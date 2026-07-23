import assert from "node:assert/strict";
import {
  isMercadoPagoSignatureTimestampFresh,
  MERCADO_PAGO_SIGNATURE_TOLERANCE_MS,
  parseMercadoPagoSignatureTimestamp,
} from "./mercado-pago-signature.ts";

const NOW_MS = Date.UTC(2026, 6, 21, 12, 0, 0);

Deno.test("interpreta timestamp Mercado Pago em segundos", () => {
  assert.equal(
    parseMercadoPagoSignatureTimestamp(String(NOW_MS / 1000)),
    NOW_MS,
  );
});

Deno.test("interpreta timestamp Mercado Pago em milissegundos", () => {
  assert.equal(
    parseMercadoPagoSignatureTimestamp(String(NOW_MS)),
    NOW_MS,
  );
});

Deno.test("rejeita timestamp Mercado Pago invalido ou ambiguo", () => {
  for (const value of ["", "abc", "-1", "17200000000", "172000000000"]) {
    assert.equal(parseMercadoPagoSignatureTimestamp(value), null);
  }
});

Deno.test("aceita timestamp dentro da janela documentada", () => {
  assert.equal(
    isMercadoPagoSignatureTimestampFresh(
      String(NOW_MS - MERCADO_PAGO_SIGNATURE_TOLERANCE_MS),
      NOW_MS,
    ),
    true,
  );
});

Deno.test("rejeita timestamp antigo", () => {
  assert.equal(
    isMercadoPagoSignatureTimestampFresh(
      String(NOW_MS - MERCADO_PAGO_SIGNATURE_TOLERANCE_MS - 1),
      NOW_MS,
    ),
    false,
  );
});

Deno.test("rejeita timestamp no futuro alem da tolerancia", () => {
  assert.equal(
    isMercadoPagoSignatureTimestampFresh(
      String(NOW_MS + MERCADO_PAGO_SIGNATURE_TOLERANCE_MS + 1),
      NOW_MS,
    ),
    false,
  );
});
