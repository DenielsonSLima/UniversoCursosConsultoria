import React from 'react';
import { Laptop } from 'lucide-react';
import { ModalidadeReceberTab } from '../components/ModalidadeReceberTab';

const EadReceberTab: React.FC = () => (
  <ModalidadeReceberTab
    modality="EAD"
    accentLabel="EAD"
    title="Recebíveis EAD"
    description="Cobranças de cursos EAD com links, status Asaas e baixa manual."
    icon={<Laptop size={18} />}
  />
);

export default EadReceberTab;
