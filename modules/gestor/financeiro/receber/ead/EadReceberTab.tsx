import React from 'react';
import { Laptop } from 'lucide-react';
import { ModalidadeReceberTab } from '../components/ModalidadeReceberTab';

const EadReceberTab: React.FC<{ poloId?: string | null }> = ({ poloId }) => (
  <ModalidadeReceberTab
    poloId={poloId}
    modality="EAD"
    accentLabel="EAD"
    title="Recebíveis EAD"
    description="Cobranças de cursos EAD com links, status bancário e baixa manual."
    icon={<Laptop size={18} />}
  />
);

export default EadReceberTab;
