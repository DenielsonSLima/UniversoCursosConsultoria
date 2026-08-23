import type {
  ElectronicSignatureInboxItem,
  ElectronicSignatureProfile,
} from "./assinatura-eletronica.contract";

export interface ElectronicSignatureActionModalProps {
  isOpen: boolean;
  item: ElectronicSignatureInboxItem | null;
  profile: ElectronicSignatureProfile;
  contextId: string;
  poloId?: string | null;
  onClose: () => void;
}
