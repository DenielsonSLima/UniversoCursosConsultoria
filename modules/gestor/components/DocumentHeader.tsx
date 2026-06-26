import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { empresasService } from '../configuracoes/empresas/empresas.service';

let principalCompanyLogoCache: string | null | undefined;
let principalCompanyLogoRequest: Promise<string | null> | null = null;

const getPrincipalCompanyLogo = async () => {
  if (principalCompanyLogoCache !== undefined) return principalCompanyLogoCache;

  if (!principalCompanyLogoRequest) {
    principalCompanyLogoRequest = empresasService
      .getCompanyPrincipal()
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

interface DocumentHeaderProps {
  logoUrl?: string;
  nomeFantasia?: string;
  razaoSocial?: string;
  cnpj?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  
  // direct data objects
  polo?: {
    logoUrl?: string;
    logo_url?: string;
    nomeFantasia?: string;
    nome?: string;
    cnpj?: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
  };
  company?: {
    logoUrl?: string;
    logo_url?: string;
    nomeFantasia?: string;
    razaoSocial?: string;
    cnpj?: string;
    endereco?: string;
    numero?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    telefone?: string;
    email?: string;
  };

  orientation?: 'portrait' | 'landscape';
  rightContent?: React.ReactNode;
}

export const DocumentHeader: React.FC<DocumentHeaderProps> = ({
  logoUrl,
  nomeFantasia,
  razaoSocial,
  cnpj,
  endereco,
  numero,
  bairro,
  cidade,
  uf,
  cep,
  telefone,
  email,
  polo,
  company,
  orientation = 'portrait',
  rightContent
}) => {
  const providedLogoUrl = logoUrl || polo?.logoUrl || polo?.logo_url || company?.logoUrl || company?.logo_url;
  const [principalLogoUrl, setPrincipalLogoUrl] = useState<string | null>(
    principalCompanyLogoCache || null
  );

  useEffect(() => {
    if (providedLogoUrl) return;

    let isMounted = true;
    getPrincipalCompanyLogo().then((mainLogoUrl) => {
      if (isMounted) setPrincipalLogoUrl(mainLogoUrl);
    });

    return () => {
      isMounted = false;
    };
  }, [providedLogoUrl]);

  // Resolve data fields prioritizing overrides, then polo, then company
  const resolvedLogoUrl = providedLogoUrl || principalLogoUrl;
  let resolvedNome = nomeFantasia || polo?.nomeFantasia || polo?.nome || company?.nomeFantasia || company?.razaoSocial || 'UNIVERSO CURSOS E CONSULTORIA';
  
  // Clean up "Matriz - " prefix if it exists in the name
  if (resolvedNome.toUpperCase().startsWith('MATRIZ - ')) {
    resolvedNome = resolvedNome.substring(9);
  } else if (resolvedNome.toUpperCase().startsWith('MATRIZ-')) {
    resolvedNome = resolvedNome.substring(7);
  }

  const resolvedRazao = razaoSocial || (polo?.nomeFantasia && polo?.nomeFantasia !== polo?.nome ? polo?.nome : company?.razaoSocial || '');
  const resolvedCnpj = cnpj || polo?.cnpj || company?.cnpj || '00.000.000/0001-00';
  const resolvedTelefone = telefone || polo?.telefone || company?.telefone || '';
  const resolvedEmail = email || polo?.email || company?.email || '';
  
  const resEndereco = endereco || polo?.endereco || company?.endereco || '';
  const resNumero = numero || polo?.numero || company?.numero || '';
  const resBairro = bairro || polo?.bairro || company?.bairro || '';
  const resCidade = cidade || polo?.cidade || company?.cidade || '';
  const resUf = uf || polo?.uf || company?.uf || '';
  const resCep = cep || polo?.cep || company?.cep || '';

  const isMatriz = polo?.is_matriz || company?.tipo === 'Matriz' || false;

  // Format the full address line cleanly
  const addressParts = [
    resEndereco ? `${resEndereco}${resNumero ? `, ${resNumero}` : ''}` : '',
    resBairro,
    resCidade ? `${resCidade}${resUf ? `/${resUf}` : ''}` : '',
    resCep ? `CEP: ${resCep}` : ''
  ].filter(Boolean);

  const formattedAddress = addressParts.join(' - ');

  return (
    <div className="flex justify-between items-start border-b-2 border-[#001a33]/10 pb-5 mb-8 relative z-10 w-full select-none pointer-events-none text-left">
      {/* Left section: logo + details side-by-side */}
      <div className="flex items-center gap-5 flex-1 min-w-0">
        {/* Logo Container: rounded card with border and shadow */}
        <div className="w-28 h-28 bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-1.5 shadow-sm shrink-0">
          {resolvedLogoUrl ? (
            <img src={resolvedLogoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <Building2 size={44} className="text-slate-300" />
          )}
        </div>

        {/* Company and unit information */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-black text-[#001a33] uppercase tracking-wide leading-tight">
              {resolvedNome}
            </h1>
            {isMatriz && (
              <span className="bg-[#001a33]/5 text-[#001a33] text-[9px] px-1.5 py-0.5 rounded border border-[#001a33]/15 font-extrabold uppercase tracking-widest leading-none">
                Matriz
              </span>
            )}
          </div>
          {resolvedRazao && resolvedRazao !== resolvedNome && (
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5 leading-normal">
              {resolvedRazao}
            </p>
          )}

          {/* Grid layout for structured details */}
          <div className={`grid ${orientation === 'landscape' ? 'grid-cols-2 gap-x-8' : 'grid-cols-2 gap-x-4'} gap-y-1 mt-2`}>
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-600 font-medium">
                <span className="font-bold text-slate-800">CNPJ:</span> {resolvedCnpj}
              </p>
              {resolvedTelefone && (
                <p className="text-[10px] text-slate-600 font-medium">
                  <span className="font-bold text-slate-800">Contato:</span> {resolvedTelefone}
                </p>
              )}
            </div>
            <div className="space-y-0.5">
              {formattedAddress && (
                <p className="text-[10px] text-slate-600 font-medium leading-normal" title={formattedAddress}>
                  <span className="font-bold text-slate-800">Endereço:</span> {formattedAddress}
                </p>
              )}
              {resolvedEmail && (
                <p className="text-[10px] text-slate-600 font-medium leading-normal">
                  <span className="font-bold text-slate-800">Email:</span> {resolvedEmail}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right section: document title or specific metadata */}
      {rightContent && (
        <div className="ml-6 shrink-0 flex items-start self-start">
          {rightContent}
        </div>
      )}
    </div>
  );
};

export default DocumentHeader;
