import {
  asRecord,
  assertBoolean,
  assertCanonicalAssetUrl,
  assertCanonicalWatermarkSource,
  assertExactKeys,
  assertNumber,
  assertText,
  assertTimestamp,
  fail,
  nearlyEqual,
} from "./diario-pdf.contract.validation-core.ts";

export const assertInstitutionAndAssets = (
  snapshot: Record<string, unknown>,
  template: Record<string, unknown>,
) => {
  const institutionalIdentity = asRecord(
    snapshot.institutionalIdentity,
    "institutionalIdentity",
  );
  assertExactKeys(
    institutionalIdentity,
    ["institution", "logoUrl", "watermarkUrl"],
    ["watermark"],
    "institutionalIdentity",
  );
  const institution = asRecord(
    institutionalIdentity.institution,
    "institutionalIdentity.institution",
  );
  const institutionKeys = [
    "name",
    "legalName",
    "cnpj",
    "address",
    "number",
    "complement",
    "neighborhood",
    "city",
    "state",
    "postalCode",
    "phone",
    "email",
    "isHeadquarters",
  ] as const;
  assertExactKeys(
    institution,
    institutionKeys,
    [],
    "institutionalIdentity.institution",
  );
  institutionKeys.slice(0, -1).forEach((key) =>
    assertText(institution[key], `institutionalIdentity.institution.${key}`, {
      allowEmpty: ["legalName", "complement"].includes(key),
      max: 300,
    })
  );
  assertBoolean(
    institution.isHeadquarters,
    "institutionalIdentity.institution.isHeadquarters",
  );
  assertCanonicalAssetUrl(
    institutionalIdentity.logoUrl,
    "institutionalIdentity.logoUrl",
  );
  assertCanonicalWatermarkSource(
    institutionalIdentity.watermarkUrl,
    "institutionalIdentity.watermarkUrl",
    true,
  );
  if (institutionalIdentity.watermark !== undefined) {
    if (institutionalIdentity.watermarkUrl === null) {
      fail(
        "institutionalIdentity.watermark",
        "exige marca-d'água institucional",
      );
    }
    const watermark = asRecord(
      institutionalIdentity.watermark,
      "institutionalIdentity.watermark",
    );
    assertExactKeys(
      watermark,
      ["url", "opacity", "scale", "rotate"],
      [],
      "institutionalIdentity.watermark",
    );
    assertCanonicalWatermarkSource(
      watermark.url,
      "institutionalIdentity.watermark.url",
    );
    if (
      typeof watermark.url !== "string" ||
      !watermark.url.startsWith("data:image/")
    ) {
      fail(
        "institutionalIdentity.watermark.url",
        "deve usar o data URI institucional congelado",
      );
    }
    if (watermark.url !== institutionalIdentity.watermarkUrl) {
      fail(
        "institutionalIdentity.watermark.url",
        "diverge da referência institucional congelada",
      );
    }
    assertNumber(
      watermark.opacity,
      "institutionalIdentity.watermark.opacity",
      0,
      1,
    );
    assertNumber(
      watermark.scale,
      "institutionalIdentity.watermark.scale",
      10,
      100,
      true,
    );
    if (watermark.scale % 5 !== 0) {
      fail(
        "institutionalIdentity.watermark.scale",
        "deve seguir os incrementos do modelo oficial",
      );
    }
    assertBoolean(
      watermark.rotate,
      "institutionalIdentity.watermark.rotate",
    );
  }

  const assetSources = asRecord(snapshot.assetSources, "assetSources");
  assertExactKeys(
    assetSources,
    ["coverUrl", "backCoverUrl", "headerLogoUrl", "watermarkUrl"],
    [],
    "assetSources",
  );
  assertCanonicalAssetUrl(assetSources.coverUrl, "assetSources.coverUrl", true);
  assertCanonicalAssetUrl(
    assetSources.backCoverUrl,
    "assetSources.backCoverUrl",
    true,
  );
  assertCanonicalAssetUrl(
    assetSources.headerLogoUrl,
    "assetSources.headerLogoUrl",
  );
  assertCanonicalWatermarkSource(
    assetSources.watermarkUrl,
    "assetSources.watermarkUrl",
    true,
  );
  if (
    assetSources.coverUrl !== template.capaUrl ||
    assetSources.backCoverUrl !== template.contracapaUrl ||
    assetSources.headerLogoUrl !== institutionalIdentity.logoUrl ||
    assetSources.watermarkUrl !== institutionalIdentity.watermarkUrl
  ) {
    fail(
      "assetSources",
      "referências divergem do template ou identidade institucional",
    );
  }
};

export const assertClosure = (
  snapshot: Record<string, unknown>,
  disciplina: Record<string, unknown>,
  totalHours: number,
) => {
  const closure = asRecord(snapshot.closure, "closure");
  assertExactKeys(
    closure,
    ["lock", "hoursCompleted", "requiredHours", "snapshotAt"],
    [],
    "closure",
  );
  if (closure.lock !== "PROFESSOR") {
    fail("closure.lock", "diário precisa estar enviado para revisão");
  }
  assertNumber(closure.hoursCompleted, "closure.hoursCompleted", 0, 100_000);
  assertNumber(closure.requiredHours, "closure.requiredHours", 0.01, 100_000);
  assertTimestamp(closure.snapshotAt, "closure.snapshotAt");
  if ((closure.hoursCompleted as number) < (closure.requiredHours as number)) {
    fail("closure.hoursCompleted", "carga horária ainda incompleta");
  }
  if (!nearlyEqual(closure.hoursCompleted as number, totalHours, 0.001)) {
    fail("closure.hoursCompleted", "diverge da soma das sessões congeladas");
  }
  if (
    !nearlyEqual(
      closure.requiredHours as number,
      disciplina.cargaHoraria as number,
      0.001,
    )
  ) {
    fail("closure.requiredHours", "diverge da carga horária da disciplina");
  }
  if (closure.snapshotAt !== snapshot.generatedAt) {
    fail("generatedAt", "deve coincidir com closure.snapshotAt");
  }
};
