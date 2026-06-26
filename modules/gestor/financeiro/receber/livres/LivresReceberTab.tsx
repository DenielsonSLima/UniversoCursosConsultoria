import React from 'react';
import { Award } from 'lucide-react';
import { ModalidadeReceberTab } from '../components/ModalidadeReceberTab';

const LivresReceberTab: React.FC = () => (
  <ModalidadeReceberTab
    modality="LIVRE"
    accentLabel="Cursos Livres"
    title="Recebíveis de cursos livres"
    description="Matrículas, parcelas e cobranças avulsas dos cursos livres."
    icon={<Award size={18} />}
  />
);

export default LivresReceberTab;
