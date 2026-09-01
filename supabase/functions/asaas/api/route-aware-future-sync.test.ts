import assert from "node:assert/strict";
import { syncRouteAwareFutureInstallments } from "./route-aware-future-sync.ts";

Deno.test(
  "política técnica manual interrompe o bulk antes de configuração, segredo ou mutação",
  async () => {
    const calls: string[] = [];
    const admin = {
      rpc: (name: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${name}`);
        assert.deepEqual(args, { p_matricula_id: "matricula-manual" });
        return Promise.resolve({ data: true, error: null });
      },
      from: (table: string) => {
        calls.push(`from:${table}`);
        throw new Error("O bulk não deveria acessar tabelas no modo manual.");
      },
    };

    const result = await syncRouteAwareFutureInstallments(
      admin,
      "matricula-manual",
      "sandbox",
    );

    assert.deepEqual(result, {
      success: true,
      skipped: true,
      count: 0,
      reason:
        "Emissão automática futura desativada pela política manual do curso técnico.",
    });
    assert.deepEqual(calls, [
      "rpc:should_skip_technical_manual_future_sync",
    ]);
  },
);
