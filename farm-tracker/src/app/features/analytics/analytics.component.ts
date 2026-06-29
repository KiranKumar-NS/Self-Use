import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { Transaction } from '../../core/models/transaction.model';
import { TransactionService } from '../../core/services/transaction.service';
import { ExportService } from '../../core/services/export.service';
import { SummaryService } from '../../core/services/summary.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { WhatsappShareDialogComponent, WhatsappShareData } from './whatsapp-share-dialog.component';
import { getMonthRange } from '../../core/utils/date.utils';
import { CurrencyInrPipe } from '../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { getMonthString } from '../../core/utils/date.utils';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    FormsModule, DatePipe, UpperCasePipe, CurrencyInrPipe, LoadingSpinnerComponent,
    BaseChartDirective,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatDialogModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Analytics</h1>
        <p class="subtitle">Deep dive into expenses — who spent what, where, and when</p>
      </div>
      <div class="export-buttons">
        <button mat-stroked-button (click)="exportPdf()">
          <mat-icon>picture_as_pdf</mat-icon> Export PDF
        </button>
        <button mat-stroked-button (click)="exportCsv()">
          <mat-icon>download</mat-icon> Export CSV
        </button>
        <button mat-stroked-button class="wa-share-btn" (click)="shareWhatsApp()">
          <mat-icon>share</mat-icon> WhatsApp
        </button>
      </div>
    </div>

    <!-- Filters -->
    <mat-card class="filter-card">
      <div class="filter-header">
        <mat-icon>filter_list</mat-icon>
        <span>Filters</span>
        @if (hasFilters()) {
          <button mat-button class="clear-btn" (click)="clearFilters()">Clear All</button>
        }
      </div>
      <div class="filters">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>From Month</mat-label>
          <mat-select [(ngModel)]="filterFromMonth" (selectionChange)="loadTransactions()">
            <mat-option value="">All Time</mat-option>
            @for (m of availableMonths; track m.value) {
              <mat-option [value]="m.value">{{ m.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>To Month</mat-label>
          <mat-select [(ngModel)]="filterToMonth" (selectionChange)="loadTransactions()">
            <mat-option value="">All Time</mat-option>
            @for (m of availableMonths; track m.value) {
              <mat-option [value]="m.value">{{ m.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="filterSegment" (selectionChange)="applyFilters()">
            <mat-option value="">All Segments</mat-option>
            @for (s of allSegments(); track s) {
              <mat-option [value]="s">{{ s }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Paid By</mat-label>
          <mat-select [(ngModel)]="filterPaidBy" (selectionChange)="applyFilters()">
            <mat-option value="">All People</mat-option>
            @for (p of allPaidBy(); track p) {
              <mat-option [value]="p">{{ p }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Category</mat-label>
          <mat-select [(ngModel)]="filterCategory" (selectionChange)="applyFilters()">
            <mat-option value="">All Categories</mat-option>
            @for (c of allCategories(); track c) {
              <mat-option [value]="c">{{ c }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
    </mat-card>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <!-- Summary Cards -->
      <div class="summary-grid">
        <mat-card class="stat-card total">
          <span class="stat-label">Total Expense</span>
          <span class="stat-value">{{ totalExpense() | currencyInr }}</span>
          <span class="stat-count">{{ filtered().length }} transactions</span>
        </mat-card>
        @for (seg of segmentTotals(); track seg.name) {
          <mat-card class="stat-card">
            <span class="stat-label">{{ seg.name }}</span>
            <span class="stat-value">{{ seg.total | currencyInr }}</span>
            <span class="stat-count">{{ seg.count }} txns</span>
          </mat-card>
        }
      </div>

      <!-- Person Investment Summary -->
      <h3 class="section-title">Person Investment Summary</h3>
      <div class="person-grid">
        @for (p of investmentSummary(); track p.name) {
          <mat-card class="person-card">
            <div class="person-name">{{ p.name }}</div>
            <div class="person-amount">Net: {{ p.net | currencyInr }}</div>
            <div class="person-bar">
              <div class="person-fill" [style.width.%]="p.net > 0 ? (p.net / maxInvestment()) * 100 : 0"></div>
            </div>
            <div class="invest-details">
              <div class="invest-row">
                <span class="invest-label">Expenses paid</span>
                <span class="invest-value expense">{{ p.expensesPaid | currencyInr }}</span>
              </div>
              <div class="invest-row">
                <span class="invest-label">Income received</span>
                <span class="invest-value income">-{{ p.incomeReceived | currencyInr }}</span>
              </div>
            </div>
          </mat-card>
        }
      </div>

      <!-- Charts -->
      <div class="charts-grid">
        <mat-card class="chart-card">
          <h3>Expense by Segment</h3>
          @if (segmentChartData.labels!.length > 0) {
            <canvas baseChart
              [datasets]="segmentChartData.datasets"
              [labels]="segmentChartData.labels"
              [options]="pieOptions"
              type="doughnut"></canvas>
          }
        </mat-card>
        <mat-card class="chart-card">
          <h3>Expense by Category</h3>
          @if (categoryChartData.labels!.length > 0) {
            <canvas baseChart
              [datasets]="categoryChartData.datasets"
              [labels]="categoryChartData.labels"
              [options]="pieOptions"
              type="doughnut"></canvas>
          }
        </mat-card>
      </div>

      <div class="charts-grid">
        <mat-card class="chart-card">
          <h3>Expense by Person</h3>
          @if (personChartData.labels!.length > 0) {
            <canvas baseChart
              [datasets]="personChartData.datasets"
              [labels]="personChartData.labels"
              [options]="barOptions"
              type="bar"></canvas>
          }
        </mat-card>
        <mat-card class="chart-card">
          <h3>Monthly Expense Trend</h3>
          @if (monthlyChartData.labels!.length > 0) {
            <canvas baseChart
              [datasets]="monthlyChartData.datasets"
              [labels]="monthlyChartData.labels"
              [options]="barOptions"
              type="bar"></canvas>
          }
        </mat-card>
      </div>

      <!-- Detail Table -->
      <h3 class="section-title">Transaction Details</h3>
      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Segment</th>
                <th>Category</th>
                <th>Amount</th>
                <th class="hide-mobile">Paid By</th>
                <th class="hide-mobile">Via</th>
                <th class="hide-mobile">Description</th>
              </tr>
            </thead>
            <tbody>
              @for (txn of filtered(); track txn.id) {
                <tr>
                  <td class="date-cell">{{ txn.date.toDate() | date:'dd MMM yyyy' }}</td>
                  <td>{{ txn.segmentName }}</td>
                  <td>{{ txn.categoryName }}</td>
                  <td class="amount-cell">{{ txn.amount | currencyInr }}</td>
                  <td class="hide-mobile">{{ txn.paidByName }}</td>
                  <td class="hide-mobile"><span class="payment-badge" [class]="txn.paymentMethod || 'upi'">{{ (txn.paymentMethod || 'upi') | uppercase }}</span></td>
                  <td class="desc-cell hide-mobile">{{ txn.description }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3"><strong>Total</strong></td>
                <td class="amount-cell"><strong>{{ totalExpense() | currencyInr }}</strong></td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </mat-card>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; font-weight: 700; }
    .subtitle { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
    .export-buttons { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .wa-share-btn { color: #25D366 !important; border-color: #25D366 !important; }

    .filter-card { margin-bottom: 1.25rem; padding: 1rem 1.25rem; }
    .filter-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: 0.85rem; font-weight: 600; color: #475569; }
    .filter-header mat-icon { font-size: 18px; width: 18px; height: 18px; color: #94a3b8; }
    .clear-btn { margin-left: auto; font-size: 0.8rem; color: #4f46e5; }
    .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .filter-field { flex: 1; min-width: 150px; }

    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-card { padding: 1.25rem; display: flex; flex-direction: column; border-left: 4px solid #e2e8f0; }
    .stat-card.total { border-color: #4f46e5; background: #f5f3ff; }
    .stat-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: #1e293b; margin: 4px 0; }
    .stat-count { font-size: 0.75rem; color: #94a3b8; }

    .section-title { margin: 1.5rem 0 0.75rem; font-size: 1.1rem; color: #1e293b; }

    .person-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .person-card { padding: 1.25rem; }
    .person-name { font-size: 1rem; font-weight: 700; color: #1e293b; }
    .person-amount { font-size: 1.25rem; font-weight: 700; color: #dc2626; margin: 4px 0 8px; }
    .person-bar { height: 6px; background: #f1f5f9; border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
    .person-fill { height: 100%; background: #4f46e5; border-radius: 3px; transition: width 0.3s; }
    .person-details { display: flex; flex-wrap: wrap; gap: 6px; }
    .person-seg { font-size: 0.7rem; background: #f1f5f9; color: #475569; padding: 2px 8px; border-radius: 4px; }
    .invest-details { display: flex; flex-direction: column; gap: 6px; }
    .invest-row { display: flex; justify-content: space-between; font-size: 0.8rem; }
    .invest-label { color: #64748b; }
    .invest-value { font-weight: 600; }
    .invest-value.expense { color: #dc2626; }
    .invest-value.income { color: #16a34a; }

    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .chart-card { padding: 1.25rem; }
    .chart-card h3 { margin: 0 0 1rem; font-size: 0.9rem; color: #1e293b; }

    .table-card { padding: 0; overflow: hidden; }
    .table-container { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
    .data-table td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; color: #334155; }
    .data-table tfoot td { background: #f8fafc; border-top: 2px solid #e2e8f0; }
    .data-table tr:hover td { background: #f8fafc; }
    .date-cell { white-space: nowrap; color: #64748b; font-size: 0.8rem; }
    .amount-cell { font-weight: 700; color: #dc2626; white-space: nowrap; }
    .desc-cell { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #94a3b8; font-size: 0.8rem; }
    .payment-badge { padding: 2px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 700; }
    .payment-badge.cash { background: #fef3c7; color: #d97706; }
    .payment-badge.upi { background: #dbeafe; color: #2563eb; }

    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .charts-grid { grid-template-columns: 1fr; }
      .filter-field { min-width: 0; flex-basis: 100%; }
      .filter-card { padding: 0.75rem; }
      .person-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      .hide-mobile { display: none; }
    }
  `],
})
export class AnalyticsComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private exportService = inject(ExportService);
  private summaryService = inject(SummaryService);
  private dialog = inject(MatDialog);

  loading = signal(true);
  allTransactions = signal<Transaction[]>([]);
  filtered = signal<Transaction[]>([]);

  // Filters — default to current month
  filterFromMonth = getMonthString(new Date());
  filterToMonth = getMonthString(new Date());
  filterSegment = '';
  filterPaidBy = '';
  filterCategory = '';

  // Unique values for dropdowns
  allSegments = signal<string[]>([]);
  allPaidBy = signal<string[]>([]);
  allCategories = signal<string[]>([]);
  availableMonths: { value: string; label: string }[] = [];

  // Computed stats
  totalExpense = signal(0);
  segmentTotals = signal<{ name: string; total: number; count: number }[]>([]);
  personTotals = signal<{ name: string; total: number; segments: { name: string; total: number }[] }[]>([]);
  investmentSummary = signal<{ name: string; expensesPaid: number; incomeReceived: number; net: number }[]>([]);
  maxInvestment = signal(0);

  // Charts
  segmentChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  categoryChartData: ChartConfiguration<'doughnut'>['data'] = { labels: [], datasets: [] };
  personChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  monthlyChartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };

  pieOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    plugins: { legend: { position: 'bottom' } },
  };
  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };

  // Colors
  private colors = ['#4f46e5', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be123c', '#65a30d'];

  async ngOnInit(): Promise<void> {
    // Generate last 12 months for filter dropdowns
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = getMonthString(d);
      const label = d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
      this.availableMonths.push({ value, label });
    }

    await this.loadTransactions();
    this.loading.set(false);
  }

  async loadTransactions(): Promise<void> {
    // Fetch only expense transactions for the selected month range
    const filters: any = { type: 'expense' as const };
    // If both months are same, use single month filter (1 query)
    if (this.filterFromMonth && this.filterFromMonth === this.filterToMonth) {
      filters.month = this.filterFromMonth;
    }

    const result = await this.transactionService.getAll(filters, 200);
    let txns = result.transactions;

    // Client-side month range filter if from != to
    if (this.filterFromMonth && this.filterToMonth && this.filterFromMonth !== this.filterToMonth) {
      txns = txns.filter(t => t.month >= this.filterFromMonth && t.month <= this.filterToMonth);
    } else if (this.filterFromMonth && !this.filterToMonth) {
      txns = txns.filter(t => t.month >= this.filterFromMonth);
    } else if (!this.filterFromMonth && this.filterToMonth) {
      txns = txns.filter(t => t.month <= this.filterToMonth);
    }

    this.allTransactions.set(txns);

    // Build unique values from loaded data
    this.allSegments.set([...new Set(txns.map((t) => t.segmentName))].sort());
    this.allPaidBy.set([...new Set(txns.map((t) => t.paidByName || 'Unknown'))].sort());
    this.allCategories.set([...new Set(txns.map((t) => t.categoryName))].sort());

    this.applyFilters();
    await this.buildInvestmentSummary(txns);
  }

  private async buildInvestmentSummary(expenseTxns: Transaction[]): Promise<void> {
    const personMap: Record<string, { expensesPaid: number; incomeReceived: number }> = {};

    const ensurePerson = (name: string) => {
      if (!personMap[name]) personMap[name] = { expensesPaid: 0, incomeReceived: 0 };
    };

    // 1. Expenses paid per person
    for (const txn of expenseTxns) {
      const name = txn.paidByName || txn.createdByName || 'Unknown';
      ensurePerson(name);
      personMap[name].expensesPaid += txn.amount;
    }

    // 2. Income distributions received per person
    try {
      const incomeResult = await this.transactionService.getAll({ type: 'income' }, 200);
      for (const txn of incomeResult.transactions) {
        if (!txn.distributions?.length) continue;
        for (const d of txn.distributions) {
          if (d.uid === 'reinvestment') continue;
          ensurePerson(d.name);
          personMap[d.name].incomeReceived += d.amount;
        }
      }
    } catch {}

    // Build summary
    const summary = Object.entries(personMap)
      .map(([name, data]) => ({
        name,
        ...data,
        net: data.expensesPaid - data.incomeReceived,
      }))
      .sort((a, b) => b.net - a.net);

    this.investmentSummary.set(summary);
    this.maxInvestment.set(summary.length > 0 ? Math.max(...summary.map(s => s.net)) : 0);
  }

  hasFilters(): boolean {
    return !!(this.filterFromMonth || this.filterToMonth || this.filterSegment || this.filterPaidBy || this.filterCategory);
  }

  clearFilters(): void {
    this.filterFromMonth = getMonthString(new Date());
    this.filterToMonth = getMonthString(new Date());
    this.filterSegment = '';
    this.filterPaidBy = '';
    this.filterCategory = '';
    this.loadTransactions();
  }

  applyFilters(): void {
    let txns = [...this.allTransactions()];

    if (this.filterFromMonth) {
      txns = txns.filter((t) => t.month >= this.filterFromMonth);
    }
    if (this.filterToMonth) {
      txns = txns.filter((t) => t.month <= this.filterToMonth);
    }
    if (this.filterSegment) {
      txns = txns.filter((t) => t.segmentName === this.filterSegment);
    }
    if (this.filterPaidBy) {
      txns = txns.filter((t) => (t.paidByName || 'Unknown') === this.filterPaidBy);
    }
    if (this.filterCategory) {
      txns = txns.filter((t) => t.categoryName === this.filterCategory);
    }

    this.filtered.set(txns);
    this.totalExpense.set(txns.reduce((s, t) => s + t.amount, 0));

    // Segment totals
    const segMap = new Map<string, { total: number; count: number }>();
    txns.forEach((t) => {
      const e = segMap.get(t.segmentName) || { total: 0, count: 0 };
      e.total += t.amount;
      e.count++;
      segMap.set(t.segmentName, e);
    });
    this.segmentTotals.set(
      Array.from(segMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total)
    );

    // Person totals with segment breakdown
    const personMap = new Map<string, Map<string, number>>();
    txns.forEach((t) => {
      const name = t.paidByName || 'Unknown';
      if (!personMap.has(name)) personMap.set(name, new Map());
      const segInner = personMap.get(name)!;
      segInner.set(t.segmentName, (segInner.get(t.segmentName) || 0) + t.amount);
    });
    this.personTotals.set(
      Array.from(personMap.entries()).map(([name, segs]) => ({
        name,
        total: Array.from(segs.values()).reduce((s, v) => s + v, 0),
        segments: Array.from(segs.entries()).map(([sName, sTotal]) => ({ name: sName, total: sTotal })),
      })).sort((a, b) => b.total - a.total)
    );

    this.buildCharts(txns);
  }

  private get rangeLabel(): string {
    const from = this.filterFromMonth || 'all';
    const to = this.filterToMonth || 'all';
    return from === to ? from : `${from}_to_${to}`;
  }

  async exportPdf(): Promise<void> {
    const months = (this.filterFromMonth && this.filterToMonth)
      ? getMonthRange(this.filterFromMonth, this.filterToMonth)
      : [];
    const summaryChunks = [];
    for (let i = 0; i < months.length; i += 30) {
      summaryChunks.push(this.summaryService.getForMonths(months.slice(i, i + 30)));
    }
    const summaries = (await Promise.all(summaryChunks)).flat();
    this.exportService.exportTransactionsPdf(this.filtered(), summaries, this.rangeLabel);
  }

  exportCsv(): void {
    this.exportService.exportTransactionsCsv(this.filtered(), `transactions-${this.rangeLabel}`);
  }

  shareWhatsApp(): void {
    // Build category breakdown from filtered transactions
    const catMap = new Map<string, number>();
    this.filtered().forEach(t => catMap.set(t.categoryName, (catMap.get(t.categoryName) || 0) + t.amount));
    const categoryBreakdown = Array.from(catMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    const data: WhatsappShareData = {
      rangeLabel: this.rangeLabel,
      totalExpense: this.totalExpense(),
      investmentSummary: this.investmentSummary(),
      segmentTotals: this.segmentTotals(),
      categoryBreakdown,
    };
    this.dialog.open(WhatsappShareDialogComponent, { data, width: '90vw', maxWidth: '360px' });
  }

  private buildCharts(txns: Transaction[]): void {
    // Segment doughnut
    const segLabels = this.segmentTotals().map((s) => s.name);
    const segData = this.segmentTotals().map((s) => s.total);
    this.segmentChartData = {
      labels: segLabels,
      datasets: [{ data: segData, backgroundColor: this.colors.slice(0, segLabels.length) }],
    };

    // Category doughnut
    const catMap = new Map<string, number>();
    txns.forEach((t) => catMap.set(t.categoryName, (catMap.get(t.categoryName) || 0) + t.amount));
    const catEntries = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
    this.categoryChartData = {
      labels: catEntries.map(([k]) => k),
      datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: this.colors.slice(0, catEntries.length) }],
    };

    // Person bar
    const persons = this.personTotals();
    this.personChartData = {
      labels: persons.map((p) => p.name),
      datasets: [{
        data: persons.map((p) => p.total),
        backgroundColor: this.colors.slice(0, persons.length),
      }],
    };

    // Monthly bar
    const monthMap = new Map<string, number>();
    txns.forEach((t) => monthMap.set(t.month, (monthMap.get(t.month) || 0) + t.amount));
    const monthEntries = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    this.monthlyChartData = {
      labels: monthEntries.map(([m]) => {
        const [y, mo] = m.split('-');
        return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      }),
      datasets: [{
        data: monthEntries.map(([, v]) => v),
        backgroundColor: '#4f46e5',
      }],
    };
  }
}
