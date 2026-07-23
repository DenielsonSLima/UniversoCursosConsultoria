import assert from "node:assert/strict";
import { installmentsFor } from "./normalizers.ts";

Deno.test("installmentsFor ignora null e preserva parcelamento do recebivel", () => {
  assert.equal(
    installmentsFor(
      { installments: null },
      { gateway_installments: 6 },
    ),
    6,
  );
});

Deno.test("installmentsFor ignora string vazia e usa fallback final", () => {
  assert.equal(
    installmentsFor(
      { installments: "" },
      { gateway_installments: null },
    ),
    1,
  );
});
