import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";

import { createDiaryPdfSemanticManifest } from "./diary-pdf-semantic-manifest.ts";
import {
  applyElectronicSignatureStamps,
  freezeDiaryPdfSignatureTarget,
  inspectPdfOriginal,
} from "./pdf-document-signature.server.ts";
import { createSignedPdfArtifacts } from "../../gestor/secretaria/assinatura-eletronica/signature-pdf-artifacts.server.ts";

import {
  ONE_PIXEL_PNG,
  VERIFICATION_URL,
  PROFESSOR_PARTICIPANT_ID,
  COORDINATOR_PARTICIPANT_ID,
  CONTENT_LAYOUT,
  GLOBAL_AUTO_LAYOUT,
  GLOBAL_STAMP_TEMPLATE,
  stamps,
  globalTemplateStamps,
  createVectorPdf,
  diaryManifest,
  extractPdfText,
  editorFixture,
} from "./pdf-document-signature.server.fixtures.ts";

test("Diário rejeita conclusão com CONTA_E_PIN em vez de senha reautenticada", async () => {
  const originalBytes = await createVectorPdf({ landscape: true });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(3, false),
  });

  await assert.rejects(
    () =>
      createSignedPdfArtifacts({
        originalBytes,
        frozenTarget,
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
        receiptPayload: {
          institution: {
            name: "Universo Cursos e Consultoria",
            legalName: "",
            cnpj: "00.000.000/0000-00",
            address: "Avenida Exemplo",
            number: "100",
            complement: "",
            neighborhood: "Centro",
            city: "Maceio",
            state: "AL",
            postalCode: "57000-000",
            phone: "(82) 00000-0000",
            email: "documento@example.invalid",
            isHeadquarters: true,
          },
          logo: null,
          institutionalWatermark: null,
          presentation: {
            policyName: "Política do Diário de Classe",
            policyVersionLabel: "Versão 1",
            confirmationMessage: "Confirmação do documento.",
            receiptTitle: "Comprovante de Assinatura Eletrônica",
            receiptMessage: "Confira a autenticidade pelo validador público.",
            editor: editorFixture(),
          },
          document: {
            type: "Diário de Classe",
            reference: "DIARIO-1",
            version: "1",
          },
          status: "ASSINADO",
          participants: [
            {
              id: PROFESSOR_PARTICIPANT_ID,
              name: "Professora Ana Souza",
              role: "Professor",
            },
            {
              id: COORDINATOR_PARTICIPANT_ID,
              name: "Coordenador Bruno Lima",
              role: "Coordenador de curso",
            },
          ],
          events: [
            {
              type: "ASSINATURA_CONCLUIDA",
              occurredAt: "2026-08-19T16:14:15Z",
              participantId: PROFESSOR_PARTICIPANT_ID,
              method: "CONTA_E_PIN",
            },
            {
              type: "ASSINATURA_CONCLUIDA",
              occurredAt: "2026-08-19T16:16:17Z",
              participantId: COORDINATOR_PARTICIPANT_ID,
              method: "CONTA_E_PIN",
            },
          ],
          validation: { code: "DIARIO-1", url: VERIFICATION_URL },
        },
      }),
    /assinatura do Diário exige conclusão com senha reautenticada/i,
  );
});

test("alvo congelado rejeita página válida que diverge do manifesto do Diário", async () => {
  const originalBytes = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(4, true),
  });
  const forgedPage = (await inspectPdfOriginal(originalBytes)).pages[1];

  await assert.rejects(
    () =>
      applyElectronicSignatureStamps({
        originalBytes,
        frozenTarget: {
          ...frozenTarget,
          targetPageIndex: 1,
          targetPage: forgedPage,
        },
        layout: "HORIZONTAL",
        contentLayout: CONTENT_LAYOUT,
        stampPngBytes: ONE_PIXEL_PNG,
        verificationUrl: VERIFICATION_URL,
        stamps: stamps(),
      }),
    /alvo congelado diverge do manifesto semântico/i,
  );
});

const backCoverSlots = [
  {
    role: "PROFESSOR",
    fieldId: "contracapaAssinaturaProfessor",
    pageTarget: "DIARIO_BACK_COVER",
    coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
    xBp: 10_000,
    yBp: 78_000,
    widthBp: 38_000,
    heightBp: 14_000,
  },
  {
    role: "COORDENADOR",
    fieldId: "contracapaAssinaturaCoordenador",
    pageTarget: "DIARIO_BACK_COVER",
    coordinateSpace: "PAGE_TOP_LEFT_BP_V1",
    xBp: 52_000,
    yBp: 78_000,
    widthBp: 38_000,
    heightBp: 14_000,
  },
] as const;

const backCoverManifest = () => createDiaryPdfSemanticManifest({
  schemaVersion: 2,
  pageCount: 4,
  targetPageIndex: 1,
  backCoverPageIndex: 1,
  instructionsPageIndex: 3,
  signatureSlots: backCoverSlots,
});

const backCoverStamps = () => globalTemplateStamps().map((stamp) => {
  const slot = backCoverSlots.find(({ role }) => role === stamp.role)!;
  return {
    ...stamp,
    placement: {
      coordinateSpace: slot.coordinateSpace,
      xBp: slot.xBp,
      yBp: slot.yBp,
      widthBp: slot.widthBp,
      heightBp: slot.heightBp,
    },
  };
});

test("manifesto v2 carimba Professor e Coordenador nos slots congelados da página 2", async () => {
  const originalBytes = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: backCoverManifest(),
  });
  assert.equal(frozenTarget.semanticTarget, "DIARIO_BACK_COVER");
  assert.equal(frozenTarget.targetPageIndex, 1);
  assert.equal(frozenTarget.targetPage.pageNumber, 2);

  const semanticStamps = backCoverStamps();
  const result = await applyElectronicSignatureStamps({
    originalBytes,
    frozenTarget,
    template: GLOBAL_STAMP_TEMPLATE,
    autoLayout: GLOBAL_AUTO_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: [semanticStamps[1]!, semanticStamps[0]!],
  });
  assert.equal(result.targetPageIndex, 1);
  const extracted = await extractPdfText(result.finalBytes);
  assert.match(extracted.pages[1], /PROFESSOR/);
  assert.match(extracted.pages[1], /COORDENADOR/);
  assert.match(extracted.pages[1], /Professora Ana Souza/);
  assert.match(extracted.pages[1], /Coordenador Bruno Lima/);
  assert.doesNotMatch(extracted.pages[2], /Professora Ana Souza|Coordenador Bruno Lima/);
  const qaDirectory = process.env.SIGNATURE_PDF_QA_DIR;
  if (qaDirectory) {
    await mkdir(qaDirectory, { recursive: true });
    await writeFile(`${qaDirectory}/diario-v2-pagina-2-assinada.pdf`, result.finalBytes);
  }
});

test("manifesto v2 rejeita posição ou papel divergente dos slots da contracapa", async () => {
  const originalBytes = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: backCoverManifest(),
  });
  const semanticStamps = backCoverStamps();
  await assert.rejects(
    () => applyElectronicSignatureStamps({
      originalBytes,
      frozenTarget,
      template: GLOBAL_STAMP_TEMPLATE,
      stampPngBytes: ONE_PIXEL_PNG,
      verificationUrl: VERIFICATION_URL,
      stamps: [
        {
          ...semanticStamps[0]!,
          placement: {
            ...semanticStamps[0]!.placement,
            xBp: semanticStamps[0]!.placement.xBp + 1,
          },
        },
        semanticStamps[1]!,
      ],
    }),
    /diverge do slot congelado da contracapa/i,
  );
  await assert.rejects(
    () => applyElectronicSignatureStamps({
      originalBytes,
      frozenTarget,
      template: GLOBAL_STAMP_TEMPLATE,
      stampPngBytes: ONE_PIXEL_PNG,
      verificationUrl: VERIFICATION_URL,
      stamps: [
        { ...semanticStamps[0]!, role: "SECRETARIO" },
        semanticStamps[1]!,
      ],
    }),
    /SECRETARIO.*diverge do slot congelado/i,
  );
});

test("manifesto v1 histórico mantém a última página de conteúdo e o autoLayout", async () => {
  const originalBytes = await createVectorPdf({
    landscape: true,
    imprimirInstrucoes: true,
  });
  const frozenTarget = await freezeDiaryPdfSignatureTarget(originalBytes, {
    manifest: diaryManifest(4, true),
  });
  assert.equal(frozenTarget.semanticTarget, "DIARIO_LAST_CONTENT_PAGE");
  assert.equal(frozenTarget.targetPageIndex, 2);
  const result = await applyElectronicSignatureStamps({
    originalBytes,
    frozenTarget,
    template: GLOBAL_STAMP_TEMPLATE,
    autoLayout: GLOBAL_AUTO_LAYOUT,
    stampPngBytes: ONE_PIXEL_PNG,
    verificationUrl: VERIFICATION_URL,
    stamps: globalTemplateStamps(),
  });
  assert.equal(result.targetPageIndex, 2);
});
