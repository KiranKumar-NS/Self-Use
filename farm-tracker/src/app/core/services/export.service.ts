import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Transaction } from '../models/transaction.model';
import { Loan, Repayment } from '../models/loan.model';
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
    const headers = 'Date,Type,Person,Amount,Repaid,Balance,Status,Purpose,Segment,Recorded By,Category,Source,Source Name,Account,Sanctioned,Net Disbursed,Interest Rate,Repayment Type,Tenure,EMI,Outstanding,Interest Paid,Penalty Paid,Closure Reason\n';
    const rows = loans
      .map(
        (l) => {
          const base = `${l.date.toDate().toLocaleDateString('en-IN')},${l.type},${l.personName},${l.amount},${l.totalRepaid},${l.balanceRemaining},${l.repaymentStatus},"${l.purpose}",${l.segmentName},${l.recordedByName}`;
          if (l.loanCategory === 'formal') {
            return `${base},formal,${l.loanSource ?? ''},${l.loanSourceName ?? ''},${l.accountNumber ?? ''},${l.sanctionedAmount ?? ''},${l.netDisbursedAmount ?? ''},${l.interestRate ?? ''}%,${l.repaymentType ?? ''},${l.tenure ?? ''},${l.emiAmount ?? ''},${l.outstandingBalance ?? ''},${l.totalInterestPaid ?? ''},${l.totalPenaltyPaid ?? ''},${l.closureReason ?? ''}`;
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
        Reference: r.paymentReference ?? '', 'Paid By': r.paidBy ?? '',
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

  async exportBackupExcel(
    expenses: Transaction[],
    income: Transaction[],
    loans: Loan[],
    inventoryEvents: any[],
    period: string
  ): Promise<void> {
    const XLSX = await import('xlsx');

    const ts = (t: any) => t?.toDate?.()?.toLocaleDateString('en-IN') ?? '';

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
      'Linked Loan ID': (t as any).linkedLoanId || '',
      'Created By': t.createdBy,
      'Created By Name': t.createdByName,
      'Created At': ts(t.createdAt),
    }));
    const expenseSheet = XLSX.utils.json_to_sheet(expenseRows);

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
        'Distribution': distStr,
        'Created By': t.createdBy,
        'Created By Name': t.createdByName,
        'Created At': ts(t.createdAt),
      };
    });
    const incomeSheet = XLSX.utils.json_to_sheet(incomeRows);

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
      'Created By': e.createdBy,
      'Created By Name': e.createdByName,
      'Created At': ts(e.createdAt),
    }));
    const eventSheet = XLSX.utils.json_to_sheet(eventRows);

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
      'Repayment Type': l.repaymentType ?? '',
      'Interest Type': l.interestType ?? '',
      'Interest Frequency': l.interestFrequency ?? '',
      'Interest Rate Input': l.interestRateInput ?? '',
      'Interest Rate Annual': l.interestRate ?? '',
      'Is Subsidized': l.isSubsidized ?? false,
      'Effective Rate': l.effectiveRate ?? '',
      'Tenure': l.tenure ?? '',
      'EMI Amount': l.emiAmount ?? '',
      'Total EMIs': l.totalEMIs ?? '',
      'EMIs Paid': l.emisPaid ?? '',
      'Moratorium': l.moratoriumMonths ?? '',
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
      'Collateral Value': l.totalCollateralValue ?? '',
      'Recorded By': l.recordedBy,
      'Recorded By Name': l.recordedByName,
    }));
    const loanSheet = XLSX.utils.json_to_sheet(loanRows);

    // Build workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, expenseSheet, 'Expenses');
    XLSX.utils.book_append_sheet(wb, incomeSheet, 'Income');
    XLSX.utils.book_append_sheet(wb, loanSheet, 'Loans');
    if (eventRows.length > 0) {
      XLSX.utils.book_append_sheet(wb, eventSheet, 'Inventory Events');
    }

    // Auto-width columns
    [expenseSheet, incomeSheet, loanSheet, ...(eventRows.length > 0 ? [eventSheet] : [])].forEach(ws => {
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

    const periodLabel = this.formatPeriodLabel(period);
    XLSX.writeFile(wb, `farm-backup-${periodLabel.replace(/\s/g, '-')}.xlsx`);
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
