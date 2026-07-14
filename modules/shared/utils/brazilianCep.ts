export interface BrazilianCepAddress {
  cep: string;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

const uppercase = (value?: string) => String(value || '').trim().toLocaleUpperCase('pt-BR');

export const formatCep = (value?: string | null) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};

export const lookupBrazilianCep = async (
  value: string,
  signal?: globalThis.AbortSignal,
): Promise<BrazilianCepAddress | null> => {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) throw new Error('Não foi possível consultar o CEP agora.');

  const data = await response.json() as ViaCepResponse;
  if (data.erro) return null;

  return {
    cep: formatCep(data.cep || digits),
    endereco: uppercase(data.logradouro),
    bairro: uppercase(data.bairro),
    cidade: uppercase(data.localidade),
    uf: uppercase(data.uf).slice(0, 2),
  };
};
