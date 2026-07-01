import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction } from '../models/transaction.model';
import { Loan } from '../models/loan.model';
import { MonthlySummary } from '../models/monthly-summary.model';
import { getMonthName } from '../utils/date.utils';

function pdfCurrency(amount: number): string {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  return `Rs. ${formatted}`;
}

@Injectable({ providedIn: 'root' })
export class ExportService {
  private formatPeriodLabel(period: string): string {
    if (period.includes('_to_')) {
      const [start, end] = period.split('_to_');
      return `${getMonthName(start)} – ${getMonthName(end)}`;
    }
    return getMonthName(period);
  }

  exportTransactionsPdf(
    transactions: Transaction[],
    summaries: MonthlySummary[],
    period: string
  ): void {
    const pdf = new jsPDF();
    const periodLabel = this.formatPeriodLabel(period);

    pdf.setFontSize(18);
    pdf.text('Farm Financial Report', 14, 22);
    pdf.setFontSize(12);
    pdf.text(`Period: ${periodLabel}`, 14, 32);
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 40);

    // Summary table — compute from actual transactions for accuracy
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const netProfit = totalIncome - totalExpense;

    autoTable(pdf, {
      startY: 50,
      head: [['Metric', 'Amount']],
      body: [
        ['Total Income', pdfCurrency(totalIncome)],
        ['Total Expense', pdfCurrency(totalExpense)],
        ['Net Profit/Loss', pdfCurrency(netProfit)],
      ],
      theme: 'grid',
    });

    // Segment breakdown
    if (summaries.length > 0) {
      autoTable(pdf, {
        head: [['Segment', 'Income', 'Expense', 'Net']],
        body: summaries.map((s) => [
          s.segment,
          pdfCurrency(s.totalIncome || 0),
          pdfCurrency(s.totalExpense || 0),
          pdfCurrency(s.netProfit || 0),
        ]),
        theme: 'striped',
      });
    }

    // Category breakdown
    const catMap: Record<string, number> = {};
    for (const t of transactions) {
      catMap[t.categoryName] = (catMap[t.categoryName] || 0) + t.amount;
    }
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    if (catEntries.length > 0) {
      autoTable(pdf, {
        head: [['Category', 'Total Amount']],
        body: catEntries.map(([name, amt]) => [name, pdfCurrency(amt)]),
        theme: 'striped',
      });
    }

    // Paid By breakdown
    const personMap: Record<string, number> = {};
    for (const t of transactions) {
      const name = t.paidByName || t.createdByName || 'Unknown';
      personMap[name] = (personMap[name] || 0) + t.amount;
    }
    const personEntries = Object.entries(personMap).sort((a, b) => b[1] - a[1]);
    if (personEntries.length > 0) {
      autoTable(pdf, {
        head: [['Paid By', 'Total Amount']],
        body: personEntries.map(([name, amt]) => [name, pdfCurrency(amt)]),
        theme: 'striped',
      });
    }

    // Transactions detail
    if (transactions.length > 0) {
      pdf.addPage();
      pdf.setFontSize(14);
      pdf.text('Transaction Details', 14, 22);

      autoTable(pdf, {
        startY: 30,
        head: [['Date', 'Type', 'Segment', 'Category', 'Amount', 'Paid By', 'Description']],
        body: [
          ...transactions.map((t) => [
            t.date.toDate().toLocaleDateString('en-IN'),
            t.type,
            t.segmentName,
            t.categoryName,
            pdfCurrency(t.amount),
            t.paidByName || t.createdByName,
            t.description,
          ]),
          ['', '', '', 'Total Income', pdfCurrency(totalIncome), '', ''],
          ['', '', '', 'Total Expense', pdfCurrency(totalExpense), '', ''],
          ['', '', '', 'Net Profit/Loss', pdfCurrency(netProfit), '', ''],
        ],
        theme: 'striped',
        styles: { fontSize: 8 },
        didParseCell: (data: any) => {
          const rowCount = transactions.length;
          if (data.section === 'body' && data.row.index >= rowCount) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });
    }

    // Distribution summary for income transactions
    const incomeWithDist = transactions.filter(t => t.type === 'income' && t.distributions?.length);
    if (incomeWithDist.length > 0) {
      pdf.addPage();
      pdf.setFontSize(14);
      pdf.text('Income Distribution Summary', 14, 22);

      // Per-person totals
      const personTotals: Record<string, number> = {};
      let totalDist = 0;
      for (const txn of incomeWithDist) {
        for (const d of txn.distributions!) {
          personTotals[d.name] = (personTotals[d.name] || 0) + d.amount;
          totalDist += d.amount;
        }
      }

      autoTable(pdf, {
        startY: 30,
        head: [['Person', 'Total Received']],
        body: [
          ...Object.entries(personTotals).map(([name, amt]) => [name, pdfCurrency(amt)]),
          ['Total Distributed', pdfCurrency(totalDist)],
          ['Undistributed', pdfCurrency(totalIncome - totalDist)],
        ],
        theme: 'grid',
        didParseCell: (data: any) => {
          const rowCount = Object.keys(personTotals).length;
          if (data.section === 'body' && data.row.index >= rowCount) {
            data.cell.styles.fontStyle = 'bold';
          }
        },
      });

      // Per-transaction distribution detail
      pdf.setFontSize(12);
      autoTable(pdf, {
        head: [['Date', 'Segment', 'Amount', 'Distributed To']],
        body: incomeWithDist.map(t => [
          t.date.toDate().toLocaleDateString('en-IN'),
          t.segmentName,
          pdfCurrency(t.amount),
          t.distributions!.map(d => `${d.name}: ${pdfCurrency(d.amount)}`).join(', '),
        ]),
        theme: 'striped',
        styles: { fontSize: 8 },
      });
    }

    pdf.save(`farm-report-${period}.pdf`);
  }

  exportLoansPdf(loans: Loan[], month: string): void {
    const pdf = new jsPDF();

    pdf.setFontSize(18);
    pdf.text('Loan Report', 14, 22);
    pdf.setFontSize(12);
    pdf.text(`Month: ${getMonthName(month)}`, 14, 32);

    autoTable(pdf, {
      startY: 42,
      head: [['Date', 'Type', 'Person', 'Amount', 'Repaid', 'Balance', 'Status', 'Segment']],
      body: loans.map((l) => [
        l.date.toDate().toLocaleDateString('en-IN'),
        l.type,
        l.personName,
        pdfCurrency(l.amount),
        pdfCurrency(l.totalRepaid),
        pdfCurrency(l.balanceRemaining),
        l.repaymentStatus,
        l.segmentName,
      ]),
      theme: 'striped',
    });

    pdf.save(`loan-report-${month}.pdf`);
  }

  exportTransactionsCsv(transactions: Transaction[], filename: string): void {
    const headers = 'Date,Type,Segment,Category,Amount,Paid By,Payment Method,Description,Quantity,Unit,Rate Per Unit,Payment Status,Distribution\n';
    const rows = transactions
      .map(
        (t) => {
          const distStr = t.distributions?.length
            ? `"${t.distributions.map(d => `${d.name}: ${d.amount}`).join('; ')}"`
            : '';
          return `${t.date.toDate().toLocaleDateString('en-IN')},${t.type},${t.segmentName},${t.categoryName},${t.amount},${t.paidByName || t.createdByName},${t.paymentMethod || 'upi'},"${t.description}",${t.quantity || ''},${t.unit || ''},${t.ratePerUnit || ''},${t.paymentStatus || ''},${distStr}`;
        }
      )
      .join('\n');

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const netProfit = totalIncome - totalExpense;
    const totalsRows = `\n,,,,,,,\n,,,Total Income,${totalIncome},,,\n,,,Total Expense,${totalExpense},,,\n,,,Net Profit/Loss,${netProfit},,,`;

    // Category breakdown
    const catMap: Record<string, number> = {};
    for (const t of transactions) {
      catMap[t.categoryName] = (catMap[t.categoryName] || 0) + t.amount;
    }
    const catRows = `\n\n,,,,,,,\nCategory,Total Amount,,,,,,\n` +
      Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([name, amt]) => `${name},${amt},,,,,,`).join('\n');

    // Paid By breakdown
    const personMap: Record<string, number> = {};
    for (const t of transactions) {
      const name = t.paidByName || t.createdByName || 'Unknown';
      personMap[name] = (personMap[name] || 0) + t.amount;
    }
    const personRows = `\n\n,,,,,,,\nPaid By,Total Amount,,,,,,\n` +
      Object.entries(personMap).sort((a, b) => b[1] - a[1]).map(([name, amt]) => `${name},${amt},,,,,,`).join('\n');

    this.downloadFile(headers + rows + totalsRows + catRows + personRows, `${filename}.csv`, 'text/csv');
  }

  exportLoansCsv(loans: Loan[], filename: string): void {
    const headers = 'Date,Type,Person,Amount,Repaid,Balance,Status,Purpose,Segment,Recorded By\n';
    const rows = loans
      .map(
        (l) =>
          `${l.date.toDate().toLocaleDateString('en-IN')},${l.type},${l.personName},${l.amount},${l.totalRepaid},${l.balanceRemaining},${l.repaymentStatus},"${l.purpose}",${l.segmentName},${l.recordedByName}`
      )
      .join('\n');

    this.downloadFile(headers + rows, `${filename}.csv`, 'text/csv');
  }

  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
