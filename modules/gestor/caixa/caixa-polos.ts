export interface CaixaPolo {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  is_matriz: boolean;
  created_at: string | null;
}

const getCreationTime = (polo: CaixaPolo) => {
  const timestamp = Date.parse(polo.created_at || '');
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

export const orderCaixaPolosByCreation = (polos: CaixaPolo[]) => (
  [...polos].sort((left, right) => {
    const leftCreationTime = getCreationTime(left);
    const rightCreationTime = getCreationTime(right);
    if (leftCreationTime !== rightCreationTime) {
      return leftCreationTime - rightCreationTime;
    }

    return left.id.localeCompare(right.id);
  })
);
