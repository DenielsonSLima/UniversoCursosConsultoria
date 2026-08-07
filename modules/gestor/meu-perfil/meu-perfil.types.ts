export interface MeuPerfilGestorData {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  fotoPath: string | null;
}

export interface MeuPerfilGestorUpdate {
  nome: string;
  telefone: string;
  fotoPath: string | null;
}

export interface EmailUpdateResult {
  email: string;
  pendingConfirmation: boolean;
}

