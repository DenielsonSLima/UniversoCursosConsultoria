export interface PoloInstitutionalData {
  poloId: string;
  poloNome: string;
  razaoSocial: string;
  cnpj: string;
  telefone: string;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  is_matriz: boolean;
  logo_url: string | null;
  watermark_url: string | null;
}
