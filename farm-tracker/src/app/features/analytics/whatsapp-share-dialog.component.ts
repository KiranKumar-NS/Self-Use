import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';
import { formatCurrency } from '../../core/utils/firestore.utils';

export interface ShareTransaction {
  date: string; // formatted date
  type: 'expense' | 'income';
  segmentName: string;
  categoryName: string;
  amount: number;
  paymentMethod: string;
  paidByName: string;
}

export interface WhatsappShareData {
  rangeLabel: string;
  totalExpense: number;
  investmentSummary: { name: string; expensesPaid: number; incomeReceived: number; net: number }[];
  segmentTotals: { name: string; total: number; count: number }[];
  categoryBreakdown: { name: string; total: number }[];
  incomeDetails: { segmentName: string; categoryName: string; amount: number }[];
  totalIncome: number;
  stockDetails: { name: string; icon: string; count: number }[];
  transactions: ShareTransaction[];
}

@Component({
  selector: 'app-whatsapp-share-dialog',
  standalone: true,
  imports: [MatDialogModule, MatCheckboxModule, MatButtonModule, MatIconModule, FormsModule],
  template: `
    <h2 mat-dialog-title>Share via WhatsApp</h2>
    <mat-dialog-content>
      <p class="hint">Select sections to include:</p>
      <div class="options">
        <mat-checkbox [(ngModel)]="includeOverall">Overall Summary</mat-checkbox>
        <mat-checkbox [(ngModel)]="includeSegments">Segment Breakdown</mat-checkbox>
        <mat-checkbox [(ngModel)]="includeCategories">Category Breakdown</mat-checkbox>
        <mat-checkbox [(ngModel)]="includePersons">Person Investment Summary</mat-checkbox>
        <mat-checkbox [(ngModel)]="includeIncome">Income Details</mat-checkbox>
        <mat-checkbox [(ngModel)]="includeStock">Stock Details</mat-checkbox>
        <mat-checkbox [(ngModel)]="includeTransactions">Transaction List</mat-checkbox>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-flat-button class="wa-btn" (click)="share()" [disabled]="!hasSelection()">
        <mat-icon>share</mat-icon> Share
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .hint { color: #64748b; font-size: 0.85rem; margin: 0 0 12px; }
    .options { display: flex; flex-direction: column; gap: 12px; }
    .wa-btn { background: #25D366 !important; color: #fff !important; }
  `],
})
export class WhatsappShareDialogComponent {
  private dialogRef = inject(MatDialogRef<WhatsappShareDialogComponent>);
  private data: WhatsappShareData = inject(MAT_DIALOG_DATA);

  includeOverall = true;
  includeSegments = true;
  includeCategories = true;
  includePersons = true;
  includeIncome = true;
  includeStock = true;
  includeTransactions = true;

  hasSelection(): boolean {
    return this.includeOverall || this.includeSegments || this.includeCategories || this.includePersons || this.includeIncome || this.includeStock || this.includeTransactions;
  }

  share(): void {
    const message = this.buildMessage();
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    this.dialogRef.close();
  }

  private buildMessage(): string {
    const lines: string[] = [];
    const label = this.formatRangeLabel(this.data.rangeLabel);
    lines.push(`📊 Farm Summary (${label})`);

    if (this.includeOverall) {
      const netProfit = this.data.totalIncome - this.data.totalExpense;
      lines.push('');
      lines.push('💰 *Overall*');
      lines.push(`Total Expense: ${formatCurrency(this.data.totalExpense)}`);
      lines.push(`Total Income: ${formatCurrency(this.data.totalIncome)}`);
      lines.push(`Net Profit: ${formatCurrency(netProfit)}`);
    }

    if (this.includeSegments && this.data.segmentTotals.length > 0) {
      lines.push('');
      lines.push('📦 *Segments*');
      for (const seg of this.data.segmentTotals) {
        lines.push(`${seg.name}: ${formatCurrency(seg.total)} (${seg.count} txns)`);
      }
    }

    if (this.includeCategories && this.data.categoryBreakdown.length > 0) {
      lines.push('');
      lines.push('📂 *Categories*');
      for (const cat of this.data.categoryBreakdown) {
        lines.push(`${cat.name}: ${formatCurrency(cat.total)}`);
      }
    }

    if (this.includePersons && this.data.investmentSummary.length > 0) {
      lines.push('');
      lines.push('👤 *Person Investment*');
      for (const p of this.data.investmentSummary) {
        lines.push(`${p.name}: ${formatCurrency(p.net)} (Paid: ${formatCurrency(p.expensesPaid)} | Received: ${formatCurrency(p.incomeReceived)})`);
      }
    }

    if (this.includeIncome && this.data.incomeDetails.length > 0) {
      lines.push('');
      lines.push('💵 *Income Details*');
      lines.push(`Total Income: ${formatCurrency(this.data.totalIncome)}`);
      const segMap = new Map<string, number>();
      for (const inc of this.data.incomeDetails) {
        segMap.set(inc.segmentName, (segMap.get(inc.segmentName) || 0) + inc.amount);
      }
      for (const [seg, total] of Array.from(segMap.entries()).sort((a, b) => b[1] - a[1])) {
        lines.push(`${seg}: ${formatCurrency(total)}`);
      }
    }

    if (this.includeStock && this.data.stockDetails.length > 0) {
      lines.push('');
      lines.push('🐄 *Current Stock*');
      for (const s of this.data.stockDetails) {
        lines.push(`${s.icon} ${s.name}: ${s.count}`);
      }
    }

    if (this.includeTransactions && this.data.transactions.length > 0) {
      lines.push('');
      lines.push('📋 *Transactions*');

      // Group by date
      const grouped = new Map<string, typeof this.data.transactions>();
      for (const txn of this.data.transactions) {
        const list = grouped.get(txn.date) || [];
        list.push(txn);
        grouped.set(txn.date, list);
      }

      for (const [date, txns] of grouped) {
        lines.push('');
        lines.push(`📅 *${date}*`);
        for (const t of txns) {
          const icon = t.type === 'expense' ? '🔴' : '🟢';
          const method = t.paymentMethod?.toUpperCase() || 'CASH';
          lines.push(`${icon} ${t.segmentName} | ${t.categoryName} | ${formatCurrency(t.amount)} (${method}) - ${t.paidByName}`);
        }
      }

      const totalExp = this.data.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const totalInc = this.data.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      lines.push('');
      lines.push(`─────────────────`);
      lines.push(`Total Expense: ${formatCurrency(totalExp)} | Total Income: ${formatCurrency(totalInc)}`);
    }

    return lines.join('\n');
  }

  private formatRangeLabel(label: string): string {
    // Convert "2026-06" or "2026-05_to_2026-06" to readable format
    const formatMonth = (m: string) => {
      const [y, mo] = m.split('-');
      if (!y || !mo) return m;
      return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    };
    if (label.includes('_to_')) {
      const [from, to] = label.split('_to_');
      return `${formatMonth(from)} – ${formatMonth(to)}`;
    }
    return formatMonth(label);
  }
}
