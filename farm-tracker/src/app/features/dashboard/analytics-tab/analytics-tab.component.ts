import { ChangeDetectionStrategy, Component, inject, signal, Input, OnChanges, SimpleChanges, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Transaction, pendingRemaining, settledPortion } from '../../../core/models/transaction.model';
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
import { QuantityByUnit, quantityByUnit, formatQuantityByUnit } from '../../../core/utils/ledger.utils';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { DateRangeSelection } from '../../../shared/components/date-range-filter/date-range-filter.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** Running per-person tally used by the Person Investment cards. */
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

/** One card per segment: gross income / expense plus sale quantities grouped by unit. */
export interface SegmentCard {
  segment: string;
  name: string;
  icon: string;
  income: number;
  expense: number;
  soldQty: QuantityByUnit[];
}

@Component({
  selector: 'app-analytics-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyInrPipe, LoadingSpinnerComponent,
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
      <!-- Summary cards: gross (billed) figures, with the status split inside each card.
           Expense rows follow every chip; income rows follow Segment / Tag only —
           the Person chip narrows who *paid*, and which Person card is shown. -->
      <div class="summary-grid">
        <mat-card class="stat-card total">
          <span class="stat-label">Total Expense</span>
          <span class="stat-value expense-text">{{ expenseGross() | currencyInr }}</span>
          <span class="stat-count">{{ filtered().length }} transactions</span>
          <div class="card-breakdown">
            <div class="breakdown-row">
              <span class="bd-label">Paid</span>
              <span class="bd-value income-text">{{ totalExpense() | currencyInr }}</span>
            </div>
            @if (pendingExpenseAmount() > 0) {
              <div class="breakdown-row clickable" (click)="goToDues('payables')" title="View dues to pay">
                <span class="bd-label">Credit (to pay)</span>
                <span class="bd-value expense-text">{{ pendingExpenseAmount() | currencyInr }}</span>
              </div>
            }
          </div>
        </mat-card>
        <mat-card class="stat-card income-card">
          <span class="stat-label">Total Income</span>
          <span class="stat-value income-text">{{ incomeGross() | currencyInr }}</span>
          <span class="stat-count">{{ filteredIncome().length }} transactions</span>
          <div class="card-breakdown">
            <div class="breakdown-row">
              <span class="bd-label">Distributed</span>
              <span class="bd-value income-text">{{ totalIncomeAmount() | currencyInr }}</span>
            </div>
            @if (incomeReinvested() > 0) {
              <div class="breakdown-row">
                <span class="bd-label">Reinvested</span>
                <span class="bd-value reinvest-text">{{ incomeReinvested() | currencyInr }}</span>
              </div>
            }
            @if (totalUndistributed() > 0) {
              <div class="breakdown-row">
                <span class="bd-label">Undistributed</span>
                <span class="bd-value holding-text">{{ totalUndistributed() | currencyInr }}</span>
              </div>
            }
            @if (pendingIncomeAmount() > 0) {
              <div class="breakdown-row clickable" (click)="goToDues('receivables')" title="View dues to receive">
                <span class="bd-label">Pending (to receive)</span>
                <span class="bd-value expense-text">{{ pendingIncomeAmount() | currencyInr }}</span>
              </div>
            }
          </div>
        </mat-card>
        <mat-card class="stat-card" [class.profit]="netProfit() >= 0" [class.loss]="netProfit() < 0">
          <span class="stat-label">Net Profit/Loss</span>
          <span class="stat-value" [class.income-text]="netProfit() >= 0" [class.expense-text]="netProfit() < 0">{{ netProfit() | currencyInr }}</span>
          <span class="stat-count">income − expense</span>
        </mat-card>
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

      <!-- Segment cards: gross income / expense per segment plus what was sold -->
      <h3 class="section-title">Segments</h3>
      @if (segmentCards().length === 0) {
        <p class="no-data">No transactions for this selection.</p>
      } @else {
        <div class="segment-grid">
          @for (seg of segmentCards(); track seg.segment) {
            <mat-card class="segment-card">
              <div class="segment-name">{{ seg.icon }} {{ seg.name }}</div>
              <div class="segment-figures">
                <div class="segment-figure">
                  <span class="stat-label">Income</span>
                  <span class="segment-value income-text">{{ seg.income | currencyInr }}</span>
                </div>
                <div class="segment-figure">
                  <span class="stat-label">Expense</span>
                  <span class="segment-value expense-text">{{ seg.expense | currencyInr }}</span>
                </div>
              </div>
              @if (seg.soldQty.length > 0) {
                <div class="segment-sold">Sold: {{ soldLabel(seg.soldQty) }}</div>
              }
            </mat-card>
          }
        </div>
      }
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

    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-card { padding: 1.25rem; display: flex; flex-direction: column; border-left: 4px solid var(--color-border); min-width: 0; overflow: hidden; }
    .stat-card.total { border-color: var(--color-primary); background: var(--color-primary-light); }
    .stat-card.income-card { border-color: var(--color-income); background: var(--color-income-bg); }
    .stat-card.profit { border-color: var(--color-income); background: var(--color-income-bg); }
    .stat-card.loss { border-color: var(--color-expense); background: var(--color-expense-bg); }
    .expense-text { color: var(--color-expense); }
    .income-text { color: var(--color-income); }
    .holding-text { color: var(--color-warning); }
    .reinvest-text { color: var(--color-purple); }
    .stat-label { font-size: 0.7rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
    .stat-value {
      font-size: var(--font-2xl); font-weight: 700; color: var(--color-text); margin: 4px 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .stat-count { font-size: var(--font-sm); color: var(--color-text-muted); }

    /* Status split inside a summary card (same look as the Cash in Hand strip on person cards) */
    .card-breakdown { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; padding: 8px 10px; background: var(--color-bg-alt); border-radius: 6px; }
    .breakdown-row { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
    .breakdown-row.clickable { cursor: pointer; }
    .breakdown-row.clickable:hover .bd-label { text-decoration: underline; }
    .bd-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--color-text-secondary); white-space: nowrap; }
    .bd-value { font-size: 0.9rem; font-weight: 700; white-space: nowrap; }

    .section-title { margin: 1.5rem 0 0.75rem; font-size: 1.1rem; color: var(--color-text); }
    .no-data { color: var(--color-text-muted); font-size: 0.85rem; margin: 0 0 1.5rem; }

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

    .segment-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .segment-card { padding: 1.25rem; min-width: 0; }
    .segment-name { font-size: var(--font-lg); font-weight: 700; color: var(--color-text); margin-bottom: 8px; }
    .segment-figures { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .segment-figure { display: flex; flex-direction: column; min-width: 0; }
    .segment-value { font-size: var(--font-xl); font-weight: 700; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .segment-sold { margin-top: 8px; font-size: 0.8rem; color: var(--color-text-secondary); }

    @media (max-width: 768px) {
      .person-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 480px) {
      .summary-grid { grid-template-columns: 1fr 1fr; gap: 0.5rem; }
      .segment-grid { grid-template-columns: 1fr; gap: 0.5rem; }
      .stat-card { padding: 0.75rem 1rem; }
      .stat-label { font-size: 0.6rem; }
      .stat-value { font-size: 1.1rem; }
      .stat-count { font-size: 0.65rem; }
      /* A lone third card (Net) takes the whole row instead of half */
      .summary-grid > .stat-card:last-child:nth-child(odd) { grid-column: 1 / -1; }
      .card-breakdown { padding: 6px 8px; }
      .breakdown-row { flex-wrap: wrap; }
      .bd-label { font-size: 0.6rem; white-space: normal; }
      .bd-value { font-size: 0.8rem; margin-left: auto; }
      .section-title { font-size: 1rem; }
      .person-card { padding: 1rem; }
      .person-amount { font-size: 1rem; }
      .invest-row { font-size: 0.75rem; }
      .invest-row.sub-row { padding-left: 0.75rem; font-size: 0.65rem; }
      .holding-tag { font-size: 0.5rem; padding: 1px 3px; }
      .filter-chip { padding: 5px 10px; font-size: 0.75rem; }
      .segment-card { padding: 1rem; }
      .segment-value { font-size: 1rem; }
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
  /** Expense rows for the selected date range (every page, not just the first). */
  allTransactions = signal<Transaction[]>([]);
  /** Expense rows after the chips are applied. */
  filtered = signal<Transaction[]>([]);
  /** Income rows for the selected date range. */
  incomeTransactions = signal<Transaction[]>([]);
  /** Income rows after the Segment / Tag chips are applied. */
  filteredIncome = signal<Transaction[]>([]);

  private currentSelection!: DateRangeSelection;

  // Filters
  filterSegment = '';
  filterPaidBy = '';
  filterCategory = '';
  filterTag = '';

  // Unique values for chips
  allSegments = signal<string[]>([]);
  allPaidBy = signal<string[]>([]);
  allCategories = signal<string[]>([]);
  allTags = signal<string[]>([]);
  tagProductivity = signal<{ income: number; expense: number; net: number; incomeCount: number; expenseCount: number } | null>(null);

  // Expense card: gross (billed) → Paid (settled) + Credit (still to pay)
  expenseGross = signal(0);
  totalExpense = signal(0);          // settled portion — also feeds Person Investment + WhatsApp share
  pendingExpenseAmount = signal(0);  // credit still to pay
  // Income card: gross (billed) → Distributed + Reinvested + Undistributed + Pending
  incomeGross = signal(0);
  totalIncomeAmount = signal(0);     // distributed to persons
  incomeReinvested = signal(0);
  totalUndistributed = signal(0);
  pendingIncomeAmount = signal(0);   // still to receive
  netProfit = signal(0);             // incomeGross − expenseGross

  segmentTotals = signal<{ name: string; total: number; count: number }[]>([]);
  segmentCards = signal<SegmentCard[]>([]);
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
  segments = signal<Segment[]>([]);

  // Cached reference data (loaded with the transactions, reused across chip changes)
  private cachedUidToName: Record<string, string> = {};
  private cachedLoans: Loan[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const [segs, users] = await Promise.all([
        this.segmentService.getAll(),
        this.userService.getAll(),
      ]);
      this.segments.set(segs);
      // Always show all active segments and users in filter chips
      this.allSegments.set(segs.filter(s => s.isActive).map(s => s.name).sort());
      this.allPaidBy.set([...new Set([...this.allPaidBy(), ...users.filter(u => u.isActive).map(u => u.displayName)])].sort());
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
      const sel = this.currentSelection;

      // One query for both income and expense; page to the end so all-time /
      // multi-month totals are exact. Query shapes all have composite indexes:
      // month ==, month in (≤30), or no month filter at all.
      const filters: { month?: string; months?: string[] } = {};
      let rangeMonths: string[] = [];
      if (sel.mode === 'monthly' && sel.month) {
        filters.month = sel.month;
      } else if (sel.mode === 'custom') {
        rangeMonths = getMonthRange(sel.fromMonth!, sel.toMonth!);
        if (rangeMonths.length <= 30) filters.months = rangeMonths;
      }

      const [rows, users, loanResult] = await Promise.all([
        this.transactionService.getAllPages(filters),
        this.userService.getAll(),
        this.loanService.getAll({}, 200),
      ]);

      this.cachedUidToName = {};
      for (const u of users) {
        if (u.isActive) this.cachedUidToName[u.uid] = normalizeName(u.displayName);
      }
      this.cachedLoans = loanResult.loans;

      let inRange = rows;
      if (sel.mode === 'custom' && rangeMonths.length > 30) {
        inRange = rows.filter(t => t.month >= sel.fromMonth! && t.month <= sel.toMonth!);
      }
      const txns = inRange.filter(t => t.type === 'expense');
      const income = inRange.filter(t => t.type === 'income');
      this.allTransactions.set(txns);
      this.incomeTransactions.set(income);

      // Chips: registered users + anyone who paid an expense or received a distribution
      const txnPersons = txns.map(t => normalizeName(t.paidByName || 'Unknown'));
      const distributionNames = income
        .flatMap(t => (t.distributions || []))
        .filter(d => d.uid !== 'reinvestment')
        .map(d => d.name);
      this.allPaidBy.set([...new Set([...this.allPaidBy(), ...txnPersons, ...distributionNames])].sort());
      this.allCategories.set([...new Set(txns.map((t) => t.categoryName))].sort());
      this.allTags.set([...new Set(inRange.flatMap(t => t.tags || []))].sort());

      this.applyFilters();
    }, this.toast);
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

  /** "320 kg · 12 head" — same formatting as the Ledger footer */
  soldLabel(soldQty: QuantityByUnit[]): string {
    return formatQuantityByUnit(soldQty);
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
    this.expenseGross.set(txns.reduce((s, t) => s + t.amount, 0));
    this.totalExpense.set(txns.reduce((s, t) => s + settledPortion(t), 0));
    this.pendingExpenseAmount.set(txns.reduce((s, t) => s + pendingRemaining(t), 0));

    // Segment expense totals (settled) — WhatsApp share sends these
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

    // Income rows follow Segment / Category / Tag only (NOT Person): the Person
    // chip applies per-distribution on the person cards, not to the whole sale.
    let incomeForRange = this.incomeTransactions();
    if (this.filterSegment) incomeForRange = incomeForRange.filter(t => t.segmentName === this.filterSegment);
    if (this.filterCategory) incomeForRange = incomeForRange.filter(t => t.categoryName === this.filterCategory);
    if (this.filterTag) incomeForRange = incomeForRange.filter(t => t.tags?.includes(this.filterTag));
    this.filteredIncome.set(incomeForRange);
    this.incomeGross.set(incomeForRange.reduce((s, t) => s + t.amount, 0));
    this.pendingIncomeAmount.set(incomeForRange.reduce((s, t) => s + pendingRemaining(t), 0));
    this.incomeReinvested.set(
      incomeForRange.reduce((s, t) => s + (t.distributions || [])
        .filter(d => d.uid === 'reinvestment')
        .reduce((ds, d) => ds + d.amount, 0), 0)
    );

    // Tag productivity when a tag is selected
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

    this.buildSegmentCards(txns, incomeForRange);

    // Person investment from filtered data (cached UID lookup + loans)
    const uidToName = this.cachedUidToName;
    const resolveKey = (uid: string | null | undefined, name: string | null | undefined): string => {
      if (uid && uid !== 'other' && uidToName[uid]) return uidToName[uid];
      return normalizeName(name || 'Unknown');
    };
    const investMap: Record<string, PersonTally> = {};
    const ensurePerson = (name: string) => {
      if (!investMap[name]) investMap[name] = { expensesPaid: 0, incomeReceived: 0, holding: 0, loanHolds: 0, loanHoldsDetails: [], loanOwes: 0, loanOwesDetails: [], loanFundedSpend: 0, spentFromHeldCash: 0 };
    };
    let distributedTotal = 0;
    for (const t of txns) {
      const name = resolveKey(t.paidBy, t.paidByName || t.createdByName);
      ensurePerson(name);
      const settled = settledPortion(t);
      investMap[name].expensesPaid += settled;
      // Spending drawn from a loan this person holds is farm money, not their own capital.
      if (t.linkedLoanId) investMap[name].loanFundedSpend += settled;
    }
    for (const t of incomeForRange) {
      // Total of ALL distributions (including reinvestment) = money that's been allocated
      const totalAllocated = (t.distributions || []).reduce((s, d) => s + d.amount, 0);
      // Only person distributions count as income received (not reinvestment)
      for (const d of (t.distributions || [])) {
        if (d.uid === 'reinvestment') continue;
        const dName = resolveKey(d.uid, d.name);
        ensurePerson(dName);
        investMap[dName].incomeReceived += d.amount;
        distributedTotal += d.amount;
      }
      // Undistributed = income − everything allocated. Pending (unreceived) income
      // is not money in hand — it belongs in Dues, not here.
      const receiver = resolveKey(t.paidBy, t.paidByName || t.createdByName);
      const undistributed = t.amount - totalAllocated;
      if (undistributed > 0 && t.paymentStatus !== 'pending') {
        ensurePerson(receiver);
        investMap[receiver].holding += undistributed;
      }
    }
    // Loan tracking — separate "holds" (custody) from "owes" (personal debt)
    try {
      for (const loan of this.cachedLoans) {
        // Personal withdrawals = OWES (person took money for personal use, must return)
        if (loan.parentFormalLoanId && loan.balanceRemaining > 0) {
          const name = resolveKey(loan.personUid, loan.personName);
          ensurePerson(name);
          investMap[name].loanOwes += loan.balanceRemaining;
          investMap[name].loanOwesDetails.push({ loanId: loan.id, label: loan.purpose || 'Personal use', amount: loan.balanceRemaining });
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
            investMap[aName].loanHolds += bal;
            investMap[aName].loanHoldsDetails.push({ loanId: loan.id, label: `Advance · ${label}`, amount: bal });
          }
          // The named holder keeps whatever unused funds are not advanced out
          const holderShare = (loan.utilizationRemaining ?? 0) - advancedOut;
          if (loan.heldByName && holderShare > 0) {
            const name = resolveKey(loan.heldByUid, loan.heldByName);
            ensurePerson(name);
            investMap[name].loanHolds += holderShare;
            investMap[name].loanHoldsDetails.push({ loanId: loan.id, label, amount: holderShare });
          }
        }
      }
    } catch {}

    this.totalIncomeAmount.set(distributedTotal);
    this.netProfit.set(this.incomeGross() - this.expenseGross());

    let summaryEntries = Object.entries(investMap);
    if (this.filterPaidBy) {
      summaryEntries = summaryEntries.filter(([name]) => name === this.filterPaidBy);
    }
    const summary = summaryEntries
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

  /** Gross income / expense per segment plus sale quantities grouped by unit. */
  private buildSegmentCards(expenseTxns: Transaction[], incomeTxns: Transaction[]): void {
    const cards = new Map<string, { name: string; income: number; expense: number; sales: Transaction[] }>();
    const ensure = (t: Transaction) => {
      let c = cards.get(t.segment);
      if (!c) {
        c = { name: t.segmentName, income: 0, expense: 0, sales: [] };
        cards.set(t.segment, c);
      }
      return c;
    };
    for (const t of expenseTxns) ensure(t).expense += t.amount;
    for (const t of incomeTxns) {
      const c = ensure(t);
      c.income += t.amount;
      c.sales.push(t);
    }
    const segs = this.segments();
    this.segmentCards.set(
      [...cards.entries()]
        .map(([segment, c]) => {
          const seg = segs.find(s => s.id === segment);
          return {
            segment,
            name: seg?.name || c.name,
            icon: seg?.icon || '',
            income: c.income,
            expense: c.expense,
            soldQty: quantityByUnit(c.sales),
          };
        })
        .sort((a, b) => b.income - a.income || a.name.localeCompare(b.name))
    );
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
}
