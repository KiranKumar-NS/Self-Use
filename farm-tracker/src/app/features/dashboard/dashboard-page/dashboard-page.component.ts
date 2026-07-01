import { Component, inject, signal, OnInit } from '@angular/core';
import { SummaryService } from '../../../core/services/summary.service';
import { UserService } from '../../../core/services/user.service';
import { LoanService } from '../../../core/services/loan.service';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { getMonthString, getMonthName, getLast6MonthsFrom, shiftMonth } from '../../../core/utils/date.utils';
import { SummaryCardsComponent } from '../summary-cards/summary-cards.component';
import { SegmentBreakdownChartComponent } from '../segment-breakdown-chart/segment-breakdown-chart.component';
import { MonthlyTrendChartComponent } from '../monthly-trend-chart/monthly-trend-chart.component';
import { LoanSummaryWidgetComponent } from '../loan-summary-widget/loan-summary-widget.component';
import { BudgetWidgetComponent } from '../budget-widget/budget-widget.component';
import { StockWidgetComponent } from '../stock-widget/stock-widget.component';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    SummaryCardsComponent, SegmentBreakdownChartComponent, MonthlyTrendChartComponent,
    LoanSummaryWidgetComponent, BudgetWidgetComponent, StockWidgetComponent, LoadingSpinnerComponent, MatButtonModule, MatIconModule,
  ],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        <div class="month-picker">
          <button mat-icon-button (click)="prevMonth()" aria-label="Previous month"><mat-icon>chevron_left</mat-icon></button>
          <span class="month-label">{{ monthLabel() }}</span>
          <button mat-icon-button (click)="nextMonth()" [disabled]="isCurrentMonth()" aria-label="Next month"><mat-icon>chevron_right</mat-icon></button>
          @if (!isCurrentMonth()) {
            <button mat-button class="today-btn" (click)="goToCurrentMonth()">Today</button>
          }
        </div>
      </div>

      <app-summary-cards
        [totalIncome]="totals().totalIncome"
        [totalExpense]="totals().totalExpense"
        [netProfit]="totals().netProfit"
        [totalDistributed]="totalDistributed()"
        [pendingIncome]="totals().pendingIncome"
      />

      <div class="charts-grid">
        <app-segment-breakdown-chart [summaries]="currentMonthSummaries()" [personBreakdown]="personBreakdown()" />
        <app-monthly-trend-chart [trendData]="trendData()" />
      </div>

      <div class="widgets-grid">
        <app-budget-widget [segments]="segments()" [summaries]="currentMonthSummaries()" />
        <app-stock-widget [segments]="segments()" />
      </div>

      <app-loan-summary-widget
          [totalGiven]="loanSummary().totalGiven"
          [totalReceived]="loanSummary().totalReceived"
          [pendingGiven]="loanSummary().pendingGiven"
          [pendingReceived]="loanSummary().pendingReceived" />
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .page-title { margin: 0; font-size: var(--font-2xl); color: var(--color-text); }
    .month-picker { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .month-label { font-size: var(--font-lg); font-weight: 600; color: var(--color-text); min-width: 140px; text-align: center; }
    .today-btn { font-size: 0.8rem; color: var(--color-primary); }
    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1.5rem 0; }
    .widgets-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .charts-grid { grid-template-columns: 1fr; }
      .widgets-grid { grid-template-columns: 1fr; }
      .month-label { min-width: 100px; font-size: 0.9rem; }
      .today-btn { width: auto; font-size: 0.75rem; padding: 0 8px; }
    }
  `],
})
export class DashboardPageComponent implements OnInit {
  private summaryService = inject(SummaryService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  private loanService = inject(LoanService);

  selectedMonth = signal(getMonthString(new Date()));
  monthLabel = signal('');
  loading = signal(true);
  currentMonthSummaries = signal<MonthlySummary[]>([]);
  totals = signal({ totalIncome: 0, totalExpense: 0, netProfit: 0, pendingIncome: 0 });
  personBreakdown = signal<Record<string, Record<string, { income: number; expense: number }>>>({});
  loanSummary = signal({ totalGiven: 0, totalReceived: 0, pendingGiven: 0, pendingReceived: 0 });
  totalDistributed = signal(0);
  segments = signal<Segment[]>([]);
  trendData = signal<{ month: string; income: number; expense: number }[]>([]);

  private nameMap: Record<string, string> = {};

  async ngOnInit(): Promise<void> {
    // Load users + segments (cached) and loans (month-agnostic)
    const [users, loans, segs] = await Promise.all([
      this.userService.getAll(),
      this.loanService.getSummary(),
      this.segmentService.getAll(),
    ]);
    this.segments.set(segs);
    for (const u of users) this.nameMap[u.uid] = u.displayName;
    this.loanSummary.set(loans);

    await this.loadMonth();
  }

  async loadMonth(): Promise<void> {
    this.loading.set(true);
    const month = this.selectedMonth();
    this.monthLabel.set(getMonthName(month));

    const last6 = getLast6MonthsFrom(month);
    const [summaries, trendSummaries] = await Promise.all([
      this.summaryService.getForMonth(month),
      this.summaryService.getForMonths(last6),
    ]);

    this.currentMonthSummaries.set(summaries);
    this.totals.set(this.summaryService.aggregateSummaries(summaries));
    this.personBreakdown.set(this.buildPersonBreakdownFromSummaries(summaries));
    this.totalDistributed.set(summaries.reduce((s, sum) => s + (sum.totalDistributed || 0), 0));

    // Build trend data
    const trendMap = new Map<string, { income: number; expense: number }>();
    for (const m of last6) trendMap.set(m, { income: 0, expense: 0 });
    for (const s of trendSummaries) {
      const existing = trendMap.get(s.month) || { income: 0, expense: 0 };
      existing.income += s.totalIncome || 0;
      existing.expense += s.totalExpense || 0;
      trendMap.set(s.month, existing);
    }
    this.trendData.set(last6.map((m) => ({ month: m, ...trendMap.get(m)! })));

    this.loading.set(false);
  }

  async prevMonth(): Promise<void> {
    this.selectedMonth.set(shiftMonth(this.selectedMonth(), -1));
    await this.loadMonth();
  }

  async nextMonth(): Promise<void> {
    this.selectedMonth.set(shiftMonth(this.selectedMonth(), 1));
    await this.loadMonth();
  }

  async goToCurrentMonth(): Promise<void> {
    this.selectedMonth.set(getMonthString(new Date()));
    await this.loadMonth();
  }

  isCurrentMonth(): boolean {
    return this.selectedMonth() === getMonthString(new Date());
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
