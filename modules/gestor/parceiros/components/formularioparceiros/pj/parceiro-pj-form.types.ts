import type React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { Categoria } from '../../../../configuracoes/categorias/categorias.service';
import type { TipoParceria } from '../../../../configuracoes/tipos-parceria/tipos-parceria.service';

export interface PoloOption {
  id: string;
  nome: string;
  cidade?: string | null;
  estado?: string | null;
  uf?: string | null;
}


export interface PJFormData {
  poloId: string;
  poloIds: string[];
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  tipoPj: string;
  tipoConvenio: string;
  foto: string;
  responsavelNome: string;
  responsavelCpf: string;
  responsavelCargo: string;
  responsavelEmail: string;
  responsavelTelefone: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  email: string;
  telefone: string;
  observacoes: string;
}

type QueryOptions<T> = Pick<UseQueryResult<T[], Error>, 'data' | 'isLoading' | 'isError'>;

export interface ParceiroPJFieldsProps {
  formData: PJFormData;
  setFormData: React.Dispatch<React.SetStateAction<PJFormData>>;
  canAssociateAllPolos: boolean;
  poloScope: string;
  defaultPoloId?: string | null;
  polos: PoloOption[];
  inputCls: string;
  labelCls: string;
  sectionTitleCls: string;
  handleChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  handlePoloScopeChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
  isSearchingCnpj: boolean;
  consultarCNPJ: () => Promise<void>;
  cnpjError: string;
  isUploadingLogo: boolean;
  handleLogoUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  categoriaId: string;
  setCategoriaId: (value: string) => void;
  categoriasQuery: QueryOptions<Categoria>;
  setShowCategoriaForm: (value: boolean) => void;
  tipoParceriaId: string;
  setTipoParceriaId: (value: string) => void;
  tiposParceriaQuery: QueryOptions<TipoParceria>;
  setShowTipoParceriaForm: (value: boolean) => void;
  handleCepBlur: () => Promise<void>;
}
