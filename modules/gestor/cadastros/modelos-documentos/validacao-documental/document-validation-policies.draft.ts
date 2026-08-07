import { normalizeVisibleFields } from '../../../../public/validator/validator.fields';
import type {
  DocumentValidationPolicy,
  DocumentValidationPolicyDraft,
} from './document-validation-policies.types';

const haveSameFields = (
  left: readonly string[],
  right: readonly string[],
) => (
  left.length === right.length
  && left.every((field) => right.includes(field))
);

export const isDocumentValidationPolicyDraftDirty = (
  policy: DocumentValidationPolicy,
  draft: DocumentValidationPolicyDraft,
): boolean => !(
  policy.prefixo === draft.prefixo
  && policy.validacao_publica === draft.validacaoPublica
  && policy.consulta_publica_ativa === draft.consultaPublicaAtiva
  && policy.validade_dias === draft.validadeDias
  && haveSameFields(
    normalizeVisibleFields(policy.campos_publicos),
    draft.camposPublicos,
  )
);

export const shouldPreserveDraftOnRemotePolicyChange = ({
  policy,
  draft,
  isOwnSavePending,
}: {
  policy?: DocumentValidationPolicy;
  draft?: DocumentValidationPolicyDraft;
  isOwnSavePending: boolean;
}): boolean => (
  !isOwnSavePending
  && Boolean(policy && draft)
  && (
    isDocumentValidationPolicyDraftDirty(
      policy as DocumentValidationPolicy,
      draft as DocumentValidationPolicyDraft,
    )
    || (draft as DocumentValidationPolicyDraft).motivo.trim().length > 0
  )
);

export const shouldPreserveDraftDuringPolicyRefresh = ({
  previousPolicy,
  incomingPolicy,
  draft,
  isAlreadyStale,
}: {
  previousPolicy?: DocumentValidationPolicy;
  incomingPolicy: DocumentValidationPolicy;
  draft?: DocumentValidationPolicyDraft;
  isAlreadyStale: boolean;
}): boolean => {
  if (!draft || draft.versaoPublica === incomingPolicy.versao_publica) {
    return false;
  }
  if (isAlreadyStale) return true;

  // Sem a política-base não é possível provar que o rascunho está limpo.
  // Preservar é o comportamento fail-safe contra perda de edição local.
  if (
    !previousPolicy
    || previousPolicy.versao_publica !== draft.versaoPublica
  ) {
    return true;
  }

  return shouldPreserveDraftOnRemotePolicyChange({
    policy: previousPolicy,
    draft,
    isOwnSavePending: false,
  });
};

export const isNewerDocumentValidationPolicyVersion = (
  incomingVersion: number | undefined,
  knownVersion: number,
): boolean => (
  incomingVersion === undefined
  || incomingVersion > knownVersion
);

export const shouldMarkPolicyDraftStaleAfterSaveError = ({
  draftVersion,
  highestObservedVersion,
  isVersionConflict,
}: {
  draftVersion: number;
  highestObservedVersion: number;
  isVersionConflict: boolean;
}): boolean => (
  isVersionConflict
  || highestObservedVersion > draftVersion
);
