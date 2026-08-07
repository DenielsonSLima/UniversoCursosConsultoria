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
      break-after: page;
      margin: 0 auto 32px auto;
      box-shadow: 0 20px 35px -10px rgba(0, 0, 0, 0.5), 0 10px 15px -5px rgba(0, 0, 0, 0.3);
      border: 1px solid #cbd5e1;
      border-radius: 2px;
    }
    .diario-print-page--compact {
      overflow: visible;
    }
    .diario-print-page:last-child {
      margin-bottom: 0;
      page-break-after: auto;
    }
    .diario-page-body {
      padding: 9mm 14mm 12mm 19mm;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
    }
    .diario-print-page--compact .diario-page-body {
      padding: 5.5mm 11mm 8mm 14mm;
    }
    .diario-page-content {
      flex: 1;
      min-height: 0;
    }
    .diario-accent { position: absolute; inset: 0 auto 0 0; width: 7mm; background: #0879d8; }
    .diario-accent::after { content: ""; position: absolute; inset: 0 -2.5mm 0 auto; width: 1.5mm; background: #e30613; }
    .diario-page-header { display: flex; align-items: center; margin-bottom: 1.8mm; min-height: 9mm; }
    .diario-page-header--right { justify-content: flex-end; }
    .diario-page-logo { width: auto; max-height: 9mm; max-width: 72mm; object-fit: contain; }
    .diario-page-logo--right { max-height: 11mm; }
    .diario-doc-title {
      text-align: center;
      font-family: "Trebuchet MS", "Segoe UI", Arial, sans-serif;
      font-weight: 800;
      font-size: 16pt;
      letter-spacing: .02em;
      margin: -2.6mm 0 0.8mm;
      text-transform: uppercase;
      position: relative;
      top: -1.3mm;
    }
    .diario-print-page--compact .diario-page-header {
      margin-bottom: 1mm;
    }
    .diario-print-page--compact .diario-page-logo {
      max-height: 11mm;
    }
    .diario-print-page--compact .diario-page-logo--right {
      transform: translateY(4mm);
    }
    .diario-print-page--compact .diario-doc-title {
      margin-top: -2.6mm;
      margin-bottom: 1.2mm;
      top: -1.4mm;
      transform: translateY(-2.4mm);
    }
    .diario-meta { display: grid; grid-template-columns: 1.1fr 1fr 1.4fr; border: .35mm solid #172033; margin-bottom: 2mm; font-size: 8pt; }
    .diario-print-page--compact .diario-meta { margin-bottom: 1.4mm; }
    .diario-meta > div { padding: 1.4mm 2mm; border-right: .25mm solid #172033; }
    .diario-meta > div:last-child { border-right: 0; }
    .diario-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.2pt; }
    .diario-table th, .diario-table td { border: .25mm solid #202735; padding: 1.35mm 1.2mm; vertical-align: middle; line-height: 1.2; }
    .diario-table th { background: #eef4fa; font-weight: 900; text-transform: uppercase; text-align: center; }
    .diario-table td { color: #111827; }
    .diario-frequency-table {
      color-scheme: light;
      font-size: 6.6pt;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .diario-frequency-table th,
    .diario-frequency-table td { padding: 1.05mm 0.9mm; line-height: 1.2; }
    .diario-frequency-table thead th {
      background-color: #eef4fa !important;
      background-image: none !important;
      color: #071a33 !important;
      forced-color-adjust: none;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .diario-frequency-static {
      background-color: #eef4fa !important;
      color: #071a33 !important;
    }
    .diario-frequency-date {
      display: inline;
      color: #071a33 !important;
      font-style: normal;
      font-weight: 900;
      white-space: nowrap;
    }
    .diario-frequency-secondary {
      display: inline;
      margin-left: 0.7mm;
      color: #64748b !important;
      font-size: 5.2pt;
      font-style: italic;
      font-weight: 400;
      line-height: 1.05;
      white-space: nowrap;
    }
    .diario-frequency-meeting {
      background-color: #eef4fa !important;
      color: #071a33 !important;
      border-bottom-width: .2mm !important;
    }
    .diario-frequency-session {
      background-color: #f8fafc !important;
      padding: .55mm .45mm !important;
      color: #1d4ed8 !important;
      font-size: 5.7pt;
      letter-spacing: .05em;
    }
    .diario-result-table { font-size: 6.6pt; }
    .diario-result-table th,
    .diario-result-table td { padding: 1.05mm 0.9mm; line-height: 1.2; }
    .diario-result-legend {
      margin-top: 3mm;
      color: #071a33;
      font-size: 6.8pt;
      line-height: 1.45;
    }
    .diario-result-legend strong {
      display: block;
      margin-bottom: 1mm;
    }
    .diario-result-legend span {
      display: block;
    }
    .diario-content-table td {
      min-height: 9mm;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: normal;
    }
    .diario-table th > div,
    .diario-table td > div,
    .diario-table th > span,
    .diario-table td > span,
    .diario-table th > strong,
    .diario-table td > strong {
      line-height: 1.2;
      margin-top: 0;
    }
    .diario-frequency-student,
    .diario-result-student { white-space: nowrap; overflow: hidden; max-width: 57mm; }
    .diario-frequency-student strong {
      display: inline;
    }
    .diario-result-student { text-overflow: ellipsis; }
    .diario-table tbody tr:nth-child(even) td { background-color: #f8fafc; }
    .diario-table tbody tr:nth-child(odd) td { background-color: #ffffff; }
    .diario-footer { position: absolute; bottom: 5mm; left: 19mm; right: 14mm; display: flex; justify-content: space-between; border-top: .25mm solid #94a3b8; padding-top: 1.5mm; font-size: 6.5pt; color: #64748b; }
    .diario-print-page--compact .diario-footer {
      position: static;
      margin-top: auto;
      left: auto;
      right: auto;
      bottom: auto;
      margin-bottom: 0;
      padding-top: 1.2mm;
    }
    .diario-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20mm; margin-top: 11mm; font-size: 8pt; text-align: center; }
    .diario-signature-line { border-top: .3mm solid #172033; padding-top: 1.5mm; }
    @media print {
      @page { size: A4 landscape; margin: 0; }
      body * { visibility: hidden !important; }
      .diario-print-host {
        position: absolute !important;
        left: 0 !important;
        top: 0 !important;
        z-index: 9999 !important;
        opacity: 1 !important;
      }
      #diario-print-document, #diario-print-document * { visibility: visible !important; }
      #diario-print-document { position: absolute !important; inset: 0 auto auto 0 !important; }
      .diario-print-page {
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
      }
    }
  `}</style>
);

export default DiarioPrintStyles;
