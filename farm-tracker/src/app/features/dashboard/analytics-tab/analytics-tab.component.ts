import { ChangeDetectionStrategy, Component, inject, signal, computed, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Transaction, pendingRemaining, settledPortion } from '../../../core/models/transaction.model';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { TransactionService } from '../../../core/services/transaction.service';
import { LoanService } from '../../../core/services/loan.service';
import { Loan } from '../../../core/models/loan.model';
import { SummaryService } from '../../../core/services/summary.service';
import { SegmentService } from '../../../core/services/segment.service';
import { UserService } from '../../../core/services/user.service';
import { Segment } from '../../../core/models/segment.model';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { WhatsappShareDialogComponent, WhatsappShareData, ShareTransaction } from './whatsapp-share-dialog.component';
import { getMonthRange } from '../../../core/utils/date.utils';
import { safeLoad } from '../../../core/utils/async.utils';
import { ToastService } from '../../../core/services/toast.service';
import { normalizeName } from '../../../core/utils/name.utils';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { DateRangeSelection } from '../../../shared/components/date-range-filter/date-range-filter.component';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
/** Running per-person tally used by both the initial load and the filtered recompute. */
interface PersonTally {
  expensesPaid: number;
  incomeReceived: number;
  holding: number;
  loanHolds: number;
  loanHoldsDetails: { loanId: string; label: string; amount: number }[];
  loanOwes: number;
  loanOwesDetails: { loanId: string; label: string; amount: number }[];
  /** Spend drawn from a loan in this person's custody — farm money, not their own capital. */
  loanFundedSpend: number;
  /** Spend drawn from undistributed income they were holding. */
  spentFromHeldCash: number;
}

@Component({
  selector: 'app-analytics-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyInrPipe, LoadingSpinnerComponent,
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
      <!-- Tag Chips -->
      @if (allTags().length > 0) {
        <div class="filter-row">
          <span class="filter-label">Tag</span>
          <div class="chip-scroll">
            <button class="filter-chip" [class.active]="!filterTag" (click)="onTagChipClick('')">All</button>
            @for (tag of allTags(); track tag) {
              <button class="filter-chip" [class.active]="filterTag === tag" (click)="onTagChipClick(tag)">{{ tag }}</button>
            }
          </div>
        </div>
      }
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <!-- Summary Stats: use pre-aggregated summaries when unfiltered, transaction-based when filtered -->
      <div class="summary-grid">
        <mat-card class="stat-card total">
          <span class="stat-label">Total Expense</span>
          <span class="stat-value expense-text">{{ (hasFilters() ? totalExpense() : summaryTotalExpense()) | currencyInr }}</span>
          <span class="stat-count">{{ filtered().length }} transactions</span>
        </mat-card>
        <mat-card class="stat-card income-card">
          <span class="stat-label">Total Income</span>
          <span class="stat-value income-text">{{ (hasFilters() ? totalIncomeAmount() : summaryTotalIncome()) | currencyInr }}</span>
          <span class="stat-count">{{ filteredIncome().length }} transactions</span>
        </mat-card>
        <mat-card class="stat-card" [class.profit]="(hasFilters() ? netProfit() : summaryNetProfit()) >= 0" [class.loss]="(hasFilters() ? netProfit() : summaryNetProfit()) < 0">
          <span class="stat-label">Net Profit/Loss</span>
          <span class="stat-value" [class.income-text]="(hasFilters() ? netProfit() : summaryNetProfit()) >= 0" [class.expense-text]="(hasFilters() ? netProfit() : summaryNetProfit()) < 0">{{ (hasFilters() ? netProfit() : summaryNetProfit()) | currencyInr }}</span>
        </mat-card>
        @if ((hasFilters() ? pendingIncomeAmount() : summaryPendingIncome()) > 0) {
          <mat-card class="stat-card pending-card" (click)="goToDues('receivables')">
            <span class="stat-label">Pending (To Receive)</span>
            <span class="stat-value pending-text">{{ (hasFilters() ? pendingIncomeAmount() : summaryPendingIncome()) | currencyInr }}</span>
            <span class="stat-count">to receive — view dues</span>
          </mat-card>
        }
        @if ((hasFilters() ? pendingExpenseAmount() : summaryPendingExpense()) > 0) {
          <mat-card class="stat-card credit-card" (click)="goToDues('payables')">
            <span class="stat-label">Credit (To Pay)</span>
            <span class="stat-value expense-text">{{ (hasFilters() ? pendingExpenseAmount() : summaryPendingExpense()) | currencyInr }}</span>
            <span class="stat-count">to pay — view dues</span>
          </mat-card>
        }
        @if (totalUndistributed() > 0) {
          <mat-card class="stat-card undistributed-card">
            <span class="stat-label">Undistributed</span>
            <span class="stat-value holding-text">{{ totalUndistributed() | currencyInr }}</span>
          </mat-card>
        }
      </div>

      <!-- Tag Productivity -->
      @if (filterTag && tagProductivity()) {
        <h3 class="section-title">Tag: "{{ filterTag }}" Productivity</h3>
        <div class="summary-grid">
          <mat-card class="stat-card income-card">
            <span class="stat-label">Income</span>
            <span class="stat-value income-text">{{ tagProductivity()!.income | currencyInr }}</span>
            <span class="stat-count">{{ tagProductivity()!.incomeCount }} transactions</span>
          </mat-card>
          <mat-card class="stat-card total">
            <span class="stat-label">Expense</span>
            <span class="stat-value expense-text">{{ tagProductivity()!.expense | currencyInr }}</span>
            <span class="stat-count">{{ tagProductivity()!.expenseCount }} transactions</span>
          </mat-card>
          <mat-card class="stat-card" [class.profit]="tagProductivity()!.net >= 0" [class.loss]="tagProductivity()!.net < 0">
            <span class="stat-label">Net Profit/Loss</span>
            <span class="stat-value" [class.income-text]="tagProductivity()!.net >= 0" [class.expense-text]="tagProductivity()!.net < 0">{{ tagProductivity()!.net | currencyInr }}</span>
          </mat-card>
        </div>
      }

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
            @if (p.cashInHand > 0) {
              <div class="cash-in-hand">
                <span class="cash-label">Cash in Hand</span>
                <span class="cash-value">{{ p.cashInHand | currencyInr }}</span>
              </div>
            }
            <div class="invest-details">
              <div class="invest-row">
                <span class="invest-label">Expenses paid</span>
                <span class="invest-value expense">{{ p.expensesPaid | currencyInr }}</span>
              </div>
              @if (p.fundedFromFarmCash > 0) {
                <div class="invest-row">
                  <span class="invest-label">…funded from farm cash</span>
                  <span class="invest-value income">-{{ p.fundedFromFarmCash | currencyInr }}</span>
                </div>
              }
              <div class="invest-row">
                <span class="invest-label">Income received</span>
                <span class="invest-value income">-{{ p.incomeReceived | currencyInr }}</span>
              </div>
              @if (p.holding > 0) {
                <div class="invest-row">
                  <span class="invest-label"><span class="holding-tag income-hold">Income</span> Undistributed</span>
                  <span class="invest-value income-holding">{{ p.holding | currencyInr }}</span>
                </div>
              }
              @if (p.loanHolds > 0) {
                <div class="invest-row">
                  <span class="invest-label"><span class="holding-tag loan-hold">Loan</span> Holds (custody)</span>
                  <span class="invest-value loan-holds">{{ p.loanHolds | currencyInr }}</span>
                </div>
                @for (ld of p.loanHoldsDetails; track ld.loanId) {
                  <div class="invest-row sub-row">
                    <span class="invest-label sub-label">↳ {{ ld.label }}</span>
                    <span class="invest-value loan-holds">{{ ld.amount | currencyInr }}</span>
                  </div>
                }
              }
              @if (p.loanOwes > 0) {
                <div class="invest-row">
                  <span class="invest-label"><span class="holding-tag loan-owes">Loan</span> Owes (personal use)</span>
                  <span class="invest-value loan-owes-val">{{ p.loanOwes | currencyInr }}</span>
                </div>
                @for (ld of p.loanOwesDetails; track ld.loanId) {
                  <div class="invest-row sub-row">
                    <span class="invest-label sub-label">↳ {{ ld.label }}</span>
                    <span class="invest-value loan-owes-val">{{ ld.amount | currencyInr }}</span>
                  </div>
                }
              }
            </div>
          </mat-card>
        }
      </div>

      <!-- Charts Section -->
      <h3 class="section-title desktop-only">Breakdown</h3>
      <div class="charts-grid desktop-only">
        <mat-card class="chart-card">
          <h3>Expense by Person</h3>
          @if (personChartData().labels!.length > 0) {
            <canvas baseChart
              [datasets]="personChartData().datasets"
              [labels]="personChartData().labels"
              [options]="barOptions"
              type="bar"></canvas>
          }
        </mat-card>
        <mat-card class="chart-card">
          <h3>Expense by Category</h3>
          @if (categoryChartData().labels!.length > 0) {
            <canvas baseChart
              [datasets]="categoryChartData().datasets"
              [labels]="categoryChartData().labels"
              [options]="pieOptions"
              type="doughnut"></canvas>
          }
        </mat-card>
      </div>

      <!-- Segment Cards: profit per segment from summaries when unfiltered,
           filtered expense totals when a person/tag/segment chip is active -->
      <h3 class="section-title">{{ hasFilters() ? 'Segments' : 'Profit by Segment' }}</h3>
      <div class="summary-grid">
        @if (hasFilters()) {
          @for (seg of segmentTotals(); track seg.name) {
            <mat-card class="stat-card">
              <span class="stat-label">{{ seg.name }}</span>
              <span class="stat-value">{{ seg.total | currencyInr }}</span>
              <span class="stat-count">{{ seg.count }} txns</span>
            </mat-card>
          }
        } @else {
          @for (seg of segmentProfit(); track seg.segment) {
            <mat-card class="stat-card" [class.profit]="seg.profit >= 0" [class.loss]="seg.profit < 0">
              <span class="stat-label">{{ seg.name }}</span>
              <span class="stat-value" [class.income-text]="seg.profit >= 0" [class.expense-text]="seg.profit < 0">{{ seg.profit | currencyInr }}</span>
              <span class="stat-count">In {{ seg.income | currencyInr }} · Out {{ seg.expense | currencyInr }}</span>
            </mat-card>
          }
        }
      </div>

      <div class="charts-grid desktop-only">
        <mat-card class="chart-card">
          <h3>Expense by Segment</h3>
          @if (segmentChartData().labels!.length > 0) {
            <canvas baseChart
              [datasets]="segmentChartData().datasets"
              [labels]="segmentChartData().labels"
              [options]="pieOptions"
              type="doughnut"></canvas>
          }
        </mat-card>
        <mat-card class="chart-card">
          <h3>Monthly Expense Trend</h3>
          @if (monthlyChartData().labels!.length > 0) {
            <canvas baseChart
              [datasets]="monthlyChartData().datasets"
              [labels]="monthlyChartData().labels"
              [options]="barOptions"
              type="bar"></canvas>
          }
        </mat-card>
      </div>

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
    .stat-card.total { border-color: var(--color-primary); background: var(--color-primary-light); }
    .stat-card.income-card { border-color: var(--color-income); background: var(--color-income-bg); }
    .stat-card.profit { border-color: var(--color-income); background: var(--color-income-bg); }
    .stat-card.loss { border-color: var(--color-expense); background: var(--color-expense-bg); }
    .expense-text { color: var(--color-expense); }
    .income-text { color: var(--color-income); }
    .holding-text { color: var(--color-warning); }
    .undistributed-card { border-color: var(--color-warning); background: var(--color-warning-light); }
    .pending-text { color: var(--color-expense); }
    .pending-card { border-color: var(--color-expense); background: var(--color-expense-bg); cursor: pointer; }
    .credit-card { border-color: var(--color-expense); background: var(--color-expense-bg); cursor: pointer; }
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
    .cash-in-hand { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 10px; margin-bottom: 10px; background: var(--color-income-bg); border-radius: 6px; }
    .cash-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--color-income); }
    .cash-value { font-size: 1.1rem; font-weight: 700; color: var(--color-income); }
    .invest-details { display: flex; flex-direction: column; gap: 6px; }
    .invest-row { display: flex; justify-content: space-between; font-size: 0.8rem; }
    .invest-label { color: var(--color-text-secondary); }
    .invest-value { font-weight: 600; }
    .invest-value.expense { color: var(--color-expense); }
    .invest-value.income { color: var(--color-income); }
    .invest-value.income-holding { color: var(--color-warning); }
    .invest-value.loan-holds { color: var(--color-purple); }
    .invest-value.loan-owes-val { color: var(--color-danger); }
    .holding-tag { font-size: 0.6rem; padding: 1px 4px; border-radius: 3px; font-weight: 700; text-transform: uppercase; margin-right: 4px; vertical-align: middle; }
    .holding-tag.income-hold { background: var(--color-warning-light); color: var(--color-warning); }
    .holding-tag.loan-hold { background: var(--color-purple-light); color: var(--color-purple); }
    .holding-tag.loan-owes { background: var(--color-danger-light); color: var(--color-danger); }
    .invest-row.sub-row { padding-left: 1rem; opacity: 0.85; }
    .invest-label.sub-label { font-size: 0.7rem; color: var(--color-text-muted); }

    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .chart-card { padding: 1.25rem; }
    .chart-card h3 { margin: 0 0 1rem; font-size: var(--font-md); color: var(--color-text); }

    @media (max-width: 768px) {
      .charts-grid { grid-template-columns: 1fr; }
      .person-grid { grid-template-columns: 1fr; }
      .desktop-only { display: none; }
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
      .invest-row.sub-row { padding-left: 0.75rem; font-size: 0.65rem; }
      .holding-tag { font-size: 0.5rem; padding: 1px 3px; }
      .filter-chip { padding: 5px 10px; font-size: 0.75rem; }
    }
  `],
})
export class AnalyticsTabComponent implements OnInit, OnChanges {
  @Input() dateSelection!: DateRangeSelection;

  private transactionService = inject(TransactionService);
  private summaryService = inject(SummaryService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  private loanService = inject(LoanService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  private router = inject(Router);

  loading = signal(true);
  allTransactions = signal<Transaction[]>([]);
  filtered = signal<Transaction[]>([]);

  private currentSelection!: DateRangeSelection;

  // Filters
  filterSegment = '';
  filterPaidBy = '';
  filterCategory = '';
  filterTag = '';


  // Unique values for dropdowns
  allSegments = signal<string[]>([]);
  allPaidBy = signal<string[]>([]);
  allCategories = signal<string[]>([]);
  allTags = signal<string[]>([]);
  tagProductivity = signal<{ income: number; expense: number; net: number; incomeCount: number; expenseCount: number } | null>(null);

  // Summary-based totals (accurate, from pre-aggregated Firestore summaries)
  // Income/profit/expense count settled money only; pending sales and credit
  // purchases are shown separately as Pending (To Receive) / Credit (To Pay)
  summaryTotalExpense = signal(0);
  summaryTotalIncome = signal(0);
  summaryNetProfit = signal(0);
  summaryPendingIncome = signal(0);
  summaryPendingExpense = signal(0);
  /** Raw summaries for the selected range — the single source for every per-segment figure. */
  private rangeSummaries = signal<MonthlySummary[]>([]);
  /** Settled-cash income / expense / profit per segment, same basis as the tiles above. */
  segmentProfit = computed(() =>
    this.summaryService.settledBySegment(this.rangeSummaries()).map(s => ({
      ...s,
      name: this.segments().find(x => x.id === s.segment)?.name || s.segment,
    })),
  );

  // Computed stats (from loaded transactions — used for charts/breakdowns)
  totalExpense = signal(0);
  segmentTotals = signal<{ name: string; total: number; count: number }[]>([]);
  personTotals = signal<{ name: string; total: number; segments: { name: string; total: number }[] }[]>([]);
  investmentSummary = signal<{
    name: string;
    expensesPaid: number;
    incomeReceived: number;
    holding: number;
    loanHolds: number;
    loanHoldsDetails: { loanId: string; label: string; amount: number }[];
    loanOwes: number;
    loanOwesDetails: { loanId: string; label: string; amount: number }[];
    loanFundedSpend: number;
    spentFromHeldCash: number;
    fundedFromFarmCash: number;
    net: number;
    cashInHand: number;
  }[]>([]);
  maxInvestment = signal(0);
  incomeTransactions = signal<Transaction[]>([]);
  segments = signal<Segment[]>([]);
  totalIncomeAmount = signal(0);
  netProfit = signal(0);
  totalUndistributed = signal(0);
  pendingIncomeAmount = signal(0);
  pendingExpenseAmount = signal(0);
  filteredIncome = signal<Transaction[]>([]);

  // Cached data (loaded once, reused across filter changes)
  private cachedUidToName: Record<string, string> = {};
  private cachedLoans: Loan[] = [];

  // Charts
  segmentChartData = signal<ChartConfiguration<'doughnut'>['data']>({ labels: [], datasets: [] });
  categoryChartData = signal<ChartConfiguration<'doughnut'>['data']>({ labels: [], datasets: [] });
  personChartData = signal<ChartConfiguration<'bar'>['data']>({ labels: [], datasets: [] });
  monthlyChartData = signal<ChartConfiguration<'bar'>['data']>({ labels: [], datasets: [] });

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
    try {
      const [segs, users] = await Promise.all([
        this.segmentService.getAll(),
        this.userService.getAll(),
      ]);
      this.segments.set(segs);
      // Always show all active segments and users in filter chips
      this.allSegments.set(segs.filter(s => s.isActive).map(s => s.name).sort());
      this.allPaidBy.set(users.filter(u => u.isActive).map(u => u.displayName).sort());
    } catch (err) {
      console.error('[AnalyticsTab] ngOnInit', err);
      this.toast.error('Failed to load data. Check your connection and try again.');
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['dateSelection'] && this.dateSelection) {
      this.currentSelection = this.dateSelection;
      await this.loadTransactions();
    }
  }

  async loadTransactions(): Promise<void> {
    await safeLoad(this.loading, async () => {
      // Clear cache on fresh data load
      this.cachedUidToName = {};
      this.cachedLoans = [];
      const filters: any = { type: 'expense' as const };

      if (this.currentSelection.mode === 'monthly') {
        filters.month = this.currentSelection.month;
      }

      // Fetch transactions AND pre-aggregated summaries in parallel
      // Summaries give accurate totals; transactions are for breakdowns/charts
      const [result, summaries] = await Promise.all([
        this.transactionService.getAll(filters, 200),
        this.loadSummaries(),
      ]);

      // Set accurate totals from summaries.
      // Summaries count money at billing time, so strip pending (unreceived)
      // sales and credit (unpaid) purchases out of the tiles and surface them
      // separately as Pending (To Receive) / Credit (To Pay).
      const summaryTotals = this.summaryService.aggregateSummaries(summaries);
      const settled = this.summaryService.settledTotals(summaries);
      this.rangeSummaries.set(summaries);
      this.summaryTotalExpense.set(settled.expense);
      this.summaryTotalIncome.set(settled.income);
      this.summaryNetProfit.set(settled.profit);
      this.summaryPendingIncome.set(summaryTotals.pendingIncome);
      this.summaryPendingExpense.set(summaryTotals.pendingExpense);

      let txns = result.transactions;

      if (this.currentSelection.mode === 'custom') {
        txns = txns.filter(t => t.month >= this.currentSelection.fromMonth! && t.month <= this.currentSelection.toMonth!);
      }

      this.allTransactions.set(txns);

      // Extract unique tags from expense transactions (income tags added below)
      const tagSet = new Set<string>(txns.flatMap(t => t.tags || []));

      // Merge transaction names with base reference data (adds external/non-registered persons)
      const txnPersons = txns.map(t => normalizeName(t.paidByName || 'Unknown'));
      this.allPaidBy.set([...new Set([...this.allPaidBy(), ...txnPersons])].sort());
      this.allCategories.set([...new Set(txns.map((t) => t.categoryName))].sort());

      this.applyFilters();
      await this.buildInvestmentSummary(txns);

      // Merge income tags and set allTags
      this.incomeTransactions().forEach(t => (t.tags || []).forEach(tag => tagSet.add(tag)));
      this.allTags.set([...tagSet].sort());
    }, this.toast);
  }

  /** Load the pre-aggregated monthly summaries covering the selected date range. */
  private async loadSummaries(): Promise<MonthlySummary[]> {
    try {
      if (this.currentSelection.mode === 'monthly' && this.currentSelection.month) {
        return await this.summaryService.getForMonth(this.currentSelection.month);
      } else if (this.currentSelection.mode === 'custom') {
        const months = getMonthRange(this.currentSelection.fromMonth!, this.currentSelection.toMonth!);
        return await this.summaryService.getForMonthsBatched(months);
      }
      // All time — use all monthly summaries
      return await this.summaryService.getAll();
    } catch {
      return [];
    }
  }

  private async buildInvestmentSummary(expenseTxns: Transaction[]): Promise<void> {
    const personMap: Record<string, PersonTally> = {};

    // Build UID→name lookup (cache for reuse in applyFilters)
    if (Object.keys(this.cachedUidToName).length === 0) {
      const users = await this.userService.getAll();
      for (const u of users) {
        if (u.isActive) this.cachedUidToName[u.uid] = normalizeName(u.displayName);
      }
    }
    const uidToName = this.cachedUidToName;

    // Resolve a person to a consistent key (prefer UID-based name, fallback to normalized input)
    const resolveKey = (uid: string | null | undefined, name: string | null | undefined): string => {
      if (uid && uid !== 'other' && uidToName[uid]) return uidToName[uid];
      return normalizeName(name || 'Unknown');
    };

    const ensurePerson = (name: string) => {
      if (!personMap[name]) personMap[name] = { expensesPaid: 0, incomeReceived: 0, holding: 0, loanHolds: 0, loanHoldsDetails: [], loanOwes: 0, loanOwesDetails: [], loanFundedSpend: 0, spentFromHeldCash: 0 };
    };

    for (const txn of expenseTxns) {
      const name = resolveKey(txn.paidBy, txn.paidByName || txn.createdByName);
      ensurePerson(name);
      const settled = settledPortion(txn);
      personMap[name].expensesPaid += settled;
      // Spending drawn from a loan this person holds is farm money, not their own capital.
      // (loanHolds already nets this out of custody via utilizationRemaining.)
      if (txn.linkedLoanId) personMap[name].loanFundedSpend += settled;
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
      this.pendingIncomeAmount.set(
        incomeForRange.reduce((s, t) => s + pendingRemaining(t), 0)
      );

      let distributedTotal = 0;
      let undistributedTotal = 0;

      for (const txn of incomeForRange) {
        // Total of ALL distributions (including reinvestment) = money that's been allocated
        const totalAllocated = (txn.distributions || [])
          .reduce((s, d) => s + d.amount, 0);

        // Only count person distributions as income (not reinvestment)
        for (const d of (txn.distributions || [])) {
          if (d.uid === 'reinvestment') continue;
          const dName = resolveKey(d.uid, d.name);
          ensurePerson(dName);
          personMap[dName].incomeReceived += d.amount;
          distributedTotal += d.amount;
        }

        // Undistributed = total income - everything allocated (including reinvestment).
        // Pending (unreceived) income is not money in hand — it belongs in Dues, not here.
        const receiver = resolveKey(txn.paidBy, txn.paidByName || txn.createdByName);
        const undistributed = txn.amount - totalAllocated;
        if (undistributed > 0 && txn.paymentStatus !== 'pending') {
          ensurePerson(receiver);
          personMap[receiver].holding += undistributed;
          undistributedTotal += undistributed;
        }
      }

      // Total Income = only distributed to persons (not undistributed, not reinvestment)
      this.totalIncomeAmount.set(distributedTotal);
      this.netProfit.set(distributedTotal - this.totalExpense());
    } catch {}

    // Loan tracking — separate "holds" (custody) from "owes" (personal debt)
    try {
      if (this.cachedLoans.length === 0) {
        const loanResult = await this.loanService.getAll({}, 200);
        this.cachedLoans = loanResult.loans;
      }
      for (const loan of this.cachedLoans) {
        // Personal withdrawals = OWES (person took money for personal use, must return)
        if (loan.parentFormalLoanId && loan.balanceRemaining > 0) {
          const name = resolveKey(loan.personUid, loan.personName);
          ensurePerson(name);
          personMap[name].loanOwes += loan.balanceRemaining;
          personMap[name].loanOwesDetails.push({
            loanId: loan.id,
            label: loan.purpose || 'Personal use',
            amount: loan.balanceRemaining,
          });
        }
        // Formal loan fund holders = HOLDS (person manages business money, not personal debt)
        if (loan.loanCategory === 'formal' && loan.repaymentStatus !== 'completed') {
          const label = `${loan.loanSourceName ?? loan.personName}${loan.accountNumber ? ' (' + loan.accountNumber + ')' : ''}`;
          // Cash advanced to other people to hold (float) — attribute to each of them
          const openAdvances = (loan.advances ?? []).filter(a => a.status === 'open');
          let advancedOut = 0;
          for (const a of openAdvances) {
            const bal = a.amount - a.spent - a.returned;
            if (bal <= 0) continue;
            advancedOut += bal;
            const aName = resolveKey(a.personUid, a.personName);
            ensurePerson(aName);
            personMap[aName].loanHolds += bal;
            personMap[aName].loanHoldsDetails.push({ loanId: loan.id, label: `Advance · ${label}`, amount: bal });
          }
          // The named holder keeps whatever unused funds are not advanced out
          const holderShare = (loan.utilizationRemaining ?? 0) - advancedOut;
          if (loan.heldByName && holderShare > 0) {
            const name = resolveKey(loan.heldByUid, loan.heldByName);
            ensurePerson(name);
            personMap[name].loanHolds += holderShare;
            personMap[name].loanHoldsDetails.push({ loanId: loan.id, label, amount: holderShare });
          }
        }
      }
    } catch {}

    const summary = Object.entries(personMap)
      .map(([name, data]) => {
        // Spending someone funds out of farm cash they are already holding is not an
        // investment by them, and it must also draw that cash down. Loan-funded spend is
        // already netted out of loanHolds, so only the income-custody part reduces holding.
        const ownSpendBeforeHeld = Math.max(0, data.expensesPaid - data.loanFundedSpend);
        const spentFromHeldCash = Math.min(ownSpendBeforeHeld, data.holding);
        const holdingLeft = data.holding - spentFromHeldCash;
        const fundedFromFarmCash = data.loanFundedSpend + spentFromHeldCash;
        return {
          name,
          ...data,
          spentFromHeldCash,
          fundedFromFarmCash,
          // Own money actually put in, net of anything funded from farm cash in custody.
          net: data.expensesPaid - fundedFromFarmCash - data.incomeReceived,
          holding: holdingLeft,
          // Cash this person holds right now: undistributed income they have not spent,
          // plus unused loan funds in their custody. Loan Owes is a receivable, so excluded.
          cashInHand: holdingLeft + data.loanHolds,
        };
      })
      .sort((a, b) => b.net - a.net);

    this.investmentSummary.set(summary);
    this.maxInvestment.set(summary.length > 0 ? Math.max(...summary.map(s => s.net)) : 0);
    this.totalUndistributed.set(summary.reduce((s, p) => s + p.holding, 0));
  }

  goToDues(tab: 'receivables' | 'payables' = 'receivables'): void {
    this.router.navigate(['/dues'], { queryParams: { tab } });
  }

  setFilter(type: 'all' | 'person' | 'segment', value: string): void {
    if (type === 'all') {
      this.filterPaidBy = '';
      this.filterSegment = '';
      this.filterCategory = '';
      this.filterTag = '';
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

  onTagChipClick(tag: string): void {
    this.filterTag = this.filterTag === tag ? '' : tag;
    this.applyFilters();
  }

  hasFilters(): boolean {
    return !!(this.filterSegment || this.filterPaidBy || this.filterCategory || this.filterTag);
  }

  clearFilters(): void {
    this.setFilter('all', '');
  }

  applyFilters(): void {
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
    if (this.filterTag) {
      txns = txns.filter(t => t.tags?.includes(this.filterTag));
    }

    this.filtered.set(txns);
    // Tiles/charts count settled cash only; the credit (unpaid) portion is
    // surfaced separately in the Credit (To Pay) tile
    this.totalExpense.set(txns.reduce((s, t) => s + settledPortion(t), 0));
    this.pendingExpenseAmount.set(txns.reduce((s, t) => s + pendingRemaining(t), 0));

    // Segment totals
    const segMap = new Map<string, { total: number; count: number }>();
    txns.forEach((t) => {
      const e = segMap.get(t.segmentName) || { total: 0, count: 0 };
      e.total += settledPortion(t);
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
      segInner.set(t.segmentName, (segInner.get(t.segmentName) || 0) + settledPortion(t));
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
    if (this.filterTag) incomeForRange = incomeForRange.filter(t => t.tags?.includes(this.filterTag));
    this.filteredIncome.set(incomeForRange);
    this.pendingIncomeAmount.set(
      incomeForRange.reduce((s, t) => s + pendingRemaining(t), 0)
    );

    // Compute tag productivity when a tag is selected
    if (this.filterTag) {
      const tagExpense = txns.reduce((s, t) => s + t.amount, 0);
      const tagIncome = incomeForRange.reduce((s, t) => s + t.amount, 0);
      this.tagProductivity.set({
        income: tagIncome,
        expense: tagExpense,
        net: tagIncome - tagExpense,
        incomeCount: incomeForRange.length,
        expenseCount: txns.length,
      });
    } else {
      this.tagProductivity.set(null);
    }

    // Rebuild person investment from filtered data (use cached UID lookup)
    const uidToName2 = this.cachedUidToName;
    const resolveKey2 = (uid: string | null | undefined, name: string | null | undefined): string => {
      if (uid && uid !== 'other' && uidToName2[uid]) return uidToName2[uid];
      return normalizeName(name || 'Unknown');
    };
    const investMap: Record<string, PersonTally> = {};
    const ensurePerson2 = (name: string) => {
      if (!investMap[name]) investMap[name] = { expensesPaid: 0, incomeReceived: 0, holding: 0, loanHolds: 0, loanHoldsDetails: [], loanOwes: 0, loanOwesDetails: [], loanFundedSpend: 0, spentFromHeldCash: 0 };
    };
    let distributedTotal = 0;
    for (const t of txns) {
      const name = resolveKey2(t.paidBy, t.paidByName || t.createdByName);
      ensurePerson2(name);
      const settled = settledPortion(t);
      investMap[name].expensesPaid += settled;
      if (t.linkedLoanId) investMap[name].loanFundedSpend += settled;
    }
    for (const t of incomeForRange) {
      const totalAllocated = (t.distributions || []).reduce((s, d) => s + d.amount, 0);
      for (const d of (t.distributions || [])) {
        if (d.uid === 'reinvestment') continue;
        const dName = resolveKey2(d.uid, d.name);
        ensurePerson2(dName);
        investMap[dName].incomeReceived += d.amount;
        distributedTotal += d.amount;
      }
      const receiver = resolveKey2(t.paidBy, t.paidByName || t.createdByName);
      const undistributed = t.amount - totalAllocated;
      if (undistributed > 0 && t.paymentStatus !== 'pending') {
        ensurePerson2(receiver);
        investMap[receiver].holding += undistributed;
      }
    }
    // Loan tracking — holds vs owes (use cached loans)
    try {
      for (const loan of this.cachedLoans) {
        if (loan.parentFormalLoanId && loan.balanceRemaining > 0) {
          const name = resolveKey2(loan.personUid, loan.personName);
          ensurePerson2(name);
          investMap[name].loanOwes += loan.balanceRemaining;
          investMap[name].loanOwesDetails.push({ loanId: loan.id, label: loan.purpose || 'Personal use', amount: loan.balanceRemaining });
        }
        if (loan.loanCategory === 'formal' && loan.repaymentStatus !== 'completed') {
          const label = `${loan.loanSourceName ?? loan.personName}${loan.accountNumber ? ' (' + loan.accountNumber + ')' : ''}`;
          const openAdvances = (loan.advances ?? []).filter(a => a.status === 'open');
          let advancedOut = 0;
          for (const a of openAdvances) {
            const bal = a.amount - a.spent - a.returned;
            if (bal <= 0) continue;
            advancedOut += bal;
            const aName = resolveKey2(a.personUid, a.personName);
            ensurePerson2(aName);
            investMap[aName].loanHolds += bal;
            investMap[aName].loanHoldsDetails.push({ loanId: loan.id, label: `Advance · ${label}`, amount: bal });
          }
          const holderShare = (loan.utilizationRemaining ?? 0) - advancedOut;
          if (loan.heldByName && holderShare > 0) {
            const name = resolveKey2(loan.heldByUid, loan.heldByName);
            ensurePerson2(name);
            investMap[name].loanHolds += holderShare;
            investMap[name].loanHoldsDetails.push({ loanId: loan.id, label, amount: holderShare });
          }
        }
      }
    } catch {}

    this.totalIncomeAmount.set(distributedTotal);
    this.netProfit.set(distributedTotal - this.totalExpense());

    let summaryEntries = Object.entries(investMap);
    if (this.filterPaidBy) {
      summaryEntries = summaryEntries.filter(([name]) => name === this.filterPaidBy);
    }
    const summary = summaryEntries
      .map(([name, data]) => {
        const ownSpendBeforeHeld = Math.max(0, data.expensesPaid - data.loanFundedSpend);
        const spentFromHeldCash = Math.min(ownSpendBeforeHeld, data.holding);
        const holdingLeft = data.holding - spentFromHeldCash;
        const fundedFromFarmCash = data.loanFundedSpend + spentFromHeldCash;
        return {
          name,
          ...data,
          spentFromHeldCash,
          fundedFromFarmCash,
          net: data.expensesPaid - fundedFromFarmCash - data.incomeReceived,
          holding: holdingLeft,
          cashInHand: holdingLeft + data.loanHolds,
        };
      })
      .sort((a, b) => b.net - a.net);
    this.investmentSummary.set(summary);
    this.maxInvestment.set(summary.length > 0 ? Math.max(...summary.map(s => s.net)) : 0);
    this.totalUndistributed.set(summary.reduce((s, p) => s + p.holding, 0));
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
    try {
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
    } catch (err) {
      console.error('[AnalyticsTab] exportPdf', err);
      this.toast.error('Failed to export PDF report. Check your connection and try again.');
    }
  }

  async exportCsv(): Promise<void> {
    try {
      const exportService = await this.getExportService();
      exportService.exportTransactionsCsv(this.filtered(), `transactions-${this.rangeLabel}`);
    } catch (err) {
      console.error('[AnalyticsTab] exportCsv', err);
      this.toast.error('Failed to export CSV. Check your connection and try again.');
    }
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
    this.segmentChartData.set({
      labels: segLabels,
      datasets: [{ data: segData, backgroundColor: this.colors.slice(0, segLabels.length) }],
    });

    // Category doughnut
    const catMap = new Map<string, number>();
    txns.forEach((t) => catMap.set(t.categoryName, (catMap.get(t.categoryName) || 0) + settledPortion(t)));
    const catEntries = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
    this.categoryChartData.set({
      labels: catEntries.map(([k]) => k),
      datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: this.colors.slice(0, catEntries.length) }],
    });

    // Person bar
    const persons = this.personTotals();
    this.personChartData.set({
      labels: persons.map((p) => p.name),
      datasets: [{
        data: persons.map((p) => p.total),
        backgroundColor: this.colors.slice(0, persons.length),
      }],
    });

    // Monthly bar
    const monthMap = new Map<string, number>();
    txns.forEach((t) => monthMap.set(t.month, (monthMap.get(t.month) || 0) + settledPortion(t)));
    const monthEntries = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    this.monthlyChartData.set({
      labels: monthEntries.map(([m]) => {
        const [y, mo] = m.split('-');
        return new Date(parseInt(y), parseInt(mo) - 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      }),
      datasets: [{
        data: monthEntries.map(([, v]) => v),
        backgroundColor: '#4f46e5',
      }],
    });
  }
}
