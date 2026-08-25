import assert from "node:assert/strict";
import { logPortalHandlerFailure } from "./handler-error-log.ts";

Deno.test("log interno preserva fase e código sem copiar mensagem hostil", () => {
  const originalConsoleError = console.error;
  const entries: unknown[][] = [];
  console.error = (...values: unknown[]) => entries.push(values);
  try {
    logPortalHandlerFailure("acao-segura", "fase-segura", {
      code: "XX000",
      message: "db-host.internal token=segredo-operacional",
    });
  } finally {
    console.error = originalConsoleError;
  }

  const serialized = JSON.stringify(entries);
  assert.match(serialized, /acao-segura/);
  assert.match(serialized, /fase-segura/);
  assert.match(serialized, /XX000/);
  assert.doesNotMatch(serialized, /db-host|segredo-operacional/);
});
