import React from 'react';
import { GraduationCap } from 'lucide-react';
import { ModalidadeReceberTab } from '../components/ModalidadeReceberTab';

const EspecializacaoReceberTab: React.FC = () => (
  <ModalidadeReceberTab
    modality="ESPECIALIZACAO"
    accentLabel="Especialização"
    title="Recebíveis de especialização"
    description="Contratos, parcelas e matrículas de especializações com acompanhamento financeiro."
    icon={<GraduationCap size={18} />}
  />
);

export default EspecializacaoReceberTab;
