import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SummaryService } from '../../../core/services/summary.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { LoanService } from '../../../core/services/loan.service';
import { ExportService } from '../../../core/services/export.service';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { Transaction } from '../../../core/models/transaction.model';
import { Loan } from '../../../core/models/loan.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { getMonthString, getMonthName } from '../../../core/utils/date.utils';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-report-page',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe, LoadingSpinnerComponent,
    MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatTabsModule,
  ],
  template: `
    <div class="page-header">
      <h1>Reports</h1>
      <div class="export-buttons">
        <button mat-stroked-button (click)="exportPdf()">
          <mat-icon>picture_as_pdf</mat-icon> Export PDF
        </button>
        <button mat-stroked-button (click)="exportCsv()">
          <mat-icon>download</mat-icon> Export CSV
        </button>
      </div>
    </div>

    <mat-card class="filter-card">
      <mat-form-field appearance="outline">
        <mat-label>Select Month</mat-label>
        <input matInput type="month" [(ngModel)]="selectedMonth" (change)="loadReport()" />
      </mat-form-field>
    </mat-card>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <mat-tab-group>
        <mat-tab label="Summary">
          <div class="tab-content">
            <div class="summary-grid">
              <mat-card class="metric-card">
                <span class="metric-label">Total Income</span>
                <span class="metric-value income">{{ totalIncome() | currencyInr }}</span>
              </mat-card>
              <mat-card class="metric-card">
                <span class="metric-label">Total Expense</span>
                <span class="metric-value expense">{{ totalExpense() | currencyInr }}</span>
              </mat-card>
              <mat-card class="metric-card">
                <span class="metric-label">Net Profit/Loss</span>
                <span class="metric-value" [class.income]="netProfit() >= 0" [class.expense]="netProfit() < 0">
                  {{ netProfit() | currencyInr }}
                </span>
              </mat-card>
            </div>

            <h3>Segment Breakdown</h3>
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr><th>Segment</th><th>Income</th><th>Expense</th><th>Net</th></tr>
                </thead>
                <tbody>
                  @for (s of summaries(); track s.segment) {
                    <tr>
                      <td>{{ s.segment }}</td>
                      <td class="income">{{ s.totalIncome || 0 | currencyInr }}</td>
                      <td class="expense">{{ s.totalExpense || 0 | currencyInr }}</td>
                      <td [class.income]="(s.netProfit || 0) >= 0" [class.expense]="(s.netProfit || 0) < 0">
                        {{ s.netProfit || 0 | currencyInr }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Transactions">
          <div class="tab-content">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr><th>Date</th><th>Type</th><th>Segment</th><th>Category</th><th>Amount</th><th>By</th><th>Description</th></tr>
                </thead>
                <tbody>
                  @for (t of transactions(); track t.id) {
                    <tr>
                      <td>{{ t.date.toDate() | date:'dd MMM' }}</td>
                      <td><span class="type-badge" [class]="t.type">{{ t.type }}</span></td>
                      <td>{{ t.segmentName }}</td>
                      <td>{{ t.categoryName }}</td>
                      <td [class]="t.type">{{ t.amount | currencyInr }}</td>
                      <td>{{ t.createdByName }}</td>
                      <td>{{ t.description }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <mat-tab label="Loans">
          <div class="tab-content">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr><th>Date</th><th>Type</th><th>Person</th><th>Amount</th><th>Repaid</th><th>Balance</th><th>Status</th></tr>
                </thead>
                <tbody>
                  @for (l of loans(); track l.id) {
                    <tr>
                      <td>{{ l.date.toDate() | date:'dd MMM' }}</td>
                      <td><span class="type-badge" [class]="l.type">{{ l.type }}</span></td>
                      <td>{{ l.personName }}</td>
                      <td>{{ l.amount | currencyInr }}</td>
                      <td>{{ l.totalRepaid | currencyInr }}</td>
                      <td class="expense">{{ l.balanceRemaining | currencyInr }}</td>
                      <td><span class="status-badge" [class]="l.repaymentStatus">{{ l.repaymentStatus }}</span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .export-buttons { display: flex; gap: 0.5rem; }
    .filter-card { margin-bottom: 1rem; padding: 1rem; }
    .tab-content { padding: 1rem 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    .metric-card { padding: 1.5rem; display: flex; flex-direction: column; }
    .metric-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
    .metric-value { font-size: 1.75rem; font-weight: 700; }
    .income { color: #16a34a; }
    .expense { color: #dc2626; }
    h3 { font-size: 1rem; color: #1e293b; margin: 1rem 0 0.5rem; }
    .table-container { background: white; border-radius: 8px; overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #64748b; }
    .data-table td { padding: 10px 14px; border-top: 1px solid #f1f5f9; font-size: 0.875rem; }
    .type-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
    .type-badge.expense { background: #fef2f2; color: #dc2626; }
    .type-badge.income { background: #f0fdf4; color: #16a34a; }
    .type-badge.given { background: #fef3c7; color: #d97706; }
    .type-badge.received { background: #dbeafe; color: #2563eb; }
    .status-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
    .status-badge.pending { background: #fef2f2; color: #dc2626; }
    .status-badge.partial { background: #fef3c7; color: #d97706; }
    .status-badge.completed { background: #f0fdf4; color: #16a34a; }
  `],
})
export class ReportPageComponent implements OnInit {
  private summaryService = inject(SummaryService);
  private transactionService = inject(TransactionService);
  private loanService = inject(LoanService);
  private exportService = inject(ExportService);

  selectedMonth = getMonthString(new Date());
  loading = signal(true);
  summaries = signal<MonthlySummary[]>([]);
  transactions = signal<Transaction[]>([]);
  loans = signal<Loan[]>([]);
  totalIncome = signal(0);
  totalExpense = signal(0);
  netProfit = signal(0);

  async ngOnInit(): Promise<void> {
    await this.loadReport();
  }

  async loadReport(): Promise<void> {
    this.loading.set(true);
    const [summaries, txnResult, loanResult] = await Promise.all([
      this.summaryService.getForMonth(this.selectedMonth),
      this.transactionService.getAll({ month: this.selectedMonth }, 100),
      this.loanService.getAll({}, 100),
    ]);

    this.summaries.set(summaries);
    this.transactions.set(txnResult.transactions);
    this.loans.set(loanResult.loans);

    const agg = this.summaryService.aggregateSummaries(summaries);
    this.totalIncome.set(agg.totalIncome);
    this.totalExpense.set(agg.totalExpense);
    this.netProfit.set(agg.netProfit);

    this.loading.set(false);
  }

  exportPdf(): void {
    this.exportService.exportTransactionsPdf(
      this.transactions(), this.summaries(), this.selectedMonth
    );
  }

  exportCsv(): void {
    this.exportService.exportTransactionsCsv(
      this.transactions(), `transactions-${this.selectedMonth}`
    );
  }
}
