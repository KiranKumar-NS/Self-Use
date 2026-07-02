import { Component, inject, signal, OnInit } from '@angular/core';
import { SummaryService } from '../../../core/services/summary.service';
import { UserService } from '../../../core/services/user.service';
import { LoanService } from '../../../core/services/loan.service';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { getMonthName, getLast6MonthsFrom, getMonthRange } from '../../../core/utils/date.utils';
import { SummaryCardsComponent } from '../summary-cards/summary-cards.component';
import { SegmentBreakdownChartComponent } from '../segment-breakdown-chart/segment-breakdown-chart.component';
import { MonthlyTrendChartComponent } from '../monthly-trend-chart/monthly-trend-chart.component';
import { LoanSummaryWidgetComponent } from '../loan-summary-widget/loan-summary-widget.component';
import { BudgetWidgetComponent } from '../budget-widget/budget-widget.component';
import { StockWidgetComponent } from '../stock-widget/stock-widget.component';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { DateRangeFilterComponent, DateRangeSelection } from '../../../shared/components/date-range-filter/date-range-filter.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    SummaryCardsComponent, SegmentBreakdownChartComponent, MonthlyTrendChartComponent,
    LoanSummaryWidgetComponent, BudgetWidgetComponent, StockWidgetComponent,
    LoadingSpinnerComponent, DateRangeFilterComponent,
  ],
  template: `
    @if (initialLoading()) {
      <app-loading-spinner />
    } @else {
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
      </div>

      <app-date-range-filter (rangeChange)="onRangeChange($event)" />

      @if (loading()) {
        <app-loading-spinner />
      } @else {
        <app-summary-cards
          [totalIncome]="totals().totalIncome"
          [totalExpense]="totals().totalExpense"
          [netProfit]="totals().netProfit"
          [totalDistributed]="totalDistributed()"
          [pendingIncome]="totals().pendingIncome"
        />

        <div class="charts-grid">
          <app-segment-breakdown-chart [summaries]="currentMonthSummaries()" [personBreakdown]="personBreakdown()" />
          <app-monthly-trend-chart [trendData]="trendData()" [chartTitle]="trendTitle()" />
        </div>

        <div class="widgets-grid">
          @if (currentMode === 'monthly') {
            <app-budget-widget [segments]="segments()" [summaries]="currentMonthSummaries()" />
          }
          <app-stock-widget [segments]="segments()" />
        </div>

        <app-loan-summary-widget
            [totalGiven]="loanSummary().totalGiven"
            [totalReceived]="loanSummary().totalReceived"
            [pendingGiven]="loanSummary().pendingGiven"
            [pendingReceived]="loanSummary().pendingReceived" />
      }
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-title { margin: 0; font-size: var(--font-2xl); color: var(--color-text); }
    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1.5rem 0; }
    .widgets-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .charts-grid { grid-template-columns: 1fr; }
      .widgets-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class DashboardPageComponent implements OnInit {
  private summaryService = inject(SummaryService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  private loanService = inject(LoanService);

  initialLoading = signal(true);
  loading = signal(false);
  currentMode: 'monthly' | 'custom' | 'alltime' = 'monthly';
  trendTitle = signal('Monthly Trend (Last 6 Months)');
  currentMonthSummaries = signal<MonthlySummary[]>([]);
  totals = signal({ totalIncome: 0, totalExpense: 0, netProfit: 0, pendingIncome: 0 });
  personBreakdown = signal<Record<string, Record<string, { income: number; expense: number }>>>({});
  loanSummary = signal({ totalGiven: 0, totalReceived: 0, pendingGiven: 0, pendingReceived: 0 });
  totalDistributed = signal(0);
  segments = signal<Segment[]>([]);
  trendData = signal<{ month: string; income: number; expense: number }[]>([]);

  private nameMap: Record<string, string> = {};
  private initialized = false;
  private pendingSelection: DateRangeSelection | null = null;

  async ngOnInit(): Promise<void> {
    const [users, loans, segs] = await Promise.all([
      this.userService.getAll(),
      this.loanService.getSummary(),
      this.segmentService.getAll(),
    ]);
    this.segments.set(segs);
    for (const u of users) this.nameMap[u.uid] = u.displayName;
    this.loanSummary.set(loans);
    this.initialized = true;
    this.initialLoading.set(false);

    // Load data from the selection that arrived before init
    if (this.pendingSelection) {
      await this.onRangeChange(this.pendingSelection);
      this.pendingSelection = null;
    }
  }

  async onRangeChange(selection: DateRangeSelection): Promise<void> {
    if (!this.initialized) {
      this.pendingSelection = selection;
      return;
    }
    this.loading.set(true);
    this.currentMode = selection.mode;

    let summaries: MonthlySummary[];

    if (selection.mode === 'monthly') {
      const month = selection.month!;
      this.trendTitle.set('Monthly Trend (Last 6 Months)');
      const last6 = getLast6MonthsFrom(month);
      const [monthSummaries, trendSummaries] = await Promise.all([
        this.summaryService.getForMonth(month),
        this.summaryService.getForMonths(last6),
      ]);
      summaries = monthSummaries;
      this.buildTrend(last6, trendSummaries);

    } else if (selection.mode === 'custom') {
      const months = getMonthRange(selection.fromMonth!, selection.toMonth!);
      this.trendTitle.set(`Trend (${getMonthName(selection.fromMonth!)} - ${getMonthName(selection.toMonth!)})`);
      summaries = await this.summaryService.getForMonthsBatched(months);
      this.buildTrend(months, summaries);

    } else {
      this.trendTitle.set('All-Time Trend');
      summaries = await this.summaryService.getAll();
      const allMonths = [...new Set(summaries.map(s => s.month))].sort();
      this.buildTrend(allMonths, summaries);
    }

    this.currentMonthSummaries.set(summaries);
    this.totals.set(this.summaryService.aggregateSummaries(summaries));
    this.personBreakdown.set(this.buildPersonBreakdownFromSummaries(summaries));
    this.totalDistributed.set(summaries.reduce((s, sum) => s + (sum.totalDistributed || 0), 0));
    this.loading.set(false);
  }

  private buildTrend(months: string[], summaries: MonthlySummary[]): void {
    const trendMap = new Map<string, { income: number; expense: number }>();
    for (const m of months) trendMap.set(m, { income: 0, expense: 0 });
    for (const s of summaries) {
      const existing = trendMap.get(s.month) || { income: 0, expense: 0 };
      existing.income += s.totalIncome || 0;
      existing.expense += s.totalExpense || 0;
      trendMap.set(s.month, existing);
    }
    this.trendData.set(months.map(m => ({ month: m, ...trendMap.get(m)! })));
  }

  private buildPersonBreakdownFromSummaries(
    summaries: MonthlySummary[],
  ): Record<string, Record<string, { income: number; expense: number }>> {
    const breakdown: Record<string, Record<string, { income: number; expense: number }>> = {};
    for (const s of summaries) {
      if (!breakdown[s.segment]) breakdown[s.segment] = {};
      if (s.expenseByPerson) {
        for (const [uid, amount] of Object.entries(s.expenseByPerson)) {
          const name = this.nameMap[uid] || uid;
          if (!breakdown[s.segment][name]) breakdown[s.segment][name] = { income: 0, expense: 0 };
          breakdown[s.segment][name].expense += amount;
        }
      }
      if (s.incomeByPerson) {
        for (const [uid, amount] of Object.entries(s.incomeByPerson)) {
          const name = this.nameMap[uid] || uid;
          if (!breakdown[s.segment][name]) breakdown[s.segment][name] = { income: 0, expense: 0 };
          breakdown[s.segment][name].income += amount;
        }
      }
    }
    return breakdown;
  }
}
