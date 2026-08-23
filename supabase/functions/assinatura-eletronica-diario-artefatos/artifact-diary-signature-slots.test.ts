import assert from 'node:assert/strict';
import { createDiaryPdfSemanticManifest } from '../../../modules/shared/assinatura-eletronica/diary-pdf-semantic-manifest.ts';
import { resolveDiarySignaturePlacements } from './artifact-diary-signature-slots.ts';

const slot = (
  role: 'PROFESSOR' | 'COORDENADOR',
  fieldId: 'contracapaAssinaturaProfessor' | 'contracapaAssinaturaCoordenador',
  xBp: number,
) => ({
  role, fieldId, pageTarget: 'DIARIO_BACK_COVER' as const,
  coordinateSpace: 'PAGE_TOP_LEFT_BP_V1' as const,
  xBp, yBp: 84_000, widthBp: 38_000, heightBp: 14_000,
});

const manifest = createDiaryPdfSemanticManifest({
  schemaVersion: 2,
  pageCount: 7,
  targetPageIndex: 1,
  backCoverPageIndex: 1,
  instructionsPageIndex: 6,
  signatureSlots: [
    slot('PROFESSOR', 'contracapaAssinaturaProfessor', 10_000),
    slot('COORDENADOR', 'contracapaAssinaturaCoordenador', 52_000),
  ],
});

const participant = (role: 'PROFESSOR' | 'COORDENADOR', order: number) => ({
  participantId: `00000000-0000-4000-8000-00000000000${order}`,
  role,
  order,
  status: 'ASSINADO' as const,
  signerName: role,
  signerCpfMasked: '***.***.***-**',
  signedAt: '2026-08-23T12:00:00Z',
  signatureEventId: `00000000-0000-4000-8000-00000000001${order}`,
  signatureHash: 'a'.repeat(64),
  verificationCode: `DIA-${role}`,
  verificationPath: `/validador?code=DIA-${role}`,
});

Deno.test('Professor e Coordenador usam os respectivos campos congelados da página 2', () => {
  const placements = resolveDiarySignaturePlacements(
    manifest,
    [participant('PROFESSOR', 1), participant('COORDENADOR', 2)],
    null,
  );
  assert.deepEqual(placements.map(({ xBp, yBp }) => ({ xBp, yBp })), [
    { xBp: 10_000, yBp: 84_000 },
    { xBp: 52_000, yBp: 84_000 },
  ]);
});

Deno.test('papel sem campo correspondente falha fechado', () => {
  assert.throws(
    () => resolveDiarySignaturePlacements(
      manifest,
      [participant('PROFESSOR', 1), { ...participant('PROFESSOR', 2), role: 'DIRETOR' }],
      null,
    ),
    /duplicado|não possui campo/u,
  );
});
