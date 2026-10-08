import { canonicalAsRecord, canonicalText } from '../../shared/canonical-document-render.utils';
import { normalizeContractAttentionHighlights, normalizeContractCriticalHighlights } from '../../../../shared/contrato-aluno/semantic-format';
import type { ContratoAlunoPreparedDocument } from '../types/contratos-aluno.types';
import {
  normalizeContractClosingPositions,
  validateContractClosingPositions,
  type ContractClosingPositions,
} from '../../../../shared/contrato-aluno/closing-positions';

export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;
export const PAGE_LEFT = 18;
export const PAGE_RIGHT = 18;
export const PAGE_TOP = 15;
export const PAGE_BOTTOM = 16;
export const PAGE_NUMBER_Y = PAGE_HEIGHT - 7;
export const LEGACY_BODY_START = 60;
export const V2_BODY_START = 82;
export const V2_CONTINUATION_BODY_START = 62;
export const V3_BODY_START = 75;
export const V3_CONTINUATION_BODY_START = 60;
/** Área exclusiva de encerramento: sobe as assinaturas sem invadir o corpo canônico. */
export const CLOSING_TOP = 210;
export const LEGACY_CONTRACT_TITLE_TOP = 47.5;
export const LEGACY_CONTRACT_TITLE_SIZE = 15;
export const V2_CONTRACT_TITLE_TOP = 69;
export const V2_CONTRACT_TITLE_SIZE = 13;
export const CONTRACT_TITLE_LINE_HEIGHT = 1.12;
export const CONTRACT_PRESENTATION_LEGACY = "CONTRATO_A4_INSTITUCIONAL_V1";
export const CONTRACT_PRESENTATION_V2 = "CONTRATO_A4_INSTITUCIONAL_V2";
export const CONTRACT_PRESENTATION_V3 = "CONTRATO_A4_INSTITUCIONAL_V3_MINUTA_COMPLETA";

export type PdfGStateConstructor = new (parameters: { opacity: number }) => unknown;

export interface ContractVisualPage {
  header: string;
  title: string;
  body: string;
  footer: string;
}

export interface ContractVisualDocument {
  pages: ContractVisualPage[];
  presentationVersion: string;
  snapshot: Record<string, unknown>;
  criticalHighlights: string[];
  attentionHighlights: string[];
  closingPositions: ContractClosingPositions;
  institution: {
    name: string;
    legalName: string;
    cnpj: string;
    address: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    postalCode: string;
    phone: string;
    email: string;
    isHeadquarters: boolean;
    logoUrl: string | null;
  };
  qr: {
    enabled: boolean;
    label: string;
    validityLabel: string;
  };
  watermark: {
    enabled: boolean;
    imageUrl: string | null;
    label: string | null;
    opacity: number | null;
    scale: number | null;
    rotate: boolean;
  };
}

export type ContractPresentationMode = "LEGACY" | "V2" | "V3";

export const resolveContractPresentationMode = (
  presentationVersion: string | null | undefined,
): ContractPresentationMode => {
  if (!presentationVersion || presentationVersion === CONTRACT_PRESENTATION_LEGACY) {
    return "LEGACY";
  }
  if (presentationVersion === CONTRACT_PRESENTATION_V2) return "V2";
  if (presentationVersion === CONTRACT_PRESENTATION_V3) return "V3";
  throw new Error(
    `A versão de apresentação do contrato não é suportada: ${presentationVersion}.`,
  );
};


export const readContractVisualDocument = (
  document: ContratoAlunoPreparedDocument,
): ContractVisualDocument => {
  const rendered = document.renderPayload?.rendered;
  if (!rendered?.pages.length) {
    throw new Error(
      "O contrato não possui páginas canônicas suficientes para gerar o PDF.",
    );
  }

  const snapshot = canonicalAsRecord(document.renderPayload?.snapshot);
  const template = canonicalAsRecord(document.renderPayload?.template);
  const validation = canonicalAsRecord(
    snapshot.validacao || snapshot.validacao_documento,
  );
  const institution = canonicalAsRecord(
    snapshot.instituicao || snapshot.institution,
  );
  const snapshotWatermark = canonicalAsRecord(
    snapshot.marcaDagua || snapshot.marca_dagua || snapshot.watermark,
  );
  const snapshotWatermarkScale = Number(
    snapshotWatermark.escala ?? snapshotWatermark.scale,
  );
  const renderedWatermarkRotate = rendered.watermark?.rotate;
  const footer = canonicalText(rendered.pages.at(-1)?.footer);
  const hasQr = rendered.qr?.enabled === true;
  const closingPositions = normalizeContractClosingPositions(
    template.layoutEncerramento,
    footer,
    hasQr,
  );
  const closingErrors = validateContractClosingPositions(closingPositions, footer, hasQr);
  if (closingErrors.length) {
    throw new Error(`O posicionamento do encerramento do contrato é inválido: ${closingErrors.join(' ')}`);
  }
  return {
    pages: rendered.pages.map((page) => ({
      header: canonicalText(page.header),
      title: canonicalText(page.title),
      body: canonicalText(page.body),
      footer: canonicalText(page.footer),
    })),
    presentationVersion: canonicalText(
      institution.presentationVersion,
      institution.presentation_version,
    ),
    snapshot: {
      ...snapshot,
      regras: canonicalAsRecord(template.regrasDinamicas),
    },
    criticalHighlights: normalizeContractCriticalHighlights(template.destaquesCriticos),
    attentionHighlights: normalizeContractAttentionHighlights(template.destaquesAtencao),
    closingPositions,
    institution: {
      name: canonicalText(institution.nome, institution.name),
      legalName: canonicalText(institution.razaoSocial, institution.legalName),
      cnpj: canonicalText(institution.cnpj, institution.taxId),
      address: canonicalText(institution.endereco, institution.address),
      number: canonicalText(institution.numero, institution.number),
      complement: canonicalText(institution.complemento, institution.complement),
      neighborhood: canonicalText(institution.bairro, institution.neighborhood),
      city: canonicalText(institution.cidade, institution.city),
      state: canonicalText(institution.uf, institution.estado, institution.state),
      postalCode: canonicalText(institution.cep, institution.postalCode),
      phone: canonicalText(institution.telefone, institution.contato, institution.phone),
      email: canonicalText(institution.email),
      isHeadquarters: institution.isMatriz === true || institution.is_matriz === true,
      logoUrl: canonicalText(institution.logoUrl, institution.logo_url) || null,
    },
    qr: {
      enabled: rendered.qr?.enabled === true,
      label: canonicalText(rendered.qr?.label, "Validar documento"),
      validityLabel: canonicalText(
        rendered.qr?.validityLabel,
        validation.validadeExibicao,
      ),
    },
    watermark: {
      enabled: rendered.watermark?.enabled === true,
      imageUrl: rendered.watermark?.imageUrl || null,
      label: rendered.watermark?.label || null,
      opacity: rendered.watermark?.opacity ?? null,
      scale: rendered.watermark?.scale
        ?? (Number.isFinite(snapshotWatermarkScale) ? snapshotWatermarkScale : null),
      rotate: renderedWatermarkRotate == null
        ? snapshotWatermark.rotacionar === true || snapshotWatermark.rotate === true
        : renderedWatermarkRotate,
    },
  };
};
