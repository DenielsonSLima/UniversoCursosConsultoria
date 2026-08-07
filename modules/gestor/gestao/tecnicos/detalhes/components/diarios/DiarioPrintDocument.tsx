import React, { forwardRef } from 'react';
import { DiarioPrintDocumentProps } from './diario-classe.types';
import DiarioPrintBackCover from './DiarioPrintBackCover';
import DiarioPrintCover from './DiarioPrintCover';
import {
  DiarioPrintContentPages,
  DiarioPrintFrequencyPages,
  DiarioPrintInstructionsPage,
  DiarioPrintResultPages,
} from './DiarioPrintSections';
import DiarioPrintStyles from './DiarioPrintStyles';

const DiarioPrintDocument = forwardRef<HTMLDivElement, DiarioPrintDocumentProps>((props, ref) => {
  const { template } = props;

  return (
    <div ref={ref} id="diario-print-document" aria-hidden="true">
      <DiarioPrintStyles />
      <DiarioPrintCover {...props} />
      {(template.contracapaUrl || template.imprimirValidacaoContracapa) && (
        <DiarioPrintBackCover {...props} />
      )}
      <DiarioPrintFrequencyPages {...props} />
      <DiarioPrintResultPages {...props} />
      <DiarioPrintContentPages {...props} />
      {template.imprimirInstrucoes && <DiarioPrintInstructionsPage {...props} />}
    </div>
  );
});

DiarioPrintDocument.displayName = 'DiarioPrintDocument';

export default DiarioPrintDocument;
