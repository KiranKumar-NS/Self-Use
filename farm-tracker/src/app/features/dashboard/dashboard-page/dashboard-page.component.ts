import { Component, inject, signal, OnInit } from '@angular/core';
import { SummaryService } from '../../../core/services/summary.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { LoanService } from '../../../core/services/loan.service';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { Transaction } from '../../../core/models/transaction.model';
import { getMonthString, getLast6Months } from '../../../core/utils/date.utils';
import { SummaryCardsComponent } from '../summary-cards/summary-cards.component';
import { SegmentBreakdownChartComponent } from '../segment-breakdown-chart/segment-breakdown-chart.component';
import { MonthlyTrendChartComponent } from '../monthly-trend-chart/monthly-trend-chart.component';
import { LoanSummaryWidgetComponent } from '../loan-summary-widget/loan-summary-widget.component';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    SummaryCardsComponent, SegmentBreakdownChartComponent, MonthlyTrendChartComponent,
    LoanSummaryWidgetComponent, LoadingSpinnerComponent,
  ],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <h1 class="page-title">Dashboard</h1>

      <app-summary-cards
        [totalIncome]="totals().totalIncome"
        [totalExpense]="totals().totalExpense"
        [netProfit]="totals().netProfit"
      />

      <div class="charts-grid">
        <app-segment-breakdown-chart [summaries]="currentMonthSummaries()" [personBreakdown]="personBreakdown()" />
        <app-monthly-trend-chart [trendData]="trendData()" />
      </div>

      <app-loan-summary-widget
          [totalGiven]="loanSummary().totalGiven"
          [totalReceived]="loanSummary().totalReceived"
          [pendingGiven]="loanSummary().pendingGiven"
          [pendingReceived]="loanSummary().pendingReceived" />
    }
  `,
  styles: [`
    .page-title { margin: 0 0 1.5rem; font-size: 1.5rem; color: #1e293b; }
    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin: 1.5rem 0; }
    @media (max-width: 768px) {
      .charts-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class DashboardPageComponent implements OnInit {
  private summaryService = inject(SummaryService);
  private transactionService = inject(TransactionService);
  private loanService = inject(LoanService);

  loading = signal(true);
  currentMonthSummaries = signal<MonthlySummary[]>([]);
  totals = signal({ totalIncome: 0, totalExpense: 0, netProfit: 0 });
  personBreakdown = signal<Record<string, Record<string, { income: number; expense: number }>>>({});
  loanSummary = signal({ totalGiven: 0, totalReceived: 0, pendingGiven: 0, pendingReceived: 0 });
  trendData = signal<{ month: string; income: number; expense: number }[]>([]);

  async ngOnInit(): Promise<void> {
    const currentMonth = getMonthString(new Date());
    const last6 = getLast6Months();

    const [summaries, loans, trendSummaries, txnResult] = await Promise.all([
      this.summaryService.getForMonth(currentMonth),
      this.loanService.getSummary(),
      this.summaryService.getForMonths(last6),
      this.transactionService.getAll({ month: currentMonth }, 500),
    ]);

    this.currentMonthSummaries.set(summaries);
    this.totals.set(this.summaryService.aggregateSummaries(summaries));
    this.loanSummary.set(loans);
    this.personBreakdown.set(this.buildPersonBreakdown(txnResult.transactions));

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

  private buildPersonBreakdown(transactions: Transaction[]): Record<string, Record<string, { income: number; expense: number }>> {
    // { segmentName: { personName: { income, expense } } }
    const breakdown: Record<string, Record<string, { income: number; expense: number }>> = {};
    for (const txn of transactions) {
      const seg = txn.segment;
      const person = txn.paidByName || txn.createdByName || 'Unknown';
      if (!breakdown[seg]) breakdown[seg] = {};
      if (!breakdown[seg][person]) breakdown[seg][person] = { income: 0, expense: 0 };
      if (txn.type === 'income') {
        breakdown[seg][person].income += txn.amount;
      } else {
        breakdown[seg][person].expense += txn.amount;
      }
    }
    return breakdown;
  }
}
