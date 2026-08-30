import assert from "node:assert/strict";
import {
  canLaunchAt,
  createLaunchPacing,
  remainingBaneseQueryBudgetMs,
  scheduledLaunchAt,
} from "./pacing.ts";

const STARTED_AT = 1_000_000;
const PROCESSING_STARTED_AT = STARTED_AT + 1_000;

const assertProfileSchedule = (targetTitles: number) => {
  const pacing = createLaunchPacing(
    STARTED_AT,
    PROCESSING_STARTED_AT,
    targetTitles,
  );
  const launches = Array.from(
    { length: targetTitles },
    (_, index) => scheduledLaunchAt(pacing, index),
  );
  const lastLaunchAt = launches.at(-1) ?? PROCESSING_STARTED_AT;

  assert.equal(launches.length, targetTitles);
  assert.equal(launches[0], PROCESSING_STARTED_AT);
  assert.ok(lastLaunchAt < pacing.launchDeadline);
  assert.ok(pacing.launchDeadline - lastLaunchAt >= 2_000);
  assert.ok(
    launches.every((launchAt, index) => (
      index === 0 || launchAt > launches[index - 1]
    )) || targetTitles === 1,
  );
  assert.equal(
    launches.filter((launchAt) => canLaunchAt(pacing, launchAt + 2_000)).length,
    targetTitles,
  );

  return { pacing, lastLaunchAt };
};

Deno.test("agenda P1, P2, P3, P9 e P10 como robustez extra", () => {
  for (const targetTitles of [1, 2, 3, 30, 60]) {
    assertProfileSchedule(targetTitles);
  }
});

Deno.test("P2 lança o segundo título no meio da janela, longe do deadline", () => {
  const { pacing, lastLaunchAt } = assertProfileSchedule(2);

  assert.equal(pacing.launchIntervalMs, 11_500);
  assert.equal(lastLaunchAt, pacing.processingStartedAt + 11_500);
  assert.equal(canLaunchAt(pacing, lastLaunchAt + 2_000), true);
});

Deno.test("tolera deriva até o deadline e bloqueia somente depois do limite", () => {
  const { pacing, lastLaunchAt } = assertProfileSchedule(60);
  const driftBudgetMs = pacing.launchDeadline - lastLaunchAt;

  assert.ok(driftBudgetMs >= 2_000);
  assert.equal(canLaunchAt(pacing, lastLaunchAt + driftBudgetMs - 1), true);
  assert.equal(canLaunchAt(pacing, pacing.launchDeadline), false);
  assert.equal(canLaunchAt(pacing, pacing.launchDeadline + 1), false);
});

Deno.test("não lança quando a preparação consumiu a janela de consulta", () => {
  for (
    const processingStartedAt of [
      STARTED_AT + 32_000,
      STARTED_AT + 50_000,
    ]
  ) {
    const pacing = createLaunchPacing(STARTED_AT, processingStartedAt, 2);

    assert.equal(pacing.launchDeadline, processingStartedAt);
    assert.equal(scheduledLaunchAt(pacing, 0), processingStartedAt);
    assert.equal(canLaunchAt(pacing, processingStartedAt), false);
  }
});

Deno.test("P3 usa a janela global restante sem cortar cada consulta em 8 segundos", () => {
  const pacing = createLaunchPacing(
    STARTED_AT,
    PROCESSING_STARTED_AT,
    40,
  );

  assert.equal(
    remainingBaneseQueryBudgetMs(pacing, PROCESSING_STARTED_AT),
    33_000,
  );
  assert.ok(
    remainingBaneseQueryBudgetMs(pacing, pacing.launchDeadline - 1) > 8_000,
  );
  assert.equal(
    remainingBaneseQueryBudgetMs(pacing, pacing.queryDeadline + 1),
    250,
  );
});
