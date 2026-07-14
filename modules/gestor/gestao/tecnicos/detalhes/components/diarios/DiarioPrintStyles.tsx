import React from 'react';

const DiarioPrintStyles: React.FC = () => (
  <style>{`
    .diario-print-page {
      width: 297mm;
      height: 210mm;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
      background: white;
      color: #071a33;
      font-family: "Arial Narrow", Arial, sans-serif;
      page-break-after: always;
    }
    .diario-print-page:last-child { page-break-after: auto; }
    .diario-page-body { padding: 12mm 14mm 10mm 19mm; height: 100%; box-sizing: border-box; }
    .diario-accent { position: absolute; inset: 0 auto 0 0; width: 7mm; background: #0879d8; }
    .diario-accent::after { content: ""; position: absolute; inset: 0 -2.5mm 0 auto; width: 1.5mm; background: #e30613; }
    .diario-doc-title { text-align: center; font-weight: 900; font-size: 15pt; letter-spacing: .04em; margin: 2mm 0 1.5mm; }
    .diario-meta { display: grid; grid-template-columns: 1.1fr 1fr 1.4fr; border: .35mm solid #172033; margin-bottom: 3mm; font-size: 8pt; }
    .diario-meta > div { padding: 1.4mm 2mm; border-right: .25mm solid #172033; }
    .diario-meta > div:last-child { border-right: 0; }
    .diario-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.2pt; }
    .diario-table th, .diario-table td { border: .25mm solid #202735; padding: 1.15mm; vertical-align: middle; }
    .diario-table th { background: #eef4fa; font-weight: 900; text-transform: uppercase; text-align: center; }
    .diario-table td { color: #111827; }
    .diario-footer { position: absolute; bottom: 5mm; left: 19mm; right: 14mm; display: flex; justify-content: space-between; border-top: .25mm solid #94a3b8; padding-top: 1.5mm; font-size: 6.5pt; color: #64748b; }
    .diario-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20mm; margin-top: 11mm; font-size: 8pt; text-align: center; }
    .diario-signature-line { border-top: .3mm solid #172033; padding-top: 1.5mm; }
    @media print {
      @page { size: A4 landscape; margin: 0; }
      body * { visibility: hidden !important; }
      .diario-print-host { position: absolute !important; left: 0 !important; top: 0 !important; z-index: 9999 !important; }
      #diario-print-document, #diario-print-document * { visibility: visible !important; }
      #diario-print-document { position: absolute !important; inset: 0 auto auto 0 !important; }
    }
  `}</style>
);

export default DiarioPrintStyles;
