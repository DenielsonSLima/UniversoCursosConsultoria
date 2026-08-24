import React from "react";
import { createPortal } from "react-dom";

import ElectronicSignatureActionModalContent from "./ElectronicSignatureActionModalContent";
import type { ElectronicSignatureActionModalProps } from "./ElectronicSignatureActionModal.types";
import { useElectronicSignatureActionModal } from "./useElectronicSignatureActionModal";

const ElectronicSignatureActionModal: React.FC<
  ElectronicSignatureActionModalProps
> = (props) => {
  const controller = useElectronicSignatureActionModal(props);
  if (!controller) return null;
  return createPortal(
    <ElectronicSignatureActionModalContent controller={controller} />,
    document.body,
  );
};

export default ElectronicSignatureActionModal;
