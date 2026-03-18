import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ExportService {
  async exportToPdf(title: string, headers: string[], rows: unknown[][]): Promise<void> {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const pdfDoc = new jsPDF();
    pdfDoc.setFontSize(16);
    pdfDoc.text(title, 14, 20);
    pdfDoc.setFontSize(10);
    pdfDoc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);

    autoTable(pdfDoc, {
      head: [headers],
      body: rows as string[][],
      startY: 35,
      styles: { fontSize: 8 },
    });

    pdfDoc.save(`${title.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
  }

  async exportToExcel(title: string, headers: string[], rows: unknown[][]): Promise<void> {
    const XLSX = await import('xlsx');

    const worksheetData = [headers, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, title.substring(0, 31));

    XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_')}_${Date.now()}.xlsx`);
  }
}
