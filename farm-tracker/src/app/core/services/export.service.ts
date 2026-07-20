import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction } from '../models/transaction.model';
import { Loan, Repayment } from '../models/loan.model';
import { Animal } from '../models/animal.model';
import { Buyer } from '../models/buyer.model';
import { MonthlySummary } from '../models/monthly-summary.model';
import { getMonthName } from '../utils/date.utils';
import type { BackupData } from './backup.service';

/** RFC 4180 CSV field escaping: wrap in quotes if field contains comma, quote, or newline */
function csvField(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

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
    if (period === 'all' || period === 'all-time') return 'All-Time';
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

    // Summary table — use pre-aggregated summaries for accuracy (transactions may be filtered/truncated)
    const totalIncome = summaries.reduce((s, sm) => s + (sm.totalIncome || 0), 0);
    const totalExpense = summaries.reduce((s, sm) => s + (sm.totalExpense || 0), 0);
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

      // Undistributed counts only received income — pending sales are dues, not money in hand
      const receivedIncome = transactions
        .filter(t => t.type === 'income' && t.paymentStatus !== 'pending')
        .reduce((s, t) => s + t.amount, 0);

      autoTable(pdf, {
        startY: 30,
        head: [['Person', 'Total Received']],
        body: [
          ...Object.entries(personTotals).map(([name, amt]) => [name, pdfCurrency(amt)]),
          ['Total Distributed', pdfCurrency(totalDist)],
          ['Undistributed', pdfCurrency(receivedIncome - totalDist)],
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

  exportLoanDetailPdf(loan: Loan, repayments: Repayment[], linkedTxns: any[], linkedLoans: Loan[]): void {
    const pdf = new jsPDF();
    const sourceName = loan.loanSourceName ?? loan.personName;
    const ts = (t: any) => t?.toDate?.()?.toLocaleDateString('en-IN') ?? '-';

    // Title
    pdf.setFontSize(18);
    pdf.text(`Loan Detail: ${sourceName}`, 14, 22);
    pdf.setFontSize(10);
    pdf.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 30);

    // Summary table
    autoTable(pdf, {
      startY: 36,
      head: [['Field', 'Value']],
      body: [
        ['Source', `${sourceName} (${loan.loanSource ?? '-'})`],
        ['Account', loan.accountNumber ?? '-'],
        ['Sanctioned Amount', pdfCurrency(loan.sanctionedAmount ?? 0)],
        ['Total Deductions', pdfCurrency(loan.totalDeductions ?? 0)],
        ['Net Disbursed', pdfCurrency(loan.netDisbursedAmount ?? 0)],
        ['Disbursement Date', ts(loan.disbursementDate)],
        ['Held By', loan.heldByName ?? '-'],
        ['Repayment Type', (loan.repaymentType ?? '-')],
        ['Interest Rate', `${loan.interestRateInput ?? '-'}% ${loan.interestFrequency ?? ''} (${loan.interestRate ?? '-'}% p.a.)`],
        ...(loan.isSubsidized ? [['Subsidy', `${loan.subsidyDetails ?? ''} (Eff: ${loan.effectiveRate ?? '-'}%)`]] : []),
        ...(loan.repaymentType === 'emi' ? [
          ['Tenure', `${loan.tenure ?? '-'} months`],
          ['EMI Amount', pdfCurrency(loan.emiAmount ?? 0)],
          ['EMIs Paid', `${loan.emisPaid ?? 0} / ${loan.totalEMIs ?? 0}`],
        ] : [
          ['Interest/Period', pdfCurrency(loan.interestAmountPerPeriod ?? 0)],
          ['Payments Made', `${loan.totalInterestPaymentsMade ?? 0}`],
        ]),
        ['Outstanding Balance', pdfCurrency(loan.outstandingBalance ?? 0)],
        ['Total Principal Paid', pdfCurrency(loan.totalPrincipalPaid ?? 0)],
        ['Total Interest Paid', pdfCurrency(loan.totalInterestPaid ?? 0)],
        ['Total Repaid', pdfCurrency(loan.totalRepaid)],
        ...(loan.totalPenaltyPaid ? [['Penalty Paid', pdfCurrency(loan.totalPenaltyPaid)]] : []),
        ...(loan.totalPartPayments ? [['Part-Payments', pdfCurrency(loan.totalPartPayments)]] : []),
        ['Utilization', `${pdfCurrency(loan.utilizationTotal ?? 0)} used / ${pdfCurrency(loan.utilizationRemaining ?? 0)} remaining`],
        ['Status', loan.repaymentStatus],
        ...(loan.closureReason ? [['Closure', `${loan.closureReason} on ${ts(loan.loanClosureDate)}`]] : []),
        ...(loan.preClosureCharges ? [['Pre-closure Charges', pdfCurrency(loan.preClosureCharges)]] : []),
        ...(loan.totalCollateralValue ? [['Collateral Value', pdfCurrency(loan.totalCollateralValue)]] : []),
      ],
      theme: 'grid',
      styles: { fontSize: 9 },
    });

    // Deductions summary
    if (loan.deductions?.length) {
      autoTable(pdf, {
        head: [['Deduction', 'Amount', 'Paid To', 'Financed']],
        body: loan.deductions.map(d => [
          d.type === 'other' ? (d.customLabel ?? 'Other') : d.type.replace(/_/g, ' '),
          pdfCurrency(d.amount), d.paidTo, d.isFinanced ? 'Yes' : 'No',
        ]),
        theme: 'striped', styles: { fontSize: 8 },
      });
    }

    // Collateral summary
    if (loan.collaterals?.length) {
      autoTable(pdf, {
        head: [['Collateral', 'Value', 'Status']],
        body: loan.collaterals.map(c => [
          `${c.description}${c.weight ? ` (${c.weight}g ${c.purity ?? ''})` : ''}`,
          pdfCurrency(c.estimatedValue),
          c.isReleased ? `Released ${ts(c.releasedDate)}` : 'Pledged',
        ]),
        theme: 'striped', styles: { fontSize: 8 },
      });
    }

    // Personal withdrawals summary
    if (linkedLoans.length) {
      autoTable(pdf, {
        head: [['Person', 'Taken', 'Returned', 'Holding', 'Status']],
        body: linkedLoans.map(sl => [
          sl.personName, pdfCurrency(sl.amount), pdfCurrency(sl.totalRepaid),
          pdfCurrency(sl.balanceRemaining), sl.repaymentStatus,
        ]),
        theme: 'striped', styles: { fontSize: 8 },
      });
    }

    pdf.save(`loan-${sourceName}-summary.pdf`);
  }

  exportTransactionsCsv(transactions: Transaction[], filename: string): void {
    const headers = 'Date,Type,Segment,Category,Amount,Paid By,Payment Method,Description,Quantity,Unit,Rate Per Unit,Payment Status,Distribution\n';
    const rows = transactions
      .map(
        (t) => {
          const distStr = t.distributions?.length
            ? t.distributions.map(d => `${d.name}: ${d.amount}`).join('; ')
            : '';
          return [
            t.date.toDate().toLocaleDateString('en-IN'),
            t.type,
            csvField(t.segmentName),
            csvField(t.categoryName),
            t.amount,
            csvField(t.paidByName || t.createdByName),
            t.paymentMethod || 'upi',
            csvField(t.description),
            t.quantity || '',
            t.unit || '',
            t.ratePerUnit || '',
            t.paymentStatus || '',
            csvField(distStr),
          ].join(',');
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
      Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([name, amt]) => `${csvField(name)},${amt},,,,,,`).join('\n');

    // Paid By breakdown
    const personMap: Record<string, number> = {};
    for (const t of transactions) {
      const name = t.paidByName || t.createdByName || 'Unknown';
      personMap[name] = (personMap[name] || 0) + t.amount;
    }
    const personRows = `\n\n,,,,,,,\nPaid By,Total Amount,,,,,,\n` +
      Object.entries(personMap).sort((a, b) => b[1] - a[1]).map(([name, amt]) => `${csvField(name)},${amt},,,,,,`).join('\n');

    this.downloadFile(headers + rows + totalsRows + catRows + personRows, `${filename}.csv`, 'text/csv');
  }

  exportLoansCsv(loans: Loan[], filename: string): void {
    const headers = 'Date,Type,Person,Amount,Repaid,Balance,Status,Purpose,Segment,Recorded By,Category,Source,Source Name,Account,Sanctioned,Net Disbursed,Interest Rate,Repayment Type,Tenure,EMI,Outstanding,Interest Paid,Penalty Paid,Closure Reason\n';
    const rows = loans
      .map(
        (l) => {
          const base = [
            l.date.toDate().toLocaleDateString('en-IN'), l.type, csvField(l.personName),
            l.amount, l.totalRepaid, l.balanceRemaining, l.repaymentStatus,
            csvField(l.purpose), csvField(l.segmentName), csvField(l.recordedByName),
          ].join(',');
          if (l.loanCategory === 'formal') {
            return `${base},formal,${csvField(l.loanSource)},${csvField(l.loanSourceName)},${csvField(l.accountNumber)},${l.sanctionedAmount ?? ''},${l.netDisbursedAmount ?? ''},${l.interestRate ?? ''}%,${l.repaymentType ?? ''},${l.tenure ?? ''},${l.emiAmount ?? ''},${l.outstandingBalance ?? ''},${l.totalInterestPaid ?? ''},${l.totalPenaltyPaid ?? ''},${l.closureReason ?? ''}`;
          }
          return `${base},simple,,,,,,,,,,,,`;
        }
      )
      .join('\n');

    this.downloadFile(headers + rows, `${filename}.csv`, 'text/csv');
  }

  /** Export a single formal loan detail as Excel (full backup with all fields for re-import) */
  async exportLoanDetailExcel(loan: Loan, repayments: Repayment[], linkedTxns: any[], linkedLoans: Loan[]): Promise<void> {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const sourceName = loan.loanSourceName ?? loan.personName;

    const ts = (t: any) => t?.toDate?.()?.toLocaleDateString('en-IN') ?? '';

    // Overview sheet — all fields for re-import
    const overview = [
      { Field: 'ID', Value: loan.id },
      { Field: 'Date', Value: ts(loan.date) },
      { Field: 'Person', Value: loan.personName },
      { Field: 'Purpose', Value: loan.purpose },
      { Field: 'Segment', Value: loan.segment },
      { Field: 'Segments', Value: (loan.segments ?? []).join('; ') },
      { Field: 'Loan Source', Value: loan.loanSource ?? '' },
      { Field: 'Source Name', Value: loan.loanSourceName ?? '' },
      { Field: 'Account Number', Value: loan.accountNumber ?? '' },
      { Field: 'Sanctioned Amount', Value: loan.sanctionedAmount ?? 0 },
      { Field: 'Total Deductions', Value: loan.totalDeductions ?? 0 },
      { Field: 'Net Disbursed', Value: loan.netDisbursedAmount ?? 0 },
      { Field: 'Disbursement Date', Value: ts(loan.disbursementDate) },
      { Field: 'Repayment Type', Value: loan.repaymentType ?? '' },
      { Field: 'Interest Type', Value: loan.interestType ?? '' },
      { Field: 'Interest Frequency', Value: loan.interestFrequency ?? '' },
      { Field: 'Interest Rate Input', Value: loan.interestRateInput ?? '' },
      { Field: 'Interest Rate Annual', Value: loan.interestRate ?? '' },
      { Field: 'Is Subsidized', Value: loan.isSubsidized ?? false },
      { Field: 'Subsidy Details', Value: loan.subsidyDetails ?? '' },
      { Field: 'Effective Rate', Value: loan.effectiveRate ?? '' },
      { Field: 'Tenure', Value: loan.tenure ?? '' },
      { Field: 'EMI Amount', Value: loan.emiAmount ?? '' },
      { Field: 'Total EMIs', Value: loan.totalEMIs ?? '' },
      { Field: 'EMIs Paid', Value: loan.emisPaid ?? '' },
      { Field: 'Moratorium Months', Value: loan.moratoriumMonths ?? '' },
      { Field: 'Interest Payment Frequency', Value: loan.interestPaymentFrequency ?? '' },
      { Field: 'Interest Per Period', Value: loan.interestAmountPerPeriod ?? '' },
      { Field: 'Outstanding Balance', Value: loan.outstandingBalance ?? 0 },
      { Field: 'Total Repaid', Value: loan.totalRepaid },
      { Field: 'Balance Remaining', Value: loan.balanceRemaining },
      { Field: 'Total Interest Paid', Value: loan.totalInterestPaid ?? 0 },
      { Field: 'Total Principal Paid', Value: loan.totalPrincipalPaid ?? 0 },
      { Field: 'Total Part Payments', Value: loan.totalPartPayments ?? 0 },
      { Field: 'Total Penalty Paid', Value: loan.totalPenaltyPaid ?? 0 },
      { Field: 'Utilization Total', Value: loan.utilizationTotal ?? 0 },
      { Field: 'Utilization Remaining', Value: loan.utilizationRemaining ?? 0 },
      { Field: 'Held By', Value: loan.heldByName ?? '' },
      { Field: 'Held By UID', Value: loan.heldByUid ?? '' },
      { Field: 'Status', Value: loan.repaymentStatus },
      { Field: 'Closure Reason', Value: loan.closureReason ?? '' },
      { Field: 'Closure Date', Value: ts(loan.loanClosureDate) },
      { Field: 'Pre-closure Charges', Value: loan.preClosureCharges ?? '' },
      { Field: 'Replaces Loan ID', Value: loan.replacesLoanId ?? '' },
      { Field: 'Replaced By Loan ID', Value: loan.replacedByLoanId ?? '' },
      { Field: 'Is Balance Transfer', Value: loan.isBalanceTransfer ?? false },
      { Field: 'Collateral Value', Value: loan.totalCollateralValue ?? '' },
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overview), 'Overview');

    // Deductions — all fields
    if (loan.deductions?.length) {
      const dedRows = loan.deductions.map(d => ({
        ID: d.id, Type: d.type, 'Custom Label': d.customLabel ?? '', Amount: d.amount,
        'Paid To': d.paidTo, Date: ts(d.date), Reference: d.paymentReference ?? '',
        Financed: d.isFinanced ? 'Yes' : 'No', Note: d.note ?? '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dedRows), 'Deductions');
    }

    // Repayments — all fields
    if (repayments.length) {
      const repRows = repayments.map(r => ({
        ID: r.id, Date: ts(r.date), Amount: r.amount,
        'EMI Payment': r.isEMIPayment ?? false, 'EMI Number': r.emiNumber ?? '',
        Principal: r.principalPortion ?? '', Interest: r.interestPortion ?? '',
        'Part Payment': r.isPartPayment ?? false, 'Pre-closure': r.isPreClosure ?? false,
        'Pre-closure Charges': r.preClosureCharges ?? '', Penalty: r.penaltyAmount ?? '',
        Reference: r.paymentReference ?? '', 'Transaction ID': r.transactionId ?? '',
        'Scheduled Due Date': ts(r.scheduledDueDate), 'Paid By': r.paidBy ?? '',
        'Paid By Name': r.paidByName ?? '', 'Recorded By': r.recordedBy, Note: r.note,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(repRows), 'Repayments');
    }

    // Utilization — all fields
    if (linkedTxns.length) {
      const utilRows = linkedTxns.map((t: any) => ({
        ID: t.id, Date: ts(t.date), Amount: t.amount,
        Segment: t.segment, 'Segment Name': t.segmentName,
        Category: t.category, 'Category Name': t.categoryName,
        Description: t.description, 'Payment Method': t.paymentMethod ?? '',
        'Paid By': t.paidBy ?? '', 'Paid By Name': t.paidByName ?? '', Month: t.month,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(utilRows), 'Utilization');
    }

    // Personal Withdrawals — all fields
    if (linkedLoans.length) {
      const persRows = linkedLoans.map(sl => ({
        ID: sl.id, Date: ts(sl.date), Person: sl.personName, 'Person UID': sl.personUid ?? '',
        Amount: sl.amount, Repaid: sl.totalRepaid, Holding: sl.balanceRemaining,
        Status: sl.repaymentStatus, Purpose: sl.purpose, Segment: sl.segmentName,
        'Parent Loan ID': sl.parentFormalLoanId ?? '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(persRows), 'Personal');
    }

    // Collateral — all fields
    if (loan.collaterals?.length) {
      const colRows = loan.collaterals.map(c => ({
        ID: c.id, Type: c.type, Description: c.description, Value: c.estimatedValue,
        Weight: c.weight ?? '', Purity: c.purity ?? '', 'Document Ref': c.documentReference ?? '',
        Note: c.note ?? '', Status: c.isReleased ? 'Released' : 'Pledged',
        'Released Date': ts(c.releasedDate),
        'Item Name': c.itemName ?? '', Quantity: c.quantity ?? '',
        'Gross Weight': c.grossWeight ?? '', 'Net Weight': c.netWeight ?? '',
        'Gold Rate Per Gram': c.goldRatePerGram ?? '', 'Gold Value': c.goldValue ?? '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(colRows), 'Collateral');
    }

    // Rate Changes
    if (loan.rateChanges?.length) {
      const rcRows = loan.rateChanges.map(rc => ({
        ID: rc.id, Date: ts(rc.date), 'Old Rate': rc.oldRate, 'New Rate': rc.newRate,
        'New EMI': rc.newEMI ?? '', 'Recorded By': rc.recordedBy, Note: rc.note ?? '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rcRows), 'Rate Changes');
    }

    // Documents
    if (loan.documents?.length) {
      const docRows = loan.documents.map(d => ({
        ID: d.id, Type: d.type, 'Custom Label': d.customLabel ?? '',
        'Reference Number': d.referenceNumber ?? '', Date: ts(d.date), Note: d.note ?? '',
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(docRows), 'Documents');
    }

    XLSX.writeFile(wb, `loan-${sourceName}-detail.xlsx`);
  }

  async exportBackupExcel(data: BackupData): Promise<void> {
    const XLSX = await import('xlsx');

    // Business dates: DD/MM/YYYY (en-IN). Audit timestamps: ISO (lossless round-trip).
    const ts = (t: any) => t?.toDate?.()?.toLocaleDateString('en-IN') ?? '';
    const tsIso = (t: any) => t?.toDate?.()?.toISOString() ?? '';
    const joinSemi = (arr: any[] | null | undefined) => arr?.join('; ') ?? '';
    const mapIdAmt = (m: Record<string, number> | null | undefined) =>
      m ? Object.entries(m).map(([id, amt]) => `${id}:${amt}`).join('; ') : '';
    const json = (v: any) => (v == null ? '' : JSON.stringify(v));

    const { expenses, income, loans, inventoryEvents, animals, buyers } = data;

    // --- Expenses Sheet (all fields for re-import) ---
    const expenseRows = expenses.map(t => ({
      'ID': t.id,
      'Date': ts(t.date),
      'Month': t.month,
      'Year': t.year,
      'Segment': t.segment,
      'Segment Name': t.segmentName,
      'Category': t.category,
      'Category Name': t.categoryName,
      'Amount': t.amount,
      'Quantity': t.quantity || '',
      'Unit': t.unit || '',
      'Rate Per Unit': t.ratePerUnit || '',
      'Paid By': t.paidBy || '',
      'Paid By Name': t.paidByName || t.createdByName || '',
      'Payment Method': t.paymentMethod || 'upi',
      'Payment Status': t.expensePaymentStatus || 'paid',
      'Description': t.description,
      'Tags': (t as any).tags?.join(', ') || '',
      'Linked Loan ID': (t as any).linkedLoanId || '',
      'Linked Animal IDs': t.linkedAnimalIds?.join('; ') || '',
      'Linked Animal Names': t.linkedAnimalNames?.join('; ') || '',
      'Animal Cost Split': t.animalCostSplit ? Object.entries(t.animalCostSplit).map(([id, amt]) => `${id}:${amt}`).join('; ') : '',
      'Linked Buyer ID': t.linkedBuyerId || '',
      'Linked Buyer Name': t.linkedBuyerName || '',
      'Linked Supplier ID': t.linkedSupplierId || '',
      'Linked Supplier Name': t.linkedSupplierName || '',
      'Linked Harvest ID': t.linkedHarvestId || '',
      'Linked Harvest Name': t.linkedHarvestName || '',
      'Linked Sale Txn ID': t.linkedSaleTransactionId || '',
      'Linked Sale Label': t.linkedSaleLabel || '',
      'Created By': t.createdBy,
      'Created By Name': t.createdByName,
      'Created At': tsIso(t.createdAt),
    }));

    // --- Income Sheet (all fields for re-import) ---
    const incomeRows = income.map(t => {
      const distStr = t.distributions?.length
        ? t.distributions.map(d => `${d.uid}:${d.name}:${d.amount}`).join('; ')
        : '';
      return {
        'ID': t.id,
        'Date': ts(t.date),
        'Month': t.month,
        'Year': t.year,
        'Segment': t.segment,
        'Segment Name': t.segmentName,
        'Category': t.category,
        'Category Name': t.categoryName,
        'Amount': t.amount,
        'Quantity': t.quantity || '',
        'Unit': t.unit || '',
        'Rate Per Unit': t.ratePerUnit || '',
        'Received By': t.paidBy || '',
        'Received By Name': t.paidByName || t.createdByName || '',
        'Payment Method': t.paymentMethod || 'upi',
        'Payment Status': t.paymentStatus || 'received',
        'Description': t.description,
        'Tags': (t as any).tags?.join(', ') || '',
        'Distribution': distStr,
        'Linked Animal IDs': t.linkedAnimalIds?.join('; ') || '',
        'Linked Animal Names': t.linkedAnimalNames?.join('; ') || '',
        'Animal Cost Split': t.animalCostSplit ? Object.entries(t.animalCostSplit).map(([id, amt]) => `${id}:${amt}`).join('; ') : '',
        'Linked Buyer ID': t.linkedBuyerId || '',
        'Linked Buyer Name': t.linkedBuyerName || '',
        'Linked Harvest ID': t.linkedHarvestId || '',
        'Linked Harvest Name': t.linkedHarvestName || '',
        'Created By': t.createdBy,
        'Created By Name': t.createdByName,
        'Created At': tsIso(t.createdAt),
      };
    });

    // --- Inventory Events Sheet (all fields for re-import) ---
    const eventRows = inventoryEvents.map((e: any) => ({
      'ID': e.id,
      'Date': ts(e.date),
      'Segment': e.segment,
      'Segment Name': e.segmentName,
      'Event Type': e.eventType,
      'Count': e.count,
      'Breed': e.breed ?? '',
      'Note': e.note,
      'Month': e.month,
      'Year': e.year,
      'Estimated Value': e.estimatedValue ?? '',
      'Linked Animal IDs': joinSemi(e.linkedAnimalIds),
      'Created By': e.createdBy,
      'Created By Name': e.createdByName,
      'Created At': tsIso(e.createdAt),
    }));

    // --- Loans Sheet (all fields for re-import) ---
    const loanRows = loans.map(l => ({
      'ID': l.id,
      'Date': ts(l.date),
      'Type': l.type,
      'Person': l.personName,
      'Person UID': l.personUid ?? '',
      'Amount': l.amount,
      'Repaid': l.totalRepaid,
      'Balance': l.balanceRemaining,
      'Status': l.repaymentStatus,
      'Purpose': l.purpose,
      'Segment': l.segment,
      'Segment Name': l.segmentName,
      'Month': l.month,
      'Year': l.year,
      'Category': l.loanCategory ?? 'simple',
      'Source': l.loanSource ?? '',
      'Source Name': l.loanSourceName ?? '',
      'Account': l.accountNumber ?? '',
      'Sanctioned': l.sanctionedAmount ?? '',
      'Net Disbursed': l.netDisbursedAmount ?? '',
      'Total Deductions': l.totalDeductions ?? '',
      'Disbursement Date': ts(l.disbursementDate),
      'Repayment Type': l.repaymentType ?? '',
      'Interest Type': l.interestType ?? '',
      'Interest Frequency': l.interestFrequency ?? '',
      'Interest Rate Input': l.interestRateInput ?? '',
      'Interest Rate Annual': l.interestRate ?? '',
      'Is Subsidized': l.isSubsidized ?? false,
      'Subsidy Details': l.subsidyDetails ?? '',
      'Effective Rate': l.effectiveRate ?? '',
      'Tenure': l.tenure ?? '',
      'EMI Amount': l.emiAmount ?? '',
      'Total EMIs': l.totalEMIs ?? '',
      'EMIs Paid': l.emisPaid ?? '',
      'Moratorium': l.moratoriumMonths ?? '',
      'EMI Start Date': ts(l.emiStartDate),
      'Next Payment Due': ts(l.nextPaymentDueDate),
      'Next Payment Number': l.nextPaymentNumber ?? '',
      'Interest Payment Freq': l.interestPaymentFrequency ?? '',
      'Interest Per Period': l.interestAmountPerPeriod ?? '',
      'Interest Payments Made': l.totalInterestPaymentsMade ?? '',
      'Outstanding': l.outstandingBalance ?? '',
      'Interest Paid': l.totalInterestPaid ?? '',
      'Principal Paid': l.totalPrincipalPaid ?? '',
      'Part Payments': l.totalPartPayments ?? '',
      'Penalty Paid': l.totalPenaltyPaid ?? '',
      'Utilization Total': l.utilizationTotal ?? '',
      'Utilization Remaining': l.utilizationRemaining ?? '',
      'Held By': l.heldByName ?? '',
      'Held By UID': l.heldByUid ?? '',
      'Closure Reason': l.closureReason ?? '',
      'Closure Date': ts(l.loanClosureDate),
      'Pre-closure Charges': l.preClosureCharges ?? '',
      'Replaces Loan': l.replacesLoanId ?? '',
      'Replaced By Loan': l.replacedByLoanId ?? '',
      'Is Balance Transfer': l.isBalanceTransfer ?? false,
      'Parent Formal Loan': l.parentFormalLoanId ?? '',
      'Segments': (l.segments ?? []).join('; '),
      'Segment Names': (l.segmentNames ?? []).join('; '),
      'Collateral Value': l.totalCollateralValue ?? '',
      'Pledge Receipt': l.pledgeReceiptNumber ?? '',
      'LTV Ratio': l.ltvRatio ?? '',
      'Total Gold Weight': l.totalGoldWeight ?? '',
      'Total Gold Value': l.totalGoldValue ?? '',
      'Eligible Loan Amount': l.eligibleLoanAmount ?? '',
      'Renewed From Loan': l.renewedFromLoanId ?? '',
      'Renewed By Loan': l.renewedByLoanId ?? '',
      'Is Renewal': l.isRenewal ?? false,
      'Recorded By': l.recordedBy,
      'Recorded By Name': l.recordedByName,
      'Created At': tsIso(l.createdAt),
    }));

    // --- Loan child sheets (formal-loan nested detail + repayment subcollections) ---
    const loanDeductionRows = loans.flatMap(l => (l.deductions ?? []).map(d => ({
      'Loan ID': l.id, 'ID': d.id, 'Type': d.type, 'Custom Label': d.customLabel ?? '',
      'Amount': d.amount, 'Paid To': d.paidTo, 'Date': ts(d.date),
      'Reference': d.paymentReference ?? '', 'Financed': d.isFinanced ? 'Yes' : 'No',
      'Note': d.note ?? '',
    })));

    const loanCollateralRows = loans.flatMap(l => (l.collaterals ?? []).map(c => ({
      'Loan ID': l.id, 'ID': c.id, 'Type': c.type, 'Description': c.description,
      'Value': c.estimatedValue, 'Weight': c.weight ?? '', 'Purity': c.purity ?? '',
      'Document Ref': c.documentReference ?? '', 'Note': c.note ?? '',
      'Status': c.isReleased ? 'Released' : 'Pledged', 'Released Date': ts(c.releasedDate),
      'Item Name': c.itemName ?? '', 'Quantity': c.quantity ?? '',
      'Gross Weight': c.grossWeight ?? '', 'Net Weight': c.netWeight ?? '',
      'Gold Rate Per Gram': c.goldRatePerGram ?? '', 'Gold Value': c.goldValue ?? '',
    })));

    const loanRateChangeRows = loans.flatMap(l => (l.rateChanges ?? []).map(rc => ({
      'Loan ID': l.id, 'ID': rc.id, 'Date': ts(rc.date), 'Old Rate': rc.oldRate,
      'New Rate': rc.newRate, 'New EMI': rc.newEMI ?? '',
      'Recorded By': rc.recordedBy, 'Recorded By Name': rc.recordedByName,
      'Note': rc.note ?? '',
    })));

    const loanDocumentRows = loans.flatMap(l => (l.documents ?? []).map(d => ({
      'Loan ID': l.id, 'ID': d.id, 'Type': d.type, 'Custom Label': d.customLabel ?? '',
      'Reference Number': d.referenceNumber ?? '', 'Date': ts(d.date), 'Note': d.note ?? '',
    })));

    const loanRepaymentRows = data.repaymentsByLoan.flatMap(entry => entry.repayments.map(r => ({
      'Loan ID': entry.loanId, 'ID': r.id, 'Date': ts(r.date), 'Amount': r.amount,
      'Note': r.note, 'Paid By': r.paidBy ?? '', 'Paid By Name': r.paidByName ?? '',
      'Recorded By': r.recordedBy, 'Recorded By Name': r.recordedByName,
      'Created At': tsIso(r.createdAt), 'Scheduled Due Date': ts(r.scheduledDueDate),
      'EMI Payment': r.isEMIPayment ?? false, 'EMI Number': r.emiNumber ?? '',
      'Principal': r.principalPortion ?? '', 'Interest': r.interestPortion ?? '',
      'Reference': r.paymentReference ?? '', 'Transaction ID': r.transactionId ?? '',
      'Part Payment': r.isPartPayment ?? false, 'Pre-closure': r.isPreClosure ?? false,
      'Pre-closure Charges': r.preClosureCharges ?? '', 'Penalty': r.penaltyAmount ?? '',
    })));

    // --- Animals Sheet ---
    const animalRows = animals.map(a => ({
      'ID': a.id,
      'Segment': a.segment,
      'Segment Name': a.segmentName,
      'Tracking Mode': a.trackingMode,
      'Tag': a.tag ?? '',
      'Name': a.name ?? '',
      'Breed': a.breed ?? '',
      'Gender': a.gender ?? '',
      'Batch Label': a.batchLabel ?? '',
      'Batch Size': a.batchSize,
      'Current Count': a.currentCount,
      'Origin': a.origin,
      'Origin Date': ts(a.originDate),
      'Origin Event ID': a.originInventoryEventId ?? '',
      'Purchase Price': a.purchasePrice ?? '',
      'Purchase Price Per Head': a.purchasePricePerHead ?? '',
      'Status': a.status,
      'Total Costs': a.totalCosts,
      'Total Invested': a.totalInvested,
      'Sale Price': a.salePrice ?? '',
      'Sale Price Per Head': a.salePricePerHead ?? '',
      'Profit': a.profit ?? '',
      'Profit Margin %': a.profitMargin ?? '',
      'Buyer': a.buyerName ?? '',
      'Buyer ID': a.buyerId ?? '',
      'Exit Date': ts(a.exitDate),
      'Exit Type': a.exitType ?? '',
      'Sale Txn ID': a.saleTransactionId ?? '',
      'Sale Event ID': a.saleInventoryEventId ?? '',
      'Death Cause': a.deathCause ?? '',
      'Death Note': a.deathNote ?? '',
      'Age At Death Days': a.ageAtDeathDays ?? '',
      'Note': a.note ?? '',
      'Created By': a.createdBy,
      'Created By Name': a.createdByName,
      'Created At': tsIso(a.createdAt),
    }));

    // --- Animal child sheets (embedded cost/health detail) ---
    const animalCostRows = animals.flatMap(a => (a.costEntries ?? []).map(c => ({
      'Animal ID': a.id, 'Transaction ID': c.transactionId, 'Date': ts(c.date),
      'Category': c.category, 'Category Name': c.categoryName,
      'Amount': c.amount, 'Description': c.description ?? '',
    })));

    const animalVaccinationRows = animals.flatMap(a => (a.vaccinationHistory ?? []).map(v => ({
      'Animal ID': a.id, 'ID': v.id, 'Date': ts(v.date), 'Vaccine': v.vaccineName,
      'Dosage': v.dosage ?? '', 'Administered By': v.administeredBy ?? '',
      'Next Due Date': ts(v.nextDueDate), 'Batch Number': v.batchNumber ?? '',
      'Cost': v.cost ?? '', 'Linked Txn ID': v.linkedTransactionId ?? '', 'Note': v.note ?? '',
    })));

    const animalMedicalRows = animals.flatMap(a => (a.medicalHistory ?? []).map(m => ({
      'Animal ID': a.id, 'ID': m.id, 'Date': ts(m.date), 'Type': m.type,
      'Disease': m.disease ?? '', 'Symptoms': m.symptoms ?? '', 'Medicine': m.medicine ?? '',
      'Dosage': m.dosage ?? '', 'Doctor': m.doctor ?? '', 'Temperature': m.temperature ?? '',
      'Weight': m.weight ?? '', 'Cost': m.cost ?? '',
      'Linked Txn ID': m.linkedTransactionId ?? '', 'Note': m.note ?? '',
    })));

    const animalWeightRows = animals.flatMap(a => (a.weightLogs ?? []).map(w => ({
      'Animal ID': a.id, 'ID': w.id, 'Date': ts(w.date),
      'Weight': w.weight, 'Remarks': w.remarks ?? '',
    })));

    // --- Buyers Sheet ---
    const buyerRows = buyers.map(b => ({
      'ID': b.id,
      'Name': b.name,
      'Phone': b.phone ?? '',
      'Location': b.location ?? '',
      'Total Purchases': b.totalPurchases,
      'Total Amount Paid': b.totalAmountPaid,
      'Average Rate': b.averageRate ?? '',
      'Last Purchase': ts(b.lastPurchaseDate),
      'Purchases By Segment': mapIdAmt(b.purchasesBySegment),
      'Amount By Segment': mapIdAmt(b.amountBySegment),
      'Note': b.note ?? '',
      'Created By': b.createdBy,
      'Created By Name': b.createdByName,
      'Created At': tsIso(b.createdAt),
    }));

    // --- Suppliers Sheet ---
    const supplierRows = data.suppliers.map(s => ({
      'ID': s.id,
      'Name': s.name,
      'Phone': s.phone ?? '',
      'Location': s.location ?? '',
      'GST Number': s.gstNumber ?? '',
      'Item Categories': joinSemi(s.itemCategories),
      'Total Orders': s.totalOrders,
      'Total Amount Paid': s.totalAmountPaid,
      'Pending Amount': s.pendingAmount,
      'Average Rate': s.averageRate ?? '',
      'Last Order Date': ts(s.lastOrderDate),
      'Orders By Segment': mapIdAmt(s.ordersBySegment),
      'Amount By Segment': mapIdAmt(s.amountBySegment),
      'Note': s.note ?? '',
      'Created By': s.createdBy,
      'Created By Name': s.createdByName,
      'Created At': tsIso(s.createdAt),
    }));

    // --- Categories Sheet ---
    const categoryRows = data.categories.map(c => ({
      'ID': c.id, 'Name': c.name, 'Type': c.type, 'Active': c.isActive,
      'Segments': joinSemi(c.segments),
    }));

    // --- Segments Sheet ---
    const segmentRows = data.segments.map(s => ({
      'ID': s.id,
      'Name': s.name,
      'Description': s.description,
      'Icon': s.icon,
      'Active': s.isActive,
      'Segment Type': s.segmentType ?? '',
      'Unit': s.unit ?? '',
      'Current Stock': s.currentStock ?? '',
      'Breeds': joinSemi(s.breeds),
      'Monthly Expense Limit': s.budgets?.monthlyExpenseLimit ?? '',
      'Monthly Income Target': s.budgets?.monthlyIncomeTarget ?? '',
      'Created At': tsIso(s.createdAt),
    }));

    // --- Users Sheet ---
    const userRows = data.users.map(u => ({
      'UID': u.uid || (u as any).id,
      'Email': u.email,
      'Display Name': u.displayName,
      'Role': u.role,
      'Assigned Segments': joinSemi(u.assignedSegments),
      'Active': u.isActive,
      'Created By': u.createdBy,
      'Created At': tsIso(u.createdAt),
      'Updated At': tsIso(u.updatedAt),
    }));

    // --- Tasks Sheet ---
    const taskRows = data.tasks.map(t => ({
      'ID': t.id,
      'Title': t.title,
      'Description': t.description,
      'Priority': t.priority,
      'Status': t.status,
      'Visibility': t.visibility,
      'Assignee': t.assignee ?? '',
      'Assignee Name': t.assigneeName ?? '',
      'Due Date': ts(t.dueDate),
      'Subtasks': t.subtasks?.length ? json(t.subtasks) : '',
      'Tags': t.tags?.join(', ') ?? '',
      'Kanban Order': t.kanbanOrder,
      'Created By': t.createdBy,
      'Created By Name': t.createdByName,
      'Created At': tsIso(t.createdAt),
      'Updated At': tsIso(t.updatedAt),
      'Completed At': tsIso(t.completedAt),
    }));

    // --- Schedules Sheet ---
    const scheduleRows = data.schedules.map(s => ({
      'ID': s.id,
      'Type': s.type,
      'Title': s.title,
      'Description': s.description,
      'Frequency': s.frequency,
      'Start Date': ts(s.startDate),
      'End Date': ts(s.endDate),
      'Next Due Date': ts(s.nextDueDate),
      'Last Processed': tsIso(s.lastProcessedDate),
      'Active': s.isActive,
      'Processed Count': s.processedCount,
      'Transaction Template': s.transactionTemplate ? json(s.transactionTemplate) : '',
      'Reminder Config': s.reminderConfig ? json(s.reminderConfig) : '',
      'Created By': s.createdBy,
      'Created By Name': s.createdByName,
      'Created At': tsIso(s.createdAt),
    }));

    // --- Harvests Sheet + Harvest Sales child sheet ---
    const harvestRows = data.harvests.map(h => ({
      'ID': h.id,
      'Segment': h.segment,
      'Segment Name': h.segmentName,
      'Status': h.status,
      'Harvest Date': ts(h.harvestDate),
      'Crop Name': h.cropName,
      'Variety': h.variety ?? '',
      'Total Quantity': h.totalQuantity,
      'Unit': h.unit,
      'Grade': h.grade ?? '',
      'Storage Location': h.storageLocation ?? '',
      'Storage Date': ts(h.storageDate),
      'Total Sold': h.totalSold,
      'Total Revenue': h.totalRevenue,
      'Wastage Quantity': h.wastageQuantity,
      'Wastage Reason': h.wastageReason ?? '',
      'Wastage Date': ts(h.wastageDate),
      'Remaining Quantity': h.remainingQuantity,
      'Average Rate': h.averageRate ?? '',
      'Harvest Cost': h.harvestCost ?? '',
      'Linked Crop Activity ID': h.linkedCropActivityId ?? '',
      'Note': h.note ?? '',
      'Month': h.month,
      'Year': h.year,
      'Created By': h.createdBy,
      'Created By Name': h.createdByName,
      'Created At': tsIso(h.createdAt),
    }));

    const harvestSaleRows = data.harvests.flatMap(h => (h.sales ?? []).map(s => ({
      'Harvest ID': h.id, 'ID': s.id, 'Date': ts(s.date), 'Quantity': s.quantity,
      'Unit': s.unit, 'Rate Per Unit': s.ratePerUnit, 'Total Amount': s.totalAmount,
      'Buyer ID': s.buyerId ?? '', 'Buyer Name': s.buyerName ?? '',
      'Linked Txn ID': s.linkedTransactionId ?? '', 'Note': s.note ?? '',
    })));

    // --- Breeding Sheet ---
    const breedingRows = data.breedingRecords.map(b => ({
      'ID': b.id,
      'Segment': b.segment,
      'Segment Name': b.segmentName,
      'Sire ID': b.sireId ?? '',
      'Sire Name': b.sireName ?? '',
      'Dam ID': b.damId,
      'Dam Name': b.damName,
      'Mating Date': ts(b.matingDate),
      'Mating Method': b.matingMethod ?? '',
      'Status': b.status,
      'Expected Delivery': ts(b.expectedDeliveryDate),
      'Gestation Days': b.gestationDays ?? '',
      'Actual Delivery': ts(b.actualDeliveryDate),
      'Offspring Count': b.offspringCount ?? '',
      'Offspring Male': b.offspringMale ?? '',
      'Offspring Female': b.offspringFemale ?? '',
      'Offspring Animal IDs': joinSemi(b.offspringAnimalIds),
      'Complications': b.complications ?? '',
      'Veterinary Cost': b.veterinaryCost ?? '',
      'Linked Txn ID': b.linkedTransactionId ?? '',
      'Note': b.note ?? '',
      'Month': b.month,
      'Year': b.year,
      'Created By': b.createdBy,
      'Created By Name': b.createdByName,
      'Created At': tsIso(b.createdAt),
    }));

    // --- Crop Activities Sheet ---
    const cropActivityRows = data.cropActivities.map(c => ({
      'ID': c.id,
      'Date': ts(c.date),
      'Segment': c.segment,
      'Segment Name': c.segmentName,
      'Activity Type': c.activityType,
      'Description': c.description,
      'Product Used': c.productUsed ?? '',
      'Quantity': c.quantity ?? '',
      'Unit': c.unit ?? '',
      'Area': c.area ?? '',
      'Duration': c.duration ?? '',
      'Labor Count': c.laborCount ?? '',
      'Cost': c.cost ?? '',
      'Linked Txn ID': c.linkedTransactionId ?? '',
      'Weather': c.weather ?? '',
      'Temperature': c.temperature ?? '',
      'Note': c.note ?? '',
      'Month': c.month,
      'Year': c.year,
      'Created By': c.createdBy,
      'Created By Name': c.createdByName,
      'Created At': tsIso(c.createdAt),
    }));

    // --- Consumables (inventoryItems) Sheet + Stock Movements child sheet ---
    const consumableRows = data.inventoryItems.map(i => ({
      'ID': i.id,
      'Name': i.name,
      'Category': i.category,
      'Unit': i.unit,
      'Current Stock': i.currentStock,
      'Minimum Stock': i.minimumStock ?? '',
      'Segments': joinSemi(i.segments),
      'Segment Names': joinSemi(i.segmentNames),
      'Total Purchased': i.totalPurchased,
      'Total Used': i.totalUsed,
      'Total Wastage': i.totalWastage,
      'Total Spent': i.totalSpent,
      'Last Purchase Rate': i.lastPurchaseRate ?? '',
      'Average Purchase Rate': i.averagePurchaseRate ?? '',
      'Note': i.note ?? '',
      'Created By': i.createdBy,
      'Created By Name': i.createdByName,
      'Created At': tsIso(i.createdAt),
    }));

    const stockMovementRows = data.inventoryItems.flatMap(i => (i.movements ?? []).map(m => ({
      'Item ID': i.id, 'ID': m.id, 'Date': ts(m.date), 'Type': m.type,
      'Quantity': m.quantity, 'Unit Cost': m.unitCost ?? '', 'Total Cost': m.totalCost ?? '',
      'Linked Txn ID': m.linkedTransactionId ?? '', 'Supplier ID': m.supplierId ?? '',
      'Supplier Name': m.supplierName ?? '', 'Note': m.note ?? '',
      'Recorded By': m.recordedBy, 'Recorded By Name': m.recordedByName,
    })));

    // --- Tags Sheet (meta/tags single doc) ---
    const tagRows = data.tags.map(t => ({ 'Tag': t }));

    // --- Assemble workbook: Meta first, then data sheets (empty sheets skipped) ---
    const wb = XLSX.utils.book_new();

    const sheetDefs: [string, any[]][] = [
      ['Expenses', expenseRows],
      ['Income', incomeRows],
      ['Loans', loanRows],
      ['Loan Deductions', loanDeductionRows],
      ['Loan Collateral', loanCollateralRows],
      ['Loan Rate Changes', loanRateChangeRows],
      ['Loan Documents', loanDocumentRows],
      ['Loan Repayments', loanRepaymentRows],
      ['Inventory Events', eventRows],
      ['Animals', animalRows],
      ['Animal Costs', animalCostRows],
      ['Animal Vaccinations', animalVaccinationRows],
      ['Animal Medical', animalMedicalRows],
      ['Animal Weights', animalWeightRows],
      ['Buyers', buyerRows],
      ['Suppliers', supplierRows],
      ['Categories', categoryRows],
      ['Segments', segmentRows],
      ['Users', userRows],
      ['Tasks', taskRows],
      ['Schedules', scheduleRows],
      ['Harvests', harvestRows],
      ['Harvest Sales', harvestSaleRows],
      ['Breeding', breedingRows],
      ['Crop Activities', cropActivityRows],
      ['Consumables', consumableRows],
      ['Stock Movements', stockMovementRows],
      ['Tags', tagRows],
    ];

    const metaRows: { Field: string; Value: string | number }[] = [
      { Field: 'Format Version', Value: 2 },
      { Field: 'Exported At', Value: data.exportedAt.toISOString() },
      { Field: 'Exported By', Value: data.exportedBy },
      { Field: 'Scope', Value: 'all-time' },
      ...sheetDefs.map(([name, rows]) => ({ Field: `Count: ${name}`, Value: rows.length })),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), 'Meta');

    for (const [name, rows] of sheetDefs) {
      if (rows.length > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
      }
    }

    // Auto-width columns
    wb.SheetNames.forEach(name => {
      const ws = wb.Sheets[name];
      const ref = ws['!ref'];
      if (!ref) return;
      const range = XLSX.utils.decode_range(ref);
      const colWidths: number[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        let max = 10;
        for (let r = range.s.r; r <= range.e.r; r++) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (cell?.v) max = Math.max(max, String(cell.v).length + 2);
        }
        colWidths.push(Math.min(max, 40));
      }
      ws['!cols'] = colWidths.map(w => ({ wch: w }));
    });

    const dateLabel = data.exportedAt.toISOString().slice(0, 10);
    XLSX.writeFile(wb, `farm-backup-all-time-${dateLabel}.xlsx`);
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
