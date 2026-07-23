import assert from "node:assert/strict";
import { cleanupFailedCheckout } from "./checkout-cleanup.ts";

Deno.test("cleanup perdedor nao apaga recebivel nem cancela matricula concorrente", async () => {
  let databaseCalls = 0;
  const admin = new Proxy({}, {
    get() {
      databaseCalls += 1;
      throw new Error("cleanup nao pode tocar no banco");
    },
  });

  await cleanupFailedCheckout(admin, {
    checkoutMatriculaId: "matricula-winner",
    checkoutReceivableId: "receivable-winner",
    paymentCreated: false,
  }, false);

  assert.equal(databaseCalls, 0);
});
