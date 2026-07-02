import { Component, inject, signal, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { Transaction } from '../../../core/models/transaction.model';
import { TransactionService } from '../../../core/services/transaction.service';
import { SummaryService } from '../../../core/services/summary.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { WhatsappShareDialogComponent, WhatsappShareData, ShareTransaction } from './whatsapp-share-dialog.component';
import { getMonthRange } from '../../../core/utils/date.utils';
import { normalizeName } from '../../../core/utils/name.utils';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { DateRangeSelection } from '../../../shared/components/date-range-filter/date-range-filter.component';
import { sortData, toggleSortState, getSortIndicator, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
@Component({
  selector: 'app-analytics-tab',
  standalone: true,
  imports: [
    FormsModule, DatePipe, UpperCasePipe, CurrencyInrPipe, LoadingSpinnerComponent,
    BaseChartDirective,
    MatCardModule, MatButtonModule, MatIconModule, MatDialogModule,
  ],
  template: `
    <!-- Filter Chips -->
    <div class="filters-area">
      <!-- Person Chips -->
      <div class="filter-row">
        <span class="filter-label">Person</span>
        <div class="chip-scroll">
          <button class="filter-chip" [class.active]="!filterPaidBy" (click)="onPersonChipClick('')">All</button>
          @for (p of allPaidBy(); track p) {
            <button class="filter-chip" [class.active]="filterPaidBy === p" (click)="onPersonChipClick(p)">{{ p }}</button>
          }
        </div>
      </div>
      <!-- Segment Chips -->
      <div class="filter-row">
        <span class="filter-label">Segment</span>
        <div class="chip-scroll">
          <button class="filter-chip" [class.active]="!filterSegment" (click)="onSegmentChipClick('')">All</button>
          @for (s of allSegments(); track s) {
            <button class="filter-chip" [class.active]="filterSegment === s" (click)="onSegmentChipClick(s)">{{ s }}</button>
          }
        </div>
      </div>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <!-- Summary Stats -->
      <div class="summary-grid">
        <mat-card class="stat-card total">
          <span class="stat-label">Total Expense</span>
          <span class="stat-value expense-text">{{ totalExpense() | currencyInr }}</span>
          <span class="stat-count">{{ filtered().length }} transactions</span>
        </mat-card>
        <mat-card class="stat-card income-card">
          <span class="stat-label">Total Income</span>
          <span class="stat-value income-text">{{ totalIncomeAmount() | currencyInr }}</span>
          <span class="stat-count">{{ filteredIncome().length }} transactions</span>
        </mat-card>
        <mat-card class="stat-card" [class.profit]="netProfit() >= 0" [class.loss]="netProfit() < 0">
          <span class="stat-label">Net Profit/Loss</span>
          <span class="stat-value" [class.income-text]="netProfit() >= 0" [class.expense-text]="netProfit() < 0">{{ netProfit() | currencyInr }}</span>
        </mat-card>
      </div>

      <!-- Person Investment -->
      <h3 class="section-title">Person Investment</h3>
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
              @if (p.holding > 0) {
                <div class="invest-row holding-row">
                  <span class="invest-label">Holding</span>
                  <span class="invest-value holding">{{ p.holding | currencyInr }}</span>
                </div>
              }
            </div>
          </mat-card>
        }
      </div>

      <!-- Charts Section -->
      <h3 class="section-title">Breakdown</h3>
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

      <!-- Segment Cards -->
      <h3 class="section-title">Segments</h3>
      <div class="summary-grid">
        @for (seg of segmentTotals(); track seg.name) {
          <mat-card class="stat-card">
            <span class="stat-label">{{ seg.name }}</span>
            <span class="stat-value">{{ seg.total | currencyInr }}</span>
            <span class="stat-count">{{ seg.count }} txns</span>
          </mat-card>
        }
      </div>

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
                <th class="sortable" (click)="toggleSort('date')">Date <span class="sort-icon">{{ getSortIcon('date') }}</span></th>
                <th class="sortable" (click)="toggleSort('segmentName')">Segment <span class="sort-icon">{{ getSortIcon('segmentName') }}</span></th>
                <th class="sortable" (click)="toggleSort('categoryName')">Category <span class="sort-icon">{{ getSortIcon('categoryName') }}</span></th>
                <th class="sortable" (click)="toggleSort('amount')">Amount <span class="sort-icon">{{ getSortIcon('amount') }}</span></th>
                <th class="sortable" (click)="toggleSort('paidByName')">Paid By <span class="sort-icon">{{ getSortIcon('paidByName') }}</span></th>
                <th class="">Via</th>
                <th class="">Description</th>
              </tr>
            </thead>
            <tbody>
              @for (txn of paginatedFiltered(); track txn.id) {
                <tr>
                  <td class="date-cell">{{ txn.date.toDate() | date:'dd MMM yyyy' }}</td>
                  <td>{{ txn.segmentName }}</td>
                  <td>{{ txn.categoryName }}</td>
                  <td class="amount-cell">{{ txn.amount | currencyInr }}</td>
                  <td class="">{{ txn.paidByName }}</td>
                  <td class=""><span class="payment-badge" [class]="txn.paymentMethod || 'upi'">{{ (txn.paymentMethod || 'upi') | uppercase }}</span></td>
                  <td class="desc-cell">{{ txn.description }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3"><strong>Total</strong></td>
                <td class="amount-cell"><strong>{{ totalExpense() | currencyInr }}</strong></td>
                <td class="" colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        @if (filtered().length > 0) {
          <div class="pagination">
            <div class="page-size">
              <span>Rows per page:</span>
              <select [(ngModel)]="pageSize" (change)="currentPage = 1">
                <option [ngValue]="10">10</option>
                <option [ngValue]="20">20</option>
                <option [ngValue]="50">50</option>
              </select>
            </div>
            <span class="page-info">{{ analyticsPageStart() }}–{{ analyticsPageEnd() }} of {{ sortedFiltered().length }}</span>
            <div class="page-buttons">
              <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = 1" aria-label="First page"><mat-icon>first_page</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = currentPage - 1" aria-label="Previous page"><mat-icon>chevron_left</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage >= analyticsTotalPages()" (click)="currentPage = currentPage + 1" aria-label="Next page"><mat-icon>chevron_right</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage >= analyticsTotalPages()" (click)="currentPage = analyticsTotalPages()" aria-label="Last page"><mat-icon>last_page</mat-icon></button>
            </div>
          </div>
        }
      </mat-card>
    }
  `,
  styles: [`
    .filters-area { margin-bottom: 1rem; }

    .filter-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
    .filter-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted); letter-spacing: 0.05em; min-width: 56px; flex-shrink: 0; }
    .chip-scroll { display: flex; gap: 0.4rem; overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; padding: 2px 0; }
    .chip-scroll::-webkit-scrollbar { display: none; }
    .filter-chip {
      border: 1px solid var(--color-border); background: var(--color-bg); color: var(--color-text-secondary);
      padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; font-weight: 500; cursor: pointer;
      white-space: nowrap; transition: all 0.15s; outline: none;
    }
    .filter-chip:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .filter-chip.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-card { padding: 1.25rem; display: flex; flex-direction: column; border-left: 4px solid var(--color-border); min-width: 0; overflow: hidden; }
    .stat-card.total { border-color: var(--color-primary); background: #f5f3ff; }
    .stat-card.income-card { border-color: var(--color-income); background: var(--color-income-bg); }
    .stat-card.profit { border-color: var(--color-income); background: var(--color-income-bg); }
    .stat-card.loss { border-color: var(--color-expense); background: var(--color-expense-bg); }
    .expense-text { color: var(--color-expense); }
    .income-text { color: var(--color-income); }
    .stat-label { font-size: 0.7rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
    .stat-value {
      font-size: var(--font-2xl); font-weight: 700; color: var(--color-text); margin: 4px 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .stat-count { font-size: var(--font-sm); color: var(--color-text-muted); }

    .section-title { margin: 1.5rem 0 0.75rem; font-size: 1.1rem; color: var(--color-text); }

    .person-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .person-card { padding: 1.25rem; }
    .person-name { font-size: var(--font-lg); font-weight: 700; color: var(--color-text); }
    .person-amount { font-size: var(--font-xl); font-weight: 700; color: var(--color-expense); margin: 4px 0 8px; }
    .person-bar { height: 6px; background: var(--color-bg-alt); border-radius: 3px; overflow: hidden; margin-bottom: 10px; }
    .person-fill { height: 100%; background: var(--color-primary); border-radius: 3px; transition: width 0.3s; }
    .invest-details { display: flex; flex-direction: column; gap: 6px; }
    .invest-row { display: flex; justify-content: space-between; font-size: 0.8rem; }
    .invest-label { color: var(--color-text-secondary); }
    .invest-value { font-weight: 600; }
    .invest-value.expense { color: var(--color-expense); }
    .invest-value.income { color: var(--color-income); }
    .invest-value.holding { color: var(--color-warning, #d97706); }
    .holding-row { border-top: 1px dashed var(--color-border); padding-top: 6px; margin-top: 2px; }

    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .chart-card { padding: 1.25rem; }
    .chart-card h3 { margin: 0 0 1rem; font-size: var(--font-md); color: var(--color-text); }
    .amount-cell { color: var(--color-expense); }
    .desc-cell { max-width: 250px; }

    @media (max-width: 768px) {
      .charts-grid { grid-template-columns: 1fr; }
      .person-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      .summary-grid { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
      .stat-card { padding: 0.75rem 1rem; }
      .stat-label { font-size: 0.6rem; }
      .stat-value { font-size: 1.1rem; }
      .stat-count { font-size: 0.65rem; }
      .section-title { font-size: 1rem; }
      .person-card { padding: 1rem; }
      .person-amount { font-size: 1rem; }
      .invest-row { font-size: 0.75rem; }
      .filter-chip { padding: 5px 10px; font-size: 0.75rem; }
    }
  `],
})
export class AnalyticsTabComponent implements OnInit, OnChanges {
  @Input() dateSelection!: DateRangeSelection;

  private transactionService = inject(TransactionService);
  private summaryService = inject(SummaryService);
  private segmentService = inject(SegmentService);
  private dialog = inject(MatDialog);

  loading = signal(true);
  allTransactions = signal<Transaction[]>([]);
  filtered = signal<Transaction[]>([]);

  private currentSelection!: DateRangeSelection;

  // Filters
  filterSegment = '';
  filterPaidBy = '';
  filterCategory = '';

  // Sorting & pagination
  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  // Unique values for dropdowns
  allSegments = signal<string[]>([]);
  allPaidBy = signal<string[]>([]);
  allCategories = signal<string[]>([]);

  // Computed stats
  totalExpense = signal(0);
  segmentTotals = signal<{ name: string; total: number; count: number }[]>([]);
  personTotals = signal<{ name: string; total: number; segments: { name: string; total: number }[] }[]>([]);
  investmentSummary = signal<{ name: string; expensesPaid: number; incomeReceived: number; holding: number; net: number }[]>([]);
  maxInvestment = signal(0);
  incomeTransactions = signal<Transaction[]>([]);
  segments = signal<Segment[]>([]);
  totalIncomeAmount = signal(0);
  netProfit = signal(0);
  filteredIncome = signal<Transaction[]>([]);

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
    scales: {
      y: { beginAtZero: true },
      x: { ticks: { maxRotation: 45, autoSkip: true } },
    },
  };

  private colors = ['#4f46e5', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be123c', '#65a30d'];

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['dateSelection'] && this.dateSelection) {
      this.currentSelection = this.dateSelection;
      await this.loadTransactions();
      this.loading.set(false);
    }
  }

  async loadTransactions(): Promise<void> {
    this.loading.set(true);
    const filters: any = { type: 'expense' as const };

    if (this.currentSelection.mode === 'monthly') {
      filters.month = this.currentSelection.month;
    }

    const result = await this.transactionService.getAll(filters, 200);
    let txns = result.transactions;

    if (this.currentSelection.mode === 'custom') {
      txns = txns.filter(t => t.month >= this.currentSelection.fromMonth! && t.month <= this.currentSelection.toMonth!);
    }

    this.allTransactions.set(txns);

    this.allSegments.set([...new Set(txns.map((t) => t.segmentName))].sort());
    this.allPaidBy.set([...new Set(txns.map((t) => normalizeName(t.paidByName || 'Unknown')))].sort());
    this.allCategories.set([...new Set(txns.map((t) => t.categoryName))].sort());

    this.applyFilters();
    await this.buildInvestmentSummary(txns);
  }

  private async buildInvestmentSummary(expenseTxns: Transaction[]): Promise<void> {
    const personMap: Record<string, { expensesPaid: number; incomeReceived: number; holding: number }> = {};

    const ensurePerson = (name: string) => {
      if (!personMap[name]) personMap[name] = { expensesPaid: 0, incomeReceived: 0, holding: 0 };
    };

    for (const txn of expenseTxns) {
      const name = normalizeName(txn.paidByName || txn.createdByName || 'Unknown');
      ensurePerson(name);
      personMap[name].expensesPaid += txn.amount;
    }

    try {
      const incomeResult = await this.transactionService.getAll({ type: 'income' }, 200);
      this.incomeTransactions.set(incomeResult.transactions);

      // Add distribution recipients to person chip list
      const distributionNames = incomeResult.transactions
        .flatMap(t => (t.distributions || []))
        .filter(d => d.uid !== 'reinvestment')
        .map(d => d.name);
      const currentPaidBy = this.allPaidBy();
      this.allPaidBy.set([...new Set([...currentPaidBy, ...distributionNames])].sort());

      let incomeForRange = incomeResult.transactions;
      if (this.currentSelection.mode === 'monthly') {
        incomeForRange = incomeForRange.filter(t => t.month === this.currentSelection.month);
      } else if (this.currentSelection.mode === 'custom') {
        incomeForRange = incomeForRange.filter(t => t.month >= this.currentSelection.fromMonth! && t.month <= this.currentSelection.toMonth!);
      }
      if (this.filterSegment) incomeForRange = incomeForRange.filter(t => t.segment === this.filterSegment);
      this.filteredIncome.set(incomeForRange);
      const incomeTotal = incomeForRange.reduce((s, t) => s + t.amount, 0);
      this.totalIncomeAmount.set(incomeTotal);
      this.netProfit.set(incomeTotal - this.totalExpense());

      for (const txn of incomeForRange) {
        // Total of ALL distributions (including reinvestment) = money that's been allocated
        const totalAllocated = (txn.distributions || [])
          .reduce((s, d) => s + d.amount, 0);

        // Only count person distributions as income (not reinvestment)
        for (const d of (txn.distributions || [])) {
          if (d.uid === 'reinvestment') continue;
          ensurePerson(d.name);
          personMap[d.name].incomeReceived += d.amount;
        }

        // Undistributed = total income - everything allocated (including reinvestment)
        const receiver = normalizeName(txn.paidByName || txn.createdByName || 'Unknown');
        const undistributed = txn.amount - totalAllocated;
        if (undistributed > 0) {
          ensurePerson(receiver);
          personMap[receiver].holding += undistributed;
        }
      }
    } catch {}

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

  setFilter(type: 'all' | 'person' | 'segment', value: string): void {
    if (type === 'all') {
      this.filterPaidBy = '';
      this.filterSegment = '';
      this.filterCategory = '';
    }
    this.applyFilters();
  }

  onPersonChipClick(person: string): void {
    this.filterPaidBy = this.filterPaidBy === person ? '' : person;
    this.applyFilters();
  }

  onSegmentChipClick(segment: string): void {
    this.filterSegment = this.filterSegment === segment ? '' : segment;
    this.applyFilters();
  }

  hasFilters(): boolean {
    return !!(this.filterSegment || this.filterPaidBy || this.filterCategory);
  }

  clearFilters(): void {
    this.setFilter('all', '');
  }

  applyFilters(): void {
    this.currentPage = 1;
    let txns = [...this.allTransactions()];

    if (this.filterSegment) {
      txns = txns.filter((t) => t.segmentName === this.filterSegment);
    }
    if (this.filterPaidBy) {
      txns = txns.filter((t) => normalizeName(t.paidByName || 'Unknown') === this.filterPaidBy);
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
      const name = normalizeName(t.paidByName || 'Unknown');
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

    // Re-filter income — filter by date range and segment/category only (NOT by person)
    // Person filter is applied later per-distribution, not on the whole income transaction
    let incomeForRange = this.incomeTransactions();
    if (this.currentSelection.mode === 'monthly') {
      incomeForRange = incomeForRange.filter(t => t.month === this.currentSelection.month);
    } else if (this.currentSelection.mode === 'custom') {
      incomeForRange = incomeForRange.filter(t => t.month >= this.currentSelection.fromMonth! && t.month <= this.currentSelection.toMonth!);
    }
    if (this.filterSegment) incomeForRange = incomeForRange.filter(t => t.segmentName === this.filterSegment);
    if (this.filterCategory) incomeForRange = incomeForRange.filter(t => t.categoryName === this.filterCategory);
    this.filteredIncome.set(incomeForRange);
    const incomeTotal = incomeForRange.reduce((s, t) => s + t.amount, 0);
    this.totalIncomeAmount.set(incomeTotal);
    this.netProfit.set(incomeTotal - this.totalExpense());

    // Rebuild person investment from filtered data
    const investMap: Record<string, { expensesPaid: number; incomeReceived: number; holding: number }> = {};
    const ensurePerson = (name: string) => {
      if (!investMap[name]) investMap[name] = { expensesPaid: 0, incomeReceived: 0, holding: 0 };
    };
    for (const t of txns) {
      const name = normalizeName(t.paidByName || t.createdByName || 'Unknown');
      ensurePerson(name);
      investMap[name].expensesPaid += t.amount;
    }
    for (const t of incomeForRange) {
      // Total allocated = all distributions including reinvestment
      const totalAllocated = (t.distributions || [])
        .reduce((s, d) => s + d.amount, 0);

      // Only person distributions count as income received (not reinvestment)
      for (const d of (t.distributions || [])) {
        if (d.uid === 'reinvestment') continue;
        ensurePerson(d.name);
        investMap[d.name].incomeReceived += d.amount;
      }

      // Undistributed = income - everything allocated (including reinvestment)
      const receiver = normalizeName(t.paidByName || t.createdByName || 'Unknown');
      const undistributed = t.amount - totalAllocated;
      if (undistributed > 0) {
        ensurePerson(receiver);
        investMap[receiver].holding += undistributed;
      }
    }

    // If person filter is active, keep only that person's investment data
    let summaryEntries = Object.entries(investMap);
    if (this.filterPaidBy) {
      summaryEntries = summaryEntries.filter(([name]) => name === this.filterPaidBy);
    }
    const summary = summaryEntries
      .map(([name, data]) => ({ name, ...data, net: data.expensesPaid - data.incomeReceived }))
      .sort((a, b) => b.net - a.net);
    this.investmentSummary.set(summary);
    this.maxInvestment.set(summary.length > 0 ? Math.max(...summary.map(s => s.net)) : 0);
  }

  sortedFiltered(): Transaction[] {
    return sortData(this.filtered(), this.sortColumn, this.sortDirection);
  }

  paginatedFiltered(): Transaction[] {
    return paginate(this.sortedFiltered(), this.currentPage, this.pageSize);
  }

  analyticsTotalPages(): number { return totalPages(this.sortedFiltered().length, this.pageSize); }
  analyticsPageStart(): number { return pageStart(this.sortedFiltered().length, this.currentPage, this.pageSize); }
  analyticsPageEnd(): number { return pageEnd(this.sortedFiltered().length, this.currentPage, this.pageSize); }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  getSortIcon(column: string): string {
    return getSortIndicator(this.sortColumn, this.sortDirection, column);
  }

  private get rangeLabel(): string {
    if (this.currentSelection.mode === 'monthly') return this.currentSelection.month || 'all';
    if (this.currentSelection.mode === 'custom') return `${this.currentSelection.fromMonth}_to_${this.currentSelection.toMonth}`;
    return 'all-time';
  }

  private async getExportService() {
    const { ExportService } = await import('../../../core/services/export.service');
    return new ExportService();
  }

  async exportPdf(): Promise<void> {
    let months: string[] = [];
    if (this.currentSelection.mode === 'monthly' && this.currentSelection.month) {
      months = [this.currentSelection.month];
    } else if (this.currentSelection.mode === 'custom') {
      months = getMonthRange(this.currentSelection.fromMonth!, this.currentSelection.toMonth!);
    }

    const summaryChunks = [];
    for (let i = 0; i < months.length; i += 30) {
      summaryChunks.push(this.summaryService.getForMonths(months.slice(i, i + 30)));
    }
    const [summaries, exportService] = await Promise.all([
      Promise.all(summaryChunks).then(chunks => chunks.flat()),
      this.getExportService(),
    ]);
    exportService.exportTransactionsPdf(this.filtered(), summaries, this.rangeLabel);
  }

  async exportCsv(): Promise<void> {
    const exportService = await this.getExportService();
    exportService.exportTransactionsCsv(this.filtered(), `transactions-${this.rangeLabel}`);
  }

  shareWhatsApp(): void {
    const catMap = new Map<string, number>();
    this.filtered().forEach(t => catMap.set(t.categoryName, (catMap.get(t.categoryName) || 0) + t.amount));
    const categoryBreakdown = Array.from(catMap.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    let incomeForRange = this.incomeTransactions();
    if (this.currentSelection.mode === 'monthly') {
      incomeForRange = incomeForRange.filter(t => t.month === this.currentSelection.month);
    } else if (this.currentSelection.mode === 'custom') {
      incomeForRange = incomeForRange.filter(t => t.month >= this.currentSelection.fromMonth! && t.month <= this.currentSelection.toMonth!);
    }
    if (this.filterSegment) incomeForRange = incomeForRange.filter(t => t.segmentName === this.filterSegment);

    const incomeDetails = incomeForRange.map(t => ({ segmentName: t.segmentName, categoryName: t.categoryName, amount: t.amount }));
    const totalIncome = incomeForRange.reduce((s, t) => s + t.amount, 0);

    const stockDetails = this.segments()
      .filter(s => s.isActive && (s.currentStock ?? 0) > 0)
      .map(s => ({ name: s.name, icon: s.icon, count: s.currentStock || 0 }));

    const formatDate = (d: Date) => {
      const day = d.getDate().toString().padStart(2, '0');
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
    };
    const allTxns: ShareTransaction[] = [
      ...this.filtered().map(t => ({
        date: formatDate(t.date.toDate()),
        type: t.type as 'expense' | 'income',
        segmentName: t.segmentName,
        categoryName: t.categoryName,
        amount: t.amount,
        paymentMethod: t.paymentMethod || 'cash',
        paidByName: t.paidByName || t.createdByName || 'Unknown',
      })),
      ...incomeForRange.map(t => ({
        date: formatDate(t.date.toDate()),
        type: 'income' as const,
        segmentName: t.segmentName,
        categoryName: t.categoryName,
        amount: t.amount,
        paymentMethod: t.paymentMethod || 'cash',
        paidByName: t.paidByName || t.createdByName || 'Unknown',
      })),
    ];

    const data: WhatsappShareData = {
      rangeLabel: this.rangeLabel,
      totalExpense: this.totalExpense(),
      investmentSummary: this.investmentSummary(),
      segmentTotals: this.segmentTotals(),
      categoryBreakdown,
      incomeDetails,
      totalIncome,
      stockDetails,
      transactions: allTxns,
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
