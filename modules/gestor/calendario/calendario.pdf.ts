import { jsPDF } from 'jspdf';
import { CalendarEvent, EventType } from './calendario.types';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface ExportCalendarPdfOptions {
  year: number;
  events: CalendarEvent[];
  eventTypes: EventType[];
}

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split('').map(char => char + char).join('')
    : normalized, 16);
  if (Number.isNaN(value)) return [148, 163, 184];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const formatShortDate = (date: string) => {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
};

const truncate = (value: string, maxLength: number) =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;

export const exportAnnualCalendarPdf = ({ year, events, eventTypes }: ExportCalendarPdfOptions) => {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const typeMap = new Map(eventTypes.map(type => [type.id, type]));
  const eventsByDate = new Map<string, CalendarEvent[]>();

  events
    .filter(event => event.date.startsWith(`${year}-`))
    .forEach(event => {
      const dateEvents = eventsByDate.get(event.date) || [];
      dateEvents.push(event);
      eventsByDate.set(event.date, dateEvents);
    });

  const drawBrandHeader = (subtitle: string) => {
    pdf.setFillColor(0, 26, 51);
    pdf.roundedRect(10, 9, pageWidth - 20, 15, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text(`CALENDÁRIO ${year}`, 16, 18.3);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text(`UNIVERSO CURSOS E CONSULTORIA  •  ${subtitle}`, pageWidth - 16, 18.1, { align: 'right' });
  };

  drawBrandHeader('VISÃO ANUAL');

  const marginX = 10;
  const gapX = 3;
  const gapY = 3;
  const gridTop = 28;
  const cardWidth = (pageWidth - marginX * 2 - gapX * 3) / 4;
  const cardHeight = (pageHeight - gridTop - 10 - gapY * 2) / 3;

  MONTHS.forEach((month, monthIndex) => {
    const column = monthIndex % 4;
    const row = Math.floor(monthIndex / 4);
    const x = marginX + column * (cardWidth + gapX);
    const y = gridTop + row * (cardHeight + gapY);

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(221, 229, 239);
    pdf.roundedRect(x, y, cardWidth, cardHeight, 2.4, 2.4, 'FD');
    pdf.setFillColor(241, 245, 249);
    pdf.roundedRect(x + 0.4, y + 0.4, cardWidth - 0.8, 8, 2, 2, 'F');
    pdf.setTextColor(0, 26, 51);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text(month.toUpperCase(), x + 4, y + 5.8);

    const calendarX = x + 3.2;
    const calendarY = y + 11;
    const cellWidth = (cardWidth - 6.4) / 7;
    const cellHeight = 5.6;

    WEEKDAYS.forEach((weekday, index) => {
      if (index === 0) pdf.setTextColor(220, 38, 38);
      else if (index === 6) pdf.setTextColor(37, 99, 235);
      else pdf.setTextColor(148, 163, 184);
      pdf.setFontSize(5.5);
      pdf.text(weekday, calendarX + index * cellWidth + cellWidth / 2, calendarY, { align: 'center' });
    });

    const firstWeekday = new Date(year, monthIndex, 1).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day += 1) {
      const position = firstWeekday + day - 1;
      const weekday = position % 7;
      const week = Math.floor(position / 7);
      const cellX = calendarX + weekday * cellWidth;
      const cellY = calendarY + 2.1 + week * cellHeight;
      const dateKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = eventsByDate.get(dateKey) || [];
      const hasHoliday = dayEvents.some(event => event.typeId === 'fer');

      if (weekday === 0 || weekday === 6 || hasHoliday) {
        if (hasHoliday || weekday === 0) pdf.setFillColor(254, 242, 242);
        else pdf.setFillColor(239, 246, 255);
        pdf.roundedRect(cellX + 0.6, cellY - 2.8, cellWidth - 1.2, 4.7, 0.8, 0.8, 'F');
      }

      if (weekday === 0 || hasHoliday) pdf.setTextColor(220, 38, 38);
      else if (weekday === 6) pdf.setTextColor(37, 99, 235);
      else pdf.setTextColor(51, 65, 85);
      pdf.setFont('helvetica', dayEvents.length ? 'bold' : 'normal');
      pdf.setFontSize(5.8);
      pdf.text(String(day), cellX + cellWidth / 2, cellY, { align: 'center' });

      dayEvents.slice(0, 3).forEach((event, eventIndex) => {
        const [red, green, blue] = hexToRgb(typeMap.get(event.typeId)?.color || '#94a3b8');
        pdf.setFillColor(red, green, blue);
        pdf.circle(cellX + cellWidth / 2 + (eventIndex - (Math.min(dayEvents.length, 3) - 1) / 2) * 1.5, cellY + 1.25, 0.38, 'F');
      });
    }
  });

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.text('Domingos em vermelho • Sábados em azul • Pontos coloridos indicam eventos', 10, pageHeight - 4.5);
  pdf.text('Página 1 de 2', pageWidth - 10, pageHeight - 4.5, { align: 'right' });

  pdf.addPage('a4', 'landscape');
  drawBrandHeader('LEGENDAS E DATAS OFICIAIS');

  pdf.setTextColor(0, 26, 51);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('LEGENDA DO CALENDÁRIO', 12, 33);

  let legendX = 12;
  let legendY = 40;
  eventTypes.forEach((type, index) => {
    const [red, green, blue] = hexToRgb(type.color);
    pdf.setFillColor(red, green, blue);
    pdf.circle(legendX, legendY - 1.2, 1.4, 'F');
    pdf.setTextColor(51, 65, 85);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.text(type.label, legendX + 3.5, legendY);

    legendX += 46;
    if ((index + 1) % 6 === 0) {
      legendX = 12;
      legendY += 7;
    }
  });

  const officialGroups = [
    { typeId: 'fer', title: 'FERIADOS NACIONAIS' },
    { typeId: 'fac', title: 'PONTOS FACULTATIVOS' },
    { typeId: 'com', title: 'DATAS COMEMORATIVAS' },
  ];
  const columnWidth = (pageWidth - 28) / 3;
  const officialTop = legendY + 8;

  officialGroups.forEach((group, groupIndex) => {
    const x = 12 + groupIndex * (columnWidth + 2);
    const type = typeMap.get(group.typeId);
    const [red, green, blue] = hexToRgb(type?.color || '#94a3b8');
    const groupEvents = events
      .filter(event => event.id.startsWith('official-') && event.typeId === group.typeId && event.date.startsWith(`${year}-`))
      .sort((a, b) => a.date.localeCompare(b.date));

    pdf.setFillColor(red, green, blue);
    pdf.roundedRect(x, officialTop, columnWidth, 8, 2, 2, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text(group.title, x + 4, officialTop + 5.2);

    let y = officialTop + 13;
    groupEvents.forEach(event => {
      pdf.setTextColor(red, green, blue);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.text(formatShortDate(event.date), x + 1, y);
      pdf.setTextColor(51, 65, 85);
      pdf.setFont('helvetica', 'normal');
      pdf.text(truncate(event.title, 38), x + 13, y);
      y += 6.2;
    });
  });

  const academicEvents = events.filter(event => !event.id.startsWith('official-') && event.date.startsWith(`${year}-`));
  const summaryY = pageHeight - 33;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(12, summaryY - 7, pageWidth - 12, summaryY - 7);
  pdf.setTextColor(0, 26, 51);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('RESUMO DA AGENDA ACADÊMICA', 12, summaryY);
  pdf.setFontSize(7);
  eventTypes
    .filter(type => !['fer', 'fac', 'com'].includes(type.id))
    .forEach((type, index) => {
      const count = academicEvents.filter(event => event.typeId === type.id).length;
      const x = 12 + (index % 5) * 54;
      const y = summaryY + 7 + Math.floor(index / 5) * 6;
      const [red, green, blue] = hexToRgb(type.color);
      pdf.setFillColor(red, green, blue);
      pdf.circle(x, y - 1, 1.1, 'F');
      pdf.setTextColor(71, 85, 105);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`${type.label}: ${count}`, x + 3, y);
    });

  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  pdf.text('Datas móveis recalculadas automaticamente para o ano selecionado.', 10, pageHeight - 4.5);
  pdf.text('Página 2 de 2', pageWidth - 10, pageHeight - 4.5, { align: 'right' });

  pdf.save(`calendario-universo-${year}.pdf`);
};

