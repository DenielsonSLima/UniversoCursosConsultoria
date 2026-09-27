import React from 'react';

const FichaAlunoPrintStyles = () => (
  <style>{`
    @media print {
      body * {
        visibility: hidden;
      }
      #print-area, #print-area * {
        visibility: visible;
      }
      #print-area {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .ficha-template-content * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  `}</style>
);

export default FichaAlunoPrintStyles;
