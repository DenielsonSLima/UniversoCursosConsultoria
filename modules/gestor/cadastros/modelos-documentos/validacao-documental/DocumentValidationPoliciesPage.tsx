import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileCheck2,
  Info,
  History,
  Loader2,
  Minus,
  Plus,
  Save,
  ShieldCheck,
  ShieldOff,
  SlidersHorizontal,
} from 'lucide-react';
import ValidationResultContent from '../../../../public/validator/ValidationResultContent';
import {
  PUBLIC_VALIDATION_FIELD_CATALOG,
  REQUIRED_PUBLIC_VALIDATION_FIELDS,
  isPublicValidationFieldCompatible,
  normalizeVisibleFields,
  type PublicValidationField,
} from '../../../../public/validator/validator.fields';
import { mapCanonicalValidationRecord } from '../../../../public/validator/validator.mapper';
import type { ValidationStatus } from '../../../../public/validator/validator.types';
import {
  DOCUMENT_VALIDATION_CATALOG,
  DOCUMENT_VALIDATION_GROUPS,
  NON_VALIDATABLE_DOCUMENTS,
  normalizeValidationPrefix,
  validateValidationPrefix,
} from './document-validation-policies.registry';
import {
  DOCUMENT_VALIDATION_POLICIES_STALE_TIME,
  DocumentValidationPolicyVersionConflictError,
  documentValidationPoliciesService,
  documentValidationPolicyKeys,
} from './document-validation-policies.service';
import type {
  DocumentValidationPolicy,
  DocumentValidationPolicyAuditRecord,
  DocumentValidationPolicyDraft,
} from './document-validation-policies.types';
import {
  isNewerDocumentValidationPolicyVersion,
  isDocumentValidationPolicyDraftDirty,
  shouldMarkPolicyDraftStaleAfterSaveError,
  shouldPreserveDraftOnRemotePolicyChange,
  shouldPreserveDraftDuringPolicyRefresh,
} from './document-validation-policies.draft';
import { useDocumentValidationPoliciesRealtime } from './useDocumentValidationPoliciesRealtime';

type EditorSection = 'rules' | 'fields' | 'preview' | 'history';

const EDITOR_SECTIONS = [
  ['rules', 'Regras e validade', SlidersHorizontal],
  ['fields', 'Informações exibidas', ShieldCheck],
  ['preview', 'Prévia fiel', Eye],
  ['history', 'Histórico', History],
] as const;

const requiredFields = new Set<PublicValidationField>(
  REQUIRED_PUBLIC_VALIDATION_FIELDS,
);

const draftFromPolicy = (
  policy: DocumentValidationPolicy,
): DocumentValidationPolicyDraft => ({
  prefixo: policy.prefixo,
  validacaoPublica: policy.validacao_publica,
  consultaPublicaAtiva: policy.consulta_publica_ativa,
  validadeDias: policy.validade_dias,
  camposPublicos: normalizeVisibleFields(policy.campos_publicos),
  versaoPublica: policy.versao_publica,
  motivo: '',
});

const Toggle: React.FC<{
  checked: boolean;
  disabled?: boolean;
  label: string;
  danger?: boolean;
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled = false, label, danger = false, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative h-7 w-12 shrink-0 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
      checked
        ? danger ? 'border-rose-600 bg-rose-600' : 'border-blue-600 bg-blue-600'
        : 'border-slate-300 bg-slate-200'
    } disabled:cursor-not-allowed disabled:opacity-40`}
  >
    <span aria-hidden="true" className={`absolute inset-y-1 left-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
      checked ? 'translate-x-5' : ''
    }`} />
  </button>
);

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

const createPreviewResult = (
  documentType: string,
  prefix: string,
  visibleFields: readonly PublicValidationField[],
  status: Exclude<ValidationStatus, 'invalid'>,
  validityDays: number | null,
  validityMode?: 'class_end',
) => {
  const code = `${prefix || 'DOC'}-EXEMPLO-2026`;
  return mapCanonicalValidationRecord({
    ...(status === 'expired'
      ? { expiresAt: addDays(new Date(), -1).toISOString() }
      : validityMode === 'class_end'
        ? { expiresAt: addDays(new Date(), 180).toISOString() }
        : validityDays === null
          ? { expiresAt: null }
          : { expiresAt: addDays(new Date(), validityDays).toISOString() }),
    type: documentType,
    code,
    status: status === 'revoked' ? 'REVOKED' : status === 'expired' ? 'EXPIRED' : 'ACTIVE',
    studentName: 'Maria de Oliveira Santos',
    studentPhotoUrl: null,
    studentCpf: '12345678901',
    studentBirthDate: '2000-03-18',
    studentMotherName: 'Ana de Oliveira Santos',
    enrollmentNumber: '20260001234',
    courseName: 'Técnico em Administração',
    className: 'ADM 2026.1',
    institutionName: 'Universo Cursos e Consultoria',
    institutionCnpj: '13.278.137/0001-54',
    unitName: 'Matriz — Japoatã/SE',
    enrollmentStatus: 'ATIVO',
    enrollmentDate: '2026-02-10T12:00:00.000Z',
    issuedAt: new Date().toISOString(),
    lastIssuedAt: new Date().toISOString(),
    referencePeriod: '2026',
    issueCount: 2,
    visibleFields,
    schemaVersion: 2,
  }, code);
};

const publicFieldLabelById = new Map(
  PUBLIC_VALIDATION_FIELD_CATALOG.map((field) => [field.id, field.label]),
);

const getHistoryFieldChanges = (
  current: DocumentValidationPolicyAuditRecord,
  previous?: DocumentValidationPolicyAuditRecord,
) => ({
  added: current.campos_publicos.filter(
    (field) => !previous?.campos_publicos.includes(field),
  ),
  removed: previous?.campos_publicos.filter(
    (field) => !current.campos_publicos.includes(field),
  ) || [],
});

const PolicyHistoryPanel: React.FC<{ documento: string }> = ({ documento }) => {
  const historyQuery = useQuery({
    queryKey: documentValidationPolicyKeys.history(documento),
    queryFn: () => documentValidationPoliciesService.getHistory(documento),
    staleTime: 30_000,
  });

  if (historyQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-40 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-xs font-black uppercase text-slate-500">
        <Loader2 className="animate-spin text-blue-600" size={18} />
        Carregando histórico...
      </div>
    );
  }

  if (historyQuery.isError) {
    return (
      <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-center">
        <p className="text-xs font-black uppercase text-rose-800">Histórico indisponível</p>
        <p className="mt-1 text-[11px] font-medium text-rose-700">
          Não foi possível consultar a trilha de auditoria deste documento.
        </p>
        <button
          type="button"
          onClick={() => void historyQuery.refetch()}
          className="mt-3 rounded-lg bg-rose-700 px-3 py-2 text-[9px] font-black uppercase text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const records = historyQuery.data || [];
  if (!records.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <History className="mx-auto text-slate-300" size={28} />
        <p className="mt-3 text-xs font-black uppercase text-slate-600">Nenhuma alteração registrada</p>
        <p className="mt-1 text-[11px] font-medium text-slate-400">A primeira versão aparecerá aqui após o registro da política.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record, index) => {
        const previous = records[index + 1];
        const changes = getHistoryFieldChanges(record, previous);
        const timestamp = new Date(record.created_at);
        const formattedTimestamp = Number.isNaN(timestamp.getTime())
          ? 'Data não informada'
          : timestamp.toLocaleString('pt-BR');

        return (
          <article key={`${record.documento}-${record.versao}-${record.created_at}`} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-[#001a33] px-2.5 py-1 text-[9px] font-black uppercase text-white">Versão {record.versao}</span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-[9px] font-black text-slate-600">{record.prefixo}</span>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-slate-500">{formattedTimestamp}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">Papel da sessão</p>
                <p className="mt-1 text-xs font-black text-slate-700">{record.ator_role}</p>
              </div>
            </div>

            <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">{record.motivo}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${record.validacao_publica ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                Novas emissões {record.validacao_publica ? 'ativas' : 'inativas'}
              </span>
              <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${record.consulta_publica_ativa ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                Consulta {record.consulta_publica_ativa ? 'ativa' : 'bloqueada'}
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black uppercase text-amber-700">
                {record.validade_dias === null ? 'Sem vencimento' : `${record.validade_dias} dias`}
              </span>
            </div>

            {(changes.added.length > 0 || changes.removed.length > 0) && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {changes.added.length > 0 && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <p className="flex items-center gap-1 text-[9px] font-black uppercase text-emerald-700"><Plus size={12} /> Campos adicionados</p>
                    <p className="mt-2 text-[10px] font-semibold leading-relaxed text-emerald-900">
                      {changes.added.map((field) => publicFieldLabelById.get(field) || field).join(' · ')}
                    </p>
                  </div>
                )}
                {changes.removed.length > 0 && (
                  <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                    <p className="flex items-center gap-1 text-[9px] font-black uppercase text-rose-700"><Minus size={12} /> Campos removidos</p>
                    <p className="mt-2 text-[10px] font-semibold leading-relaxed text-rose-900">
                      {changes.removed.map((field) => publicFieldLabelById.get(field) || field).join(' · ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};

interface DocumentValidationPoliciesPageProps {
  readOnly?: boolean;
}

const DocumentValidationPoliciesPage: React.FC<DocumentValidationPoliciesPageProps> = ({
  readOnly = false,
}) => {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, DocumentValidationPolicyDraft>>({});
  const [expandedDocument, setExpandedDocument] = useState<string | null>(null);
  const [section, setSection] = useState<EditorSection>('rules');
  const [previewStatus, setPreviewStatus] = useState<Exclude<ValidationStatus, 'invalid'>>('valid');
  const [savedDocument, setSavedDocument] = useState<string | null>(null);
  const [staleDocuments, setStaleDocuments] = useState<Set<string>>(
    () => new Set(),
  );
  const [staleVersions, setStaleVersions] = useState<Map<string, number>>(
    () => new Map(),
  );
  const staleDocumentsRef = useRef<Set<string>>(new Set());
  const draftsRef = useRef(drafts);
  const policyByDocumentRef = useRef<Map<string, DocumentValidationPolicy>>(
    new Map(),
  );
  const pendingOwnSavesRef = useRef<Set<string>>(new Set());
  const ownSavedVersionsRef = useRef<Map<string, number>>(new Map());
  const mutationErrorRef = useRef<HTMLDivElement>(null);
  const highestObservedVersionsRef = useRef<Map<string, number>>(new Map());
  const draftRevisionByDocumentRef = useRef<Map<string, number>>(new Map());

  const policiesQuery = useQuery({
    queryKey: documentValidationPolicyKeys.list(),
    queryFn: () => documentValidationPoliciesService.getAll(),
    staleTime: DOCUMENT_VALIDATION_POLICIES_STALE_TIME,
  });

  const policyByDocument = useMemo(
    () => new Map((policiesQuery.data || []).map((policy) => [policy.documento, policy])),
    [policiesQuery.data],
  );
  draftsRef.current = drafts;

  const clearStaleDocument = useCallback((documento: string) => {
    staleDocumentsRef.current.delete(documento);
    setStaleDocuments((current) => {
      if (!current.has(documento)) return current;
      const next = new Set(current);
      next.delete(documento);
      return next;
    });
    setStaleVersions((current) => {
      if (!current.has(documento)) return current;
      const next = new Map(current);
      next.delete(documento);
      return next;
    });
  }, []);

  const markStaleDocument = useCallback((
    documento: string,
    versao?: number,
  ) => {
    staleDocumentsRef.current.add(documento);
    setStaleDocuments((current) => {
      if (current.has(documento)) return current;
      const next = new Set(current);
      next.add(documento);
      return next;
    });
    if (versao !== undefined) {
      setStaleVersions((current) => {
        if ((current.get(documento) || 0) >= versao) return current;
        const next = new Map(current);
        next.set(documento, versao);
        return next;
      });
    }
  }, []);

  const handleRemotePolicyChange = useCallback((
    documento: string,
    versao?: number,
  ) => {
    const cachedVersion = policyByDocumentRef.current
      .get(documento)?.versao_publica || 0;
    const highestObservedVersion = highestObservedVersionsRef.current
      .get(documento) || 0;
    const knownVersion = Math.max(cachedVersion, highestObservedVersion);
    if (!isNewerDocumentValidationPolicyVersion(versao, knownVersion)) {
      return;
    }
    if (versao !== undefined) {
      highestObservedVersionsRef.current.set(documento, versao);
    }

    const ownSavedVersion = ownSavedVersionsRef.current.get(documento);
    const isOwnSavePending = pendingOwnSavesRef.current.has(documento)
      || (
        versao !== undefined
        && ownSavedVersion === versao
      );
    if (ownSavedVersion !== undefined && versao !== ownSavedVersion) {
      ownSavedVersionsRef.current.delete(documento);
    }
    if (isOwnSavePending) {
      return;
    }

    if (shouldPreserveDraftOnRemotePolicyChange({
      policy: policyByDocumentRef.current.get(documento),
      draft: draftsRef.current[documento],
      isOwnSavePending: false,
    })) {
      markStaleDocument(documento, versao);
    }
  }, [markStaleDocument]);

  useDocumentValidationPoliciesRealtime(handleRemotePolicyChange);

  useEffect(() => {
    if (!policiesQuery.data) return;
    const previousPolicies = policyByDocumentRef.current;
    const nextPolicies = new Map(
      policiesQuery.data.map((policy) => [policy.documento, policy]),
    );
    const nextDrafts = { ...draftsRef.current };
    let hasVersionRegression = false;

    policiesQuery.data.forEach((policy) => {
      const previousPolicy = previousPolicies.get(policy.documento);
      if (
        previousPolicy
        && previousPolicy.versao_publica > policy.versao_publica
      ) {
        nextPolicies.set(policy.documento, previousPolicy);
        hasVersionRegression = true;
        return;
      }
      const existing = nextDrafts[policy.documento];
      const isOwnSavePending = pendingOwnSavesRef.current.has(policy.documento);
      const preserve = shouldPreserveDraftDuringPolicyRefresh({
        previousPolicy,
        incomingPolicy: policy,
        draft: existing,
        isAlreadyStale: (
          staleDocumentsRef.current.has(policy.documento)
          || isOwnSavePending
        ),
      });

      if (preserve) {
        if (!isOwnSavePending) {
          markStaleDocument(policy.documento, policy.versao_publica);
        }
      } else if (
        !existing
        || existing.versaoPublica !== policy.versao_publica
      ) {
        nextDrafts[policy.documento] = draftFromPolicy(policy);
      }

      highestObservedVersionsRef.current.set(
        policy.documento,
        Math.max(
          highestObservedVersionsRef.current.get(policy.documento) || 0,
          policy.versao_publica,
        ),
      );
    });

    policyByDocumentRef.current = nextPolicies;
    draftsRef.current = nextDrafts;
    setDrafts(nextDrafts);
    if (hasVersionRegression) {
      queryClient.setQueryData<DocumentValidationPolicy[]>(
        documentValidationPolicyKeys.list(),
        (current = []) => current.map((policy) => {
          const protectedPolicy = nextPolicies.get(policy.documento);
          return (
            protectedPolicy
            && protectedPolicy.versao_publica > policy.versao_publica
          )
            ? protectedPolicy
            : policy;
        }),
      );
    }
  }, [markStaleDocument, policiesQuery.data, queryClient]);

  const updateMutation = useMutation({
    mutationFn: ({ documento, draft }: {
      documento: string;
      draft: DocumentValidationPolicyDraft;
      draftRevision: number;
    }) => documentValidationPoliciesService.update(documento, draft),
    onMutate: async ({ documento, draft }) => {
      pendingOwnSavesRef.current.add(documento);
      ownSavedVersionsRef.current.set(
        documento,
        draft.versaoPublica + 1,
      );
      await Promise.all([
        queryClient.cancelQueries({
          queryKey: documentValidationPolicyKeys.list(),
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: documentValidationPolicyKeys.detail(documento),
          exact: true,
        }),
        queryClient.cancelQueries({
          queryKey: documentValidationPolicyKeys.history(documento),
          exact: true,
        }),
      ]);
    },
    onSuccess: (updated, variables) => {
      const highestObservedVersion = highestObservedVersionsRef.current
        .get(updated.documento) || 0;
      const hasNewerRemoteVersion = highestObservedVersion > updated.versao_publica;
      const hasPostSubmitEdits = (
        (draftRevisionByDocumentRef.current.get(updated.documento) || 0)
        > variables.draftRevision
      );

      ownSavedVersionsRef.current.set(
        updated.documento,
        updated.versao_publica,
      );
      highestObservedVersionsRef.current.set(
        updated.documento,
        Math.max(highestObservedVersion, updated.versao_publica),
      );
      const currentCanonicalPolicy = policyByDocumentRef.current.get(
        updated.documento,
      );
      if (
        !currentCanonicalPolicy
        || currentCanonicalPolicy.versao_publica <= updated.versao_publica
      ) {
        policyByDocumentRef.current = new Map(policyByDocumentRef.current);
        policyByDocumentRef.current.set(updated.documento, updated);
      }
      if (hasNewerRemoteVersion) {
        markStaleDocument(updated.documento, highestObservedVersion);
      } else {
        clearStaleDocument(updated.documento);
      }
      queryClient.setQueryData<DocumentValidationPolicy[]>(
        documentValidationPolicyKeys.list(),
        (current = []) => {
          const currentPolicy = current.find(
            (policy) => policy.documento === updated.documento,
          );
          if (
            currentPolicy
            && currentPolicy.versao_publica > updated.versao_publica
          ) {
            return current;
          }
          const exists = Boolean(currentPolicy);
          return exists
            ? current.map((policy) => policy.documento === updated.documento ? updated : policy)
            : [...current, updated];
        },
      );
      queryClient.setQueryData<DocumentValidationPolicy | undefined>(
        documentValidationPolicyKeys.detail(updated.documento),
        (current) => (
          current && current.versao_publica > updated.versao_publica
            ? current
            : updated
        ),
      );
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.list(),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.detail(updated.documento),
        exact: true,
      });
      void queryClient.invalidateQueries({
        queryKey: documentValidationPolicyKeys.history(updated.documento),
        exact: true,
      });
      setDrafts((current) => {
        const currentDraft = current[updated.documento];
        const nextDraft = (
          hasPostSubmitEdits && currentDraft
            ? {
                ...currentDraft,
                versaoPublica: updated.versao_publica,
              }
            : draftFromPolicy(updated)
        );
        const next = {
          ...current,
          [updated.documento]: nextDraft,
        };
        draftsRef.current = next;
        return next;
      });
      if (!hasNewerRemoteVersion && !hasPostSubmitEdits) {
        setSavedDocument(updated.documento);
        window.setTimeout(() => setSavedDocument((current) => (
          current === updated.documento ? null : current
        )), 2500);
      }
    },
    onError: (error, variables) => {
      ownSavedVersionsRef.current.delete(variables.documento);
      const highestObservedVersion = highestObservedVersionsRef.current
        .get(variables.documento) || 0;
      const isVersionConflict = (
        error instanceof DocumentValidationPolicyVersionConflictError
      );
      if (shouldMarkPolicyDraftStaleAfterSaveError({
        draftVersion: variables.draft.versaoPublica,
        highestObservedVersion,
        isVersionConflict,
      })) {
        markStaleDocument(
          variables.documento,
          Math.max(
            variables.draft.versaoPublica + 1,
            highestObservedVersion,
          ),
        );
        void policiesQuery.refetch();
      }
    },
    onSettled: (_data, _error, variables) => {
      pendingOwnSavesRef.current.delete(variables.documento);
    },
  });

  useEffect(() => {
    if (updateMutation.isError) {
      mutationErrorRef.current?.focus();
    }
  }, [updateMutation.isError]);

  const loadCurrentPolicy = async (documento: string) => {
    const result = await policiesQuery.refetch();
    if (result.error || !result.data) return;
    const currentPolicy = result.data.find(
      (policy) => policy.documento === documento,
    );
    if (!currentPolicy) return;
    const minimumExpectedVersion = Math.max(
      staleVersions.get(documento) || 0,
      highestObservedVersionsRef.current.get(documento) || 0,
    );
    if (currentPolicy.versao_publica < minimumExpectedVersion) return;
    setDrafts((current) => {
      const next = {
        ...current,
        [documento]: draftFromPolicy(currentPolicy),
      };
      draftsRef.current = next;
      return next;
    });
    clearStaleDocument(documento);
    updateMutation.reset();
  };

  const updateDraft = (
    documento: string,
    change: (current: DocumentValidationPolicyDraft) => DocumentValidationPolicyDraft,
  ) => {
    const policy = policyByDocument.get(documento);
    if (!policy) return;
    draftRevisionByDocumentRef.current.set(
      documento,
      (draftRevisionByDocumentRef.current.get(documento) || 0) + 1,
    );
    setSavedDocument((current) => current === documento ? null : current);
    setDrafts((current) => {
      const next = {
        ...current,
        [documento]: change(current[documento] || draftFromPolicy(policy)),
      };
      draftsRef.current = next;
      return next;
    });
  };

  const savePolicy = (
    documento: string,
    draft: DocumentValidationPolicyDraft,
  ) => {
    if (
      updateMutation.isPending
      || pendingOwnSavesRef.current.size > 0
    ) {
      return;
    }
    pendingOwnSavesRef.current.add(documento);
    updateMutation.mutate({
      documento,
      draft,
      draftRevision: draftRevisionByDocumentRef.current.get(documento) || 0,
    });
  };

  if (policiesQuery.isLoading) {
    return (
      <div role="status" aria-live="polite" className="flex min-h-80 items-center justify-center gap-3 rounded-3xl border border-slate-100 bg-white text-xs font-black uppercase tracking-widest text-slate-500">
        <Loader2 className="animate-spin text-blue-600" size={24} />
        Carregando validação pública...
      </div>
    );
  }

  if (policiesQuery.isError) {
    return (
      <div role="alert" className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
        <AlertTriangle className="mb-3 text-rose-600" size={30} />
        <h3 className="font-black uppercase tracking-wide text-rose-900">Políticas indisponíveis</h3>
        <p className="mt-2 text-sm font-medium text-rose-700">
          Não foi possível carregar a configuração de validação pública.
        </p>
        <button type="button" onClick={() => void policiesQuery.refetch()} className="mt-5 rounded-xl bg-rose-700 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white">
          Tentar novamente
        </button>
      </div>
    );
  }

  const mutationError = updateMutation.error;
  const conflict = mutationError instanceof DocumentValidationPolicyVersionConflictError;

  return (
    <div className="mx-auto max-w-7xl animate-fadeIn space-y-7">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#001a33] px-6 py-7 text-white shadow-xl shadow-blue-950/10 sm:px-8">
        <div className="relative z-10 max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-blue-200">
            <ShieldCheck size={18} />
            <span className="text-[10px] font-black uppercase tracking-[0.22em]">Governança documental</span>
            <span className="rounded-full border border-blue-300/30 bg-blue-400/10 px-3 py-1 text-[9px]">
              Configuração global · todos os polos
            </span>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight sm:text-3xl">
            Validação pública por documento
          </h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
            Defina o código, a disponibilidade da consulta e exatamente quais informações
            serão exibidas ao validar cada documento.
          </p>
        </div>
        <Eye className="absolute -bottom-10 -right-8 text-white/[0.04]" size={210} />
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <SlidersHorizontal className="mb-2 text-blue-700" size={20} />
          <p className="text-xs font-black uppercase text-blue-950">Novas emissões</p>
          <p className="mt-1 text-[11px] font-medium text-blue-800">Prefixo, validade e política de emissão não alteram códigos já emitidos.</p>
        </div>
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
          <ShieldOff className="mb-2 text-rose-700" size={20} />
          <p className="text-xs font-black uppercase text-rose-950">Consulta atual</p>
          <p className="mt-1 text-[11px] font-medium text-rose-800">O kill switch bloqueia ou libera imediatamente todos os códigos desse documento.</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
          <Eye className="mb-2 text-emerald-700" size={20} />
          <p className="text-xs font-black uppercase text-emerald-950">Privacidade controlada</p>
          <p className="mt-1 text-[11px] font-medium text-emerald-800">Campos sensíveis são sempre mascarados; instituição e emissão são obrigatórios.</p>
        </div>
      </div>

      {readOnly && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <ShieldOff className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div>
            <p className="text-xs font-black uppercase">Consulta em modo somente leitura</p>
            <p className="mt-1 text-xs font-medium">
              Políticas de QR Code são globais. Seu acesso atual permite consultar as regras,
              mas somente um gestor com acesso a todos os polos pode alterá-las.
            </p>
          </div>
        </div>
      )}

      {updateMutation.isError && (
        <div
          ref={mutationErrorRef}
          role="alert"
          tabIndex={-1}
          className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 outline-none focus-visible:ring-2 focus-visible:ring-rose-600"
        >
          <AlertTriangle className="mt-0.5 shrink-0" size={18} />
          <div>
            <p className="text-xs font-black uppercase">{conflict ? 'Edição concorrente detectada' : 'Não foi possível salvar'}</p>
            <p className="mt-1 text-xs font-medium">
              {conflict
                ? 'Outra pessoa atualizou esta política. Os dados estão sendo recarregados; confira antes de tentar novamente.'
                : 'Confira os dados, o motivo da alteração e sua permissão global.'}
            </p>
          </div>
        </div>
      )}

      {DOCUMENT_VALIDATION_GROUPS.map((group) => {
        const items = DOCUMENT_VALIDATION_CATALOG.filter((item) => item.group === group);
        return (
          <section key={group} className="rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-[#001a33]">
                <FileCheck2 size={19} />
              </div>
              <div>
                <h3 className="font-black uppercase tracking-wide text-[#001a33]">{group}</h3>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{items.length} documentos</p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {items.map((item) => {
                const policy = policyByDocument.get(item.id);
                if (!policy) {
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-4 py-4">
                      <div>
                        <p className="font-black text-slate-700">{item.label}</p>
                        <p className="text-xs font-medium text-slate-400">Política ainda não cadastrada.</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-black uppercase text-slate-500">Indisponível</span>
                    </div>
                  );
                }

                const draft = drafts[item.id] || draftFromPolicy(policy);
                const expanded = expandedDocument === item.id;
                const dirty = isDocumentValidationPolicyDraftDirty(policy, draft);
                const stale = staleDocuments.has(item.id);
                const staleVersion = staleVersions.get(item.id)
                  || policy.versao_publica;
                const prefixConflict = (policiesQuery.data || []).some((
                  candidate,
                ) => (
                  candidate.documento !== item.id
                  && candidate.prefixo.toLocaleUpperCase('pt-BR')
                    === draft.prefixo.toLocaleUpperCase('pt-BR')
                ));
                const prefixError = validateValidationPrefix(draft.prefixo)
                  || (
                    prefixConflict
                      ? 'Este prefixo já está em uso por outro documento.'
                      : null
                  );
                const hasReason = draft.motivo.trim().length >= 8;
                const saving = updateMutation.isPending && updateMutation.variables?.documento === item.id;
                const compatibleFields = PUBLIC_VALIDATION_FIELD_CATALOG.filter((field) => (
                  isPublicValidationFieldCompatible(field, item.id)
                ));
                const preview = createPreviewResult(
                  item.id,
                  draft.prefixo,
                  draft.camposPublicos,
                  previewStatus,
                  draft.validadeDias,
                  item.validityMode,
                );
                const accordionId = `validation-policy-${item.id}`;
                const activeTabId = `validation-policy-tab-${item.id}-${section}`;
                const panelId = `validation-policy-panel-${item.id}`;

                return (
                  <article key={item.id} className="py-4">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      aria-controls={accordionId}
                      onClick={() => {
                        setExpandedDocument(expanded ? null : item.id);
                        setSection('rules');
                      }}
                      className="flex w-full items-center justify-between gap-4 rounded-2xl p-2 text-left hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-[#001a33]">{item.label}</p>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[9px] font-black text-slate-500">{draft.prefixo}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">v{draft.versaoPublica}</span>
                          {stale && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[9px] font-black uppercase text-amber-800">Revisão necessária</span>}
                        </div>
                        <p className="mt-1 text-xs font-medium text-slate-500">{item.description}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${draft.validacaoPublica ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          Novas {draft.validacaoPublica ? 'ativas' : 'inativas'}
                        </span>
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${draft.consultaPublicaAtiva ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          Consulta {draft.consultaPublicaAtiva ? 'ativa' : 'bloqueada'}
                        </span>
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </button>

                    {expanded && (
                      <div id={accordionId} className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        <div role="tablist" aria-label={`Configuração de ${item.label}`} className="flex flex-wrap border-b border-slate-200 bg-white p-2">
                          {EDITOR_SECTIONS.map(([id, label, Icon], tabIndex) => (
                            <button
                              key={id}
                              id={`validation-policy-tab-${item.id}-${id}`}
                              type="button"
                              role="tab"
                              aria-selected={section === id}
                              aria-controls={panelId}
                              tabIndex={section === id ? 0 : -1}
                              onClick={() => setSection(id)}
                              onKeyDown={(event) => {
                                let nextIndex: number;
                                if (event.key === 'ArrowRight') {
                                  nextIndex = (tabIndex + 1) % EDITOR_SECTIONS.length;
                                } else if (event.key === 'ArrowLeft') {
                                  nextIndex = (tabIndex - 1 + EDITOR_SECTIONS.length) % EDITOR_SECTIONS.length;
                                } else if (event.key === 'Home') {
                                  nextIndex = 0;
                                } else if (event.key === 'End') {
                                  nextIndex = EDITOR_SECTIONS.length - 1;
                                } else {
                                  return;
                                }
                                event.preventDefault();
                                const nextSection = EDITOR_SECTIONS[nextIndex][0];
                                setSection(nextSection);
                                window.requestAnimationFrame(() => {
                                  document.getElementById(
                                    `validation-policy-tab-${item.id}-${nextSection}`,
                                  )?.focus();
                                });
                              }}
                              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wide ${
                                section === id ? 'bg-[#001a33] text-white' : 'text-slate-500 hover:bg-slate-100'
                              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
                            >
                              <Icon size={14} aria-hidden="true" /> {label}
                            </button>
                          ))}
                        </div>

                        <div
                          id={panelId}
                          role="tabpanel"
                          aria-labelledby={activeTabId}
                          tabIndex={0}
                          className="p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                        >
                          {stale && (
                            <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-start gap-3">
                                <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18} />
                                <div>
                                  <p className="text-xs font-black uppercase text-amber-900">Existe uma versão mais recente</p>
                                  <p className="mt-1 text-[11px] font-medium text-amber-800">
                                    Outra pessoa alterou esta política para v{staleVersion}. Seu rascunho v{draft.versaoPublica} foi preservado e não será salvo até você revisar a versão atual.
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => void loadCurrentPolicy(item.id)}
                                className="shrink-0 rounded-xl bg-amber-800 px-4 py-2 text-[9px] font-black uppercase tracking-wide text-white"
                              >
                                Carregar versão atual
                              </button>
                            </div>
                          )}

                          {section === 'rules' && (
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <label className="text-[10px] font-black uppercase tracking-wide text-slate-500" htmlFor={`prefix-${item.id}`}>
                                  Prefixo do código
                                </label>
                                <input
                                  id={`prefix-${item.id}`}
                                  value={draft.prefixo}
                                  disabled={readOnly || saving}
                                  aria-invalid={Boolean(prefixError)}
                                  aria-describedby={`prefix-help-${item.id}`}
                                  onChange={(event) => updateDraft(item.id, (current) => ({
                                    ...current,
                                    prefixo: normalizeValidationPrefix(event.target.value),
                                  }))}
                                  className={`mt-2 w-full rounded-xl border bg-slate-50 px-3 py-2 font-mono text-sm font-black outline-none disabled:cursor-not-allowed disabled:opacity-60 ${prefixError ? 'border-rose-300' : 'border-slate-200 focus:border-blue-500'}`}
                                />
                                <p id={`prefix-help-${item.id}`} className={`mt-2 text-[10px] font-semibold ${prefixError ? 'text-rose-600' : 'text-amber-700'}`}>
                                  {prefixError || 'A alteração vale somente para novas emissões; códigos antigos não mudam.'}
                                </p>
                              </div>

                              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="text-xs font-black uppercase text-blue-950">Validar novas emissões</p>
                                    <p className="mt-1 text-[10px] font-medium text-blue-700">Regra futura; não bloqueia códigos já emitidos.</p>
                                  </div>
                                  <Toggle
                                    checked={draft.validacaoPublica}
                                    disabled={readOnly || saving}
                                    label={`Gerar validação nas novas emissões de ${item.label}`}
                                    onChange={(checked) => updateDraft(item.id, (current) => ({ ...current, validacaoPublica: checked }))}
                                  />
                                </div>
                              </div>

                              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="text-xs font-black uppercase text-rose-950">Bloquear consulta pública</p>
                                    <p className="mt-1 text-[10px] font-medium text-rose-700">
                                      Ao ativar, todos os códigos deste tipo deixam de responder imediatamente.
                                    </p>
                                  </div>
                                  <Toggle
                                    danger
                                    checked={!draft.consultaPublicaAtiva}
                                    disabled={readOnly || saving}
                                    label={`Bloquear consulta pública de ${item.label}`}
                                    onChange={(blocked) => updateDraft(item.id, (current) => ({
                                      ...current,
                                      consultaPublicaAtiva: !blocked,
                                    }))}
                                  />
                                </div>
                              </div>

                              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex items-center gap-3">
                                  <CalendarClock className="text-blue-600" size={20} />
                                  <div className="flex-1">
                                    <p className="text-xs font-black uppercase text-slate-800">Validade</p>
                                    {item.validityMode === 'class_end' ? (
                                      <p className="mt-1 text-xs font-semibold text-slate-500">Até o término da turma, calculado pelo backend.</p>
                                    ) : (
                                      <div className="mt-2 flex items-center gap-3">
                                        <Toggle
                                          checked={draft.validadeDias !== null}
                                          disabled={readOnly || saving}
                                          label={`Validade de ${item.label}`}
                                          onChange={(checked) => updateDraft(item.id, (current) => ({ ...current, validadeDias: checked ? (policy.validade_dias || 30) : null }))}
                                        />
                                        {draft.validadeDias !== null ? (
                                          <>
                                            <input
                                              type="number"
                                              min={1}
                                              max={3650}
                                              value={draft.validadeDias}
                                              disabled={readOnly || saving}
                                              aria-label={`Validade de ${item.label} em dias`}
                                              onChange={(event) => updateDraft(item.id, (current) => ({ ...current, validadeDias: Math.max(1, Math.min(3650, Number(event.target.value) || 1)) }))}
                                              className="w-24 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-black disabled:cursor-not-allowed disabled:opacity-60"
                                            />
                                            <span className="text-[10px] font-bold uppercase text-slate-500">dias</span>
                                          </>
                                        ) : <span className="text-xs font-bold text-slate-500">Sem vencimento</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {section === 'fields' && (
                            <div className="space-y-5">
                              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-800">
                                Não existe modo “completo” para dados pessoais. Os campos marcados como mascarados permanecem protegidos na resposta pública.
                              </div>
                              {(['Identificação', 'Dados acadêmicos', 'Instituição', 'Emissão'] as const).map((fieldGroup) => {
                                const fields = compatibleFields.filter((field) => field.group === fieldGroup);
                                if (!fields.length) return null;
                                return (
                                  <div key={fieldGroup}>
                                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">{fieldGroup}</p>
                                    <div className="grid gap-2 md:grid-cols-2">
                                      {fields.map((field) => {
                                        const required = requiredFields.has(field.id);
                                        const checked = required || draft.camposPublicos.includes(field.id);
                                        return (
                                          <label key={field.id} className={`flex items-start gap-3 rounded-xl border p-3 ${checked ? 'border-blue-200 bg-white' : 'border-slate-200 bg-slate-100/60'}`}>
                                            <input
                                              type="checkbox"
                                              checked={checked}
                                              disabled={required || readOnly || saving}
                                              onChange={(event) => updateDraft(item.id, (current) => ({
                                                ...current,
                                                camposPublicos: normalizeVisibleFields(event.target.checked
                                                  ? [...current.camposPublicos, field.id]
                                                  : current.camposPublicos.filter((id) => id !== field.id)),
                                              }))}
                                              className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                                            />
                                            <span className="min-w-0">
                                              <span className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-800">
                                                {field.label}
                                                {required && <span className="text-[8px] uppercase text-blue-600">Obrigatório</span>}
                                                {field.masked && <span className="text-[8px] uppercase text-amber-600">Mascarado</span>}
                                                <span className="text-[8px] uppercase text-slate-400">Risco {field.risk}</span>
                                              </span>
                                              <span className="mt-1 block text-[10px] font-medium text-slate-500">{field.description}</span>
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {section === 'preview' && (
                            <div>
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs font-black uppercase text-slate-700">Mesmo renderizador da consulta pública</p>
                                <div role="group" aria-label="Estado simulado do documento" className="flex gap-2">
                                  {(['valid', 'expired', 'revoked'] as const).map((status) => (
                                    <button
                                      key={status}
                                      type="button"
                                      aria-pressed={previewStatus === status}
                                      onClick={() => setPreviewStatus(status)}
                                      className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${previewStatus === status ? 'bg-[#001a33] text-white' : 'bg-white text-slate-500'}`}
                                    >
                                      {status === 'valid' ? 'Válido' : status === 'expired' ? 'Expirado' : 'Revogado'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {!draft.validacaoPublica && (
                                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
                                  Novas emissões não receberão código público. A prévia abaixo representa
                                  somente um código que já havia sido emitido.
                                </div>
                              )}
                              {draft.consultaPublicaAtiva && item.validityMode === 'class_end' && (
                                <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-[11px] font-semibold text-blue-800">
                                  A data de validade desta simulação é ilustrativa. Na emissão real,
                                  o backend usa a data de término da turma.
                                </div>
                              )}
                              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                                {!draft.consultaPublicaAtiva ? (
                                  <div role="status" className="rounded-2xl border border-rose-200 bg-rose-50 p-7 text-center">
                                    <ShieldOff className="mx-auto text-rose-600" size={32} aria-hidden="true" />
                                    <p className="mt-3 text-sm font-black uppercase text-rose-900">
                                      Consulta pública bloqueada
                                    </p>
                                    <p className="mx-auto mt-2 max-w-lg text-xs font-medium text-rose-700">
                                      O visitante recebe uma resposta genérica de código não encontrado;
                                      nenhuma informação deste documento é exibida.
                                    </p>
                                  </div>
                                ) : preview ? <ValidationResultContent result={preview} /> : (
                                  <p className="text-sm font-medium text-rose-700">Não foi possível gerar o preview deste tipo.</p>
                                )}
                              </div>
                            </div>
                          )}

                          {section === 'history' && (
                            readOnly ? (
                              <div role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
                                <p className="text-xs font-black uppercase text-amber-900">Histórico restrito</p>
                                <p className="mt-1 text-[11px] font-medium text-amber-800">
                                  A trilha de alterações está disponível somente para gestores com acesso global.
                                </p>
                              </div>
                            ) : <PolicyHistoryPanel documento={item.id} />
                          )}
                        </div>

                        <div className="border-t border-slate-200 bg-white p-4">
                          <label className="text-[10px] font-black uppercase tracking-wide text-slate-500" htmlFor={`reason-${item.id}`}>
                            Motivo da alteração
                          </label>
                          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                            <input
                              id={`reason-${item.id}`}
                              value={draft.motivo}
                              disabled={readOnly || saving}
                              aria-describedby={`reason-help-${item.id}`}
                              onChange={(event) => updateDraft(item.id, (current) => ({ ...current, motivo: event.target.value }))}
                              placeholder="Ex.: adequação das informações públicas"
                              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <button
                              type="button"
                              disabled={readOnly || stale || !dirty || !hasReason || Boolean(prefixError) || updateMutation.isPending}
                              onClick={() => savePolicy(item.id, draft)}
                              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-[10px] font-black uppercase tracking-wider ${
                                savedDocument === item.id ? 'bg-emerald-600 text-white' : dirty ? 'bg-[#001a33] text-white' : 'bg-slate-100 text-slate-400'
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {saving ? <Loader2 className="animate-spin" size={14} /> : savedDocument === item.id ? <Check size={14} /> : <Save size={14} />}
                              {saving ? 'Salvando' : savedDocument === item.id ? 'Salvo' : 'Salvar alterações'}
                            </button>
                          </div>
                          <div id={`reason-help-${item.id}`} aria-live="polite">
                            {dirty && !hasReason && <p className="mt-2 text-[10px] font-semibold text-amber-700">Informe um motivo com pelo menos 8 caracteres para registrar a mudança.</p>}
                            {stale && <p className="mt-2 text-[10px] font-semibold text-amber-700">Carregue e revise a versão atual antes de salvar novas alterações.</p>}
                            {readOnly && <p className="mt-2 text-[10px] font-semibold text-amber-700">Modo somente leitura: solicite acesso global para alterar esta política.</p>}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}

      <section className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <Info className="mt-0.5 shrink-0 text-slate-500" size={19} />
          <div>
            <h3 className="font-black uppercase tracking-wide text-[#001a33]">Documentos com fluxo próprio</h3>
            <p className="mt-1 text-xs font-medium text-slate-500">Não herdam automaticamente a política do validador acadêmico.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {NON_VALIDATABLE_DOCUMENTS.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-[#001a33]">{item.label}</p>
              <p className="mt-2 text-xs font-medium text-slate-500">{item.reason}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DocumentValidationPoliciesPage;
