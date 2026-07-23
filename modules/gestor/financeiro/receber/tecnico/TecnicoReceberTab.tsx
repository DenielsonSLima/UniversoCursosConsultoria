import React from 'react';
import { Landmark } from 'lucide-react';
import { ModalidadeReceberTab } from '../components/ModalidadeReceberTab';

const TecnicoReceberTab: React.FC<{ poloId?: string | null }> = ({ poloId }) => (
  <ModalidadeReceberTab
    poloId={poloId}
    modality="TECNICO"
    accentLabel="Cursos Técnicos"
    title="Recebíveis técnicos"
    description="Matrículas e parcelas técnicas com conciliação bancária e baixa manual."
    icon={<Landmark size={18} />}
  />
);

export default TecnicoReceberTab;
