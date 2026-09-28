import React from 'react';
import { escapeHtmlText } from '../../../../../../lib/htmlSanitizer';
import { prepareStudentIdentityTemplate } from '../../../../../shared/utils/student-document-presentation';
import { isCinDocumentType } from '../../../../../shared/utils/technicalEnrollmentRequirements';
import type { StudentTemplatePreview } from '../../../ficha-matricula/student-template-preview.service';

export const replaceStudentPreviewTokens = (source: string, escapeValues: boolean, preview?: StudentTemplatePreview | null) => {
  if (!preview) return source;
  const isCin = isCinDocumentType(preview.replacements['{{ALUNO_DOCUMENTO_TIPO}}']);
  return Object.entries(preview.replacements).reduce((result, [token, value]) => result.split(token).join(
    escapeValues ? escapeHtmlText(String(value ?? '')) : String(value ?? ''),
  ), prepareStudentIdentityTemplate(source, isCin));
};

export const DeclaracaoEditorLoadError = ({ loadError, onBack, onRetry }: { loadError: string; onBack: () => void; onRetry: () => void }) => (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-3xl border border-rose-200 bg-rose-50 p-8 text-center">
        <p className="font-black text-rose-800">{loadError}</p>
        <p className="mt-1 text-sm font-medium text-rose-600">Verifique sua conexão e tente novamente.</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-rose-700"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-rose-700 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white"
          >
            Tentar novamente
          </button>
        </div>
      </div>

);

export const getPreviewValidationCode = (qrConfig: any, polo: { id: string }, validationPrefix: string) => {
    let codeStr = 'VALIDACAO-PADRAO';
    if (qrConfig && qrConfig.pattern) {
      codeStr = qrConfig.pattern.map((token: string) => {
        if (token === '{POLO_ID}') return polo.id.slice(0, 3).toUpperCase();
        if (token === '{ANO_ATUAL}') return new Date().getFullYear();
        return token.replace(/[{}]/g, '').substring(0, 4);
      }).join(qrConfig.separator || '-');
    }
    return `${validationPrefix}-${codeStr}`;
  };

