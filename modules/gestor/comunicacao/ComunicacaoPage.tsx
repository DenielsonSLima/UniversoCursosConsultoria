import React from 'react';
import WhatsAppCommunicationPanel from './components/WhatsAppCommunicationPanel';
import InternalCommunicationPage from './InternalCommunicationPage';
import type { ComunicacaoPageProps } from './gestor-comunicacao.types';
import './comunicacao-workspace.css';

const ComunicacaoPage: React.FC<ComunicacaoPageProps> = (props) => {
  if (props.channel === 'whatsapp') {
    return (
      <div className={`comunicacao-workspace comunicacao-channel-shell flex min-h-0 flex-col overflow-hidden bg-white antialiased ${props.embedded ? 'h-full flex-1' : 'h-[calc(100vh-120px)] rounded-3xl border border-slate-100 shadow-sm animate-fadeIn'}`}>
        <div className="comunicacao-channel-surface min-h-0 flex-1 overflow-hidden" data-comunicacao-view={props.whatsappInitialTab}>
          <WhatsAppCommunicationPanel
            initialTab={props.whatsappInitialTab}
            showModuleTabs={props.showWhatsAppModuleTabs}
          />
        </div>
      </div>
    );
  }

  return <InternalCommunicationPage {...props} />;
};

export default ComunicacaoPage;
