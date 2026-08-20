import assert from "node:assert/strict";
import test from "node:test";

import type { ElectronicSignatureStampSlot } from "./assinatura-eletronica.contract";
import {
  clampSignatureStampPlacement,
  getSignatureStampVisiblePageSize,
  moveSignatureStampPlacement,
  signatureStampPlacementsOverlap,
  signatureStampPlacementToPdfRect,
  signatureStampPlacementToPdfRectOnPage,
  signatureStampPlacementToTopLeftRect,
  signatureStampVisibleSpaceToPdfMatrix,
} from "./signature-stamp-placement";

const slot = (
  overrides: Partial<ElectronicSignatureStampSlot> = {},
): ElectronicSignatureStampSlot => ({
  role: "PROFESSOR",
  pageTarget: "LAST_PAGE",
  coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
  xBp: 10_000,
  yBp: 20_000,
  widthBp: 30_000,
  heightBp: 10_000,
  ...overrides,
});

test("movimento do carimbo é limitado à última página normalizada", () => {
  const moved = moveSignatureStampPlacement(slot(), 90_000, 90_000);
  assert.deepEqual(moved, {
    pageTarget: "LAST_PAGE",
    coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
    xBp: 62_000,
    yBp: 86_000,
    widthBp: 38_000,
    heightBp: 14_000,
  });
});

test("redimensionamento mantém os limites de dimensão e página", () => {
  const clamped = clampSignatureStampPlacement(slot({
    xBp: 95_000,
    yBp: 95_000,
    widthBp: 2_000,
    heightBp: 50_000,
  }));
  assert.equal(clamped.widthBp, 38_000);
  assert.equal(clamped.heightBp, 25_000);
  assert.equal(clamped.xBp, 62_000);
  assert.equal(clamped.yBp, 75_000);
});

test("colisão considera os dois papéis na mesma última página", () => {
  const professor = slot();
  const overlapping = slot({ role: "COORDENADOR", xBp: 35_000, yBp: 25_000 });
  const separate = slot({ role: "COORDENADOR", xBp: 50_000, yBp: 25_000 });
  assert.equal(signatureStampPlacementsOverlap(professor, overlapping), true);
  assert.equal(signatureStampPlacementsOverlap(professor, separate), false);
});

test("conversões preservam a origem superior no DOM e invertem Y no PDF nativo", () => {
  const placement = slot();
  assert.deepEqual(signatureStampPlacementToTopLeftRect(placement, 200, 300), {
    x: 20,
    y: 60,
    width: 60,
    height: 30,
  });
  assert.deepEqual(signatureStampPlacementToPdfRect(placement, 200, 300), {
    x: 20,
    y: 210,
    width: 60,
    height: 30,
  });
});

test("conversão respeita CropBox deslocada em página sem rotação", () => {
  const geometry = {
    cropBox: { x: 15, y: 25, width: 200, height: 300 },
    rotationDegrees: 0 as const,
  };
  assert.deepEqual(signatureStampPlacementToPdfRectOnPage(slot(), geometry), {
    x: 35,
    y: 235,
    width: 60,
    height: 30,
  });
  assert.deepEqual(signatureStampVisibleSpaceToPdfMatrix(geometry), {
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    e: 15,
    f: 25,
  });
});

test("conversão mantém o retângulo visível nas rotações canônicas do PDF", () => {
  const cropBox = { x: 10, y: 20, width: 200, height: 300 };
  assert.deepEqual(
    getSignatureStampVisiblePageSize({ cropBox, rotationDegrees: 90 }),
    {
      width: 300,
      height: 200,
    },
  );
  assert.deepEqual(
    signatureStampPlacementToPdfRectOnPage(slot(), {
      cropBox,
      rotationDegrees: 90,
    }),
    {
      x: 50,
      y: 50,
      width: 20,
      height: 90,
    },
  );
  assert.deepEqual(
    signatureStampPlacementToPdfRectOnPage(slot(), {
      cropBox,
      rotationDegrees: 180,
    }),
    {
      x: 130,
      y: 80,
      width: 60,
      height: 30,
    },
  );
  assert.deepEqual(
    signatureStampPlacementToPdfRectOnPage(slot(), {
      cropBox,
      rotationDegrees: 270,
    }),
    {
      x: 150,
      y: 200,
      width: 20,
      height: 90,
    },
  );
  assert.deepEqual(
    signatureStampVisibleSpaceToPdfMatrix({ cropBox, rotationDegrees: 270 }),
    {
      a: 0,
      b: -1,
      c: 1,
      d: 0,
      e: 10,
      f: 320,
    },
  );
});
