import React from 'react';
import { Building2 } from 'lucide-react';
import {
  resolveInstitutionalHeader,
  type InstitutionalDocumentMeta,
  type InstitutionalHeaderFields,
} from './institutional-header.model';

let principalCompanyLogoCache: string | null | undefined;
let principalCompanyLogoRequest: Promise<string | null> | null = null;

const getPrincipalCompanyLogo = async () => {
  if (principalCompanyLogoCache !== undefined) return principalCompanyLogoCache;

  if (!principalCompanyLogoRequest) {
    principalCompanyLogoRequest = import('../configuracoes/empresas/empresas.service')
      .then(({ empresasService }) => empresasService.getCompanyPrincipal())
      .then((company) => {
        principalCompanyLogoCache = company?.logoUrl || null;
        return principalCompanyLogoCache;
      })
      .catch((error) => {
        console.error('[DocumentHeader] Erro ao carregar logo da empresa principal:', error);
        principalCompanyLogoCache = null;
        return null;
      });
  }

  return principalCompanyLogoRequest;
};

export interface DocumentHeaderProps {
  logoUrl?: string;
  nomeFantasia?: string;
  razaoSocial?: string;
  cnpj?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  polo?: InstitutionalHeaderFields;
  company?: InstitutionalHeaderFields;
  orientation?: 'portrait' | 'landscape';
  meta?: InstitutionalDocumentMeta;
}

const { useEffect, useState } = React;

export const DocumentHeader = ({
  logoUrl,
  nomeFantasia,
  razaoSocial,
  cnpj,
  endereco,
  numero,
  complemento,
  bairro,
  cidade,
  uf,
  estado,
  cep,
  telefone,
  email,
  polo,
  company,
  orientation = 'portrait',
  meta,
}: DocumentHeaderProps) => {
  const overrides: InstitutionalHeaderFields = {
    logoUrl,
    nomeFantasia,
    razaoSocial,
    cnpj,
    endereco,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    estado,
    cep,
    telefone,
    // Mantido na entrada por compatibilidade; o resolvedor protege o e-mail oficial.
    email,
  };
  const providedHeader = resolveInstitutionalHeader({ overrides, polo, company });
  const [principalLogoUrl, setPrincipalLogoUrl] = useState(
    (principalCompanyLogoCache || null) as string | null,
  );

  useEffect(() => {
    if (providedHeader.logoUrl) return;

    let isMounted = true;
    getPrincipalCompanyLogo().then((mainLogoUrl) => {
      if (isMounted) setPrincipalLogoUrl(mainLogoUrl);
    });

    return () => {
      isMounted = false;
    };
  }, [providedHeader.logoUrl]);

  const institution = resolveInstitutionalHeader({
    overrides: {
      ...overrides,
      logoUrl: providedHeader.logoUrl || principalLogoUrl,
    },
    polo,
    company,
  });
  const detailColumns = [institution.leftLines, institution.rightLines] as const;

  return (
    <header className="relative z-10 mb-8 w-full select-none text-left pointer-events-none">
      <div className="flex h-[35mm] min-h-[35mm] max-h-[35mm] min-w-0 items-center gap-5 overflow-hidden border-b-2 border-[#001a33]/10 pb-5">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
          {institution.logoUrl ? (
            <img
              src={institution.logoUrl}
              alt="Logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <Building2 size={44} className="text-slate-300" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            <h1
              className="min-w-0 flex-1 truncate text-lg font-black uppercase leading-tight tracking-wide text-[#001a33]"
              title={institution.name}
            >
              {institution.name}
            </h1>
            {institution.isHeadquarters ? (
              <span className="rounded border border-[#001a33]/15 bg-[#001a33]/5 px-1.5 py-0.5 text-[9px] font-extrabold uppercase leading-none tracking-widest text-[#001a33]">
                Matriz
              </span>
            ) : null}
          </div>

          <div
            className={`mt-2 grid grid-cols-2 gap-y-1 ${
              orientation === 'landscape' ? 'gap-x-8' : 'gap-x-4'
            }`}
          >
            {detailColumns.map((lines, columnIndex) => (
              <div key={columnIndex} className="min-w-0 space-y-0.5 overflow-hidden">
                {lines.map((line) => (
                  <p
                    key={line.label}
                    className="truncate text-[9px] font-medium leading-normal text-slate-600"
                    title={`${line.label}: ${line.value}`}
                  >
                    <span className="font-bold text-slate-800">{line.label}:</span>{' '}
                    {line.value}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {meta ? (
        <div
          data-institutional-document-meta
          className="mt-[2mm] flex h-[10.5mm] min-h-[10.5mm] max-h-[10.5mm] items-center justify-between gap-6 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-[1mm]"
        >
          <div className="min-w-0 flex-1 overflow-hidden">
            {meta.eyebrow ? (
              <p className="truncate text-[8px] font-black uppercase leading-none tracking-widest text-slate-400">
                {meta.eyebrow}
              </p>
            ) : null}
            <p className="truncate text-xs font-black uppercase leading-none text-[#001a33]">
              {meta.title}
            </p>
          </div>
          {meta.label || meta.value ? (
            <div className="max-w-[38%] shrink-0 overflow-hidden text-right">
              {meta.label ? (
                <p className="truncate text-[8px] font-black uppercase leading-none tracking-widest text-slate-400">
                  {meta.label}
                </p>
              ) : null}
              {meta.value ? (
                <p className="truncate text-[10px] font-bold uppercase leading-none text-slate-700">
                  {meta.value}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </header>
  );
};

export default DocumentHeader;
