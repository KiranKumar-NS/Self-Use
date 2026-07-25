import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit, ViewChild } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { SummaryService } from '../../../core/services/summary.service';
import { UserService } from '../../../core/services/user.service';
import { LoanService } from '../../../core/services/loan.service';
import { BackupService } from '../../../core/services/backup.service';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { getMonthName, getLast6MonthsFrom, getMonthRange } from '../../../core/utils/date.utils';
import { safeLoad } from '../../../core/utils/async.utils';
import { ToastService } from '../../../core/services/toast.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { SegmentBreakdownChartComponent } from '../segment-breakdown-chart/segment-breakdown-chart.component';
import { MonthlyTrendChartComponent } from '../monthly-trend-chart/monthly-trend-chart.component';
import { LoanSummaryWidgetComponent } from '../loan-summary-widget/loan-summary-widget.component';
import { BudgetWidgetComponent } from '../budget-widget/budget-widget.component';
import { StockWidgetComponent } from '../stock-widget/stock-widget.component';
import { AnalyticsTabComponent } from '../analytics-tab/analytics-tab.component';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { DateRangeFilterComponent, DateRangeSelection } from '../../../shared/components/date-range-filter/date-range-filter.component';
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SegmentBreakdownChartComponent, MonthlyTrendChartComponent,
    LoanSummaryWidgetComponent, BudgetWidgetComponent, StockWidgetComponent,
    AnalyticsTabComponent,
    LoadingSpinnerComponent, LoadingSkeletonComponent, DateRangeFilterComponent,
    MatIconModule, MatButtonModule,
  ],
  template: `
    @if (initialLoading()) {
      <app-loading-skeleton type="cards" [count]="6" />
      <div class="charts-grid">
        <app-loading-skeleton type="chart" />
        <app-loading-skeleton type="chart" />
      </div>
    } @else {
      <div class="page-header">
        <h1 class="page-title">Dashboard</h1>
        @if (!auth.isViewer() && !noSegmentAccess()) {
          <div class="header-actions">
            <button mat-icon-button (click)="exportExcel()" [disabled]="exporting()" aria-label="Export Excel backup">
              <mat-icon>download</mat-icon>
            </button>
            <button mat-icon-button (click)="exportPdf()" aria-label="Export PDF report">
              <mat-icon>picture_as_pdf</mat-icon>
            </button>
            <button mat-icon-button class="wa-share-btn" (click)="shareWhatsApp()" aria-label="Share on WhatsApp">
              <mat-icon>share</mat-icon>
            </button>
          </div>
        }
      </div>

      @if (noSegmentAccess()) {
        <div class="no-access-notice">
          <mat-icon>lock</mat-icon>
          <p>No segments assigned to your account. Contact an admin to get access.</p>
        </div>
      } @else {

      <app-date-range-filter (rangeChange)="onRangeChange($event)" />

      @if (loading()) {
        <app-loading-spinner />
      } @else {
        <app-stock-widget [segments]="segments()" />

        <div class="charts-grid hide-mobile">
          <app-segment-breakdown-chart [summaries]="currentMonthSummaries()" [personBreakdown]="personBreakdown()" />
          <app-monthly-trend-chart [trendData]="trendData()" [chartTitle]="trendTitle()" />
        </div>

        @if (currentMode() === 'monthly' || hasLoanData()) {
          <div class="widgets-row">
            @if (currentMode() === 'monthly') {
              <app-budget-widget [segments]="segments()" [summaries]="currentMonthSummaries()" />
            }
            @if (hasLoanData()) {
              <app-loan-summary-widget
                  [unusedInHand]="loanSummary().unusedInHand"
                  [pendingGiven]="loanSummary().pendingGiven"
                  [pendingReceived]="loanSummary().pendingReceived"
                  [totalSanctioned]="loanSummary().totalSanctioned"
                  [totalOutstanding]="loanSummary().totalOutstanding"
                  [upcomingEMICount]="loanSummary().upcomingEMICount"
                  [upcomingEMIAmount]="loanSummary().upcomingEMIAmount"
                  [totalInterestPaid]="loanSummary().totalInterestPaid" />
            }
          </div>
        }

        <hr class="section-divider" />

        <app-analytics-tab [dateSelection]="currentSelection()!" />
      }

      }
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-title { margin: 0; font-size: var(--font-2xl); color: var(--color-text); }
    .header-actions { display: flex; gap: 0.25rem; }
    .wa-share-btn { color: #25D366 !important; }
    :host app-stock-widget,
    :host app-recent-transactions { display: block; margin-bottom: 1rem; }
    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .widgets-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 1rem; margin-bottom: 1rem; }
    .section-divider { border: none; border-top: 1px solid var(--color-border); margin: 1.5rem 0; }
    .no-access-notice {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 1.25rem; border: 1px solid var(--color-border); border-radius: 12px;
      background: var(--color-surface); color: var(--color-text-secondary);
    }
    .no-access-notice mat-icon { flex-shrink: 0; }
    .no-access-notice p { margin: 0; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .charts-grid { grid-template-columns: 1fr; }
      .widgets-row { grid-template-columns: 1fr; }
      .hide-mobile { display: none; }
    }
  `],
})
export class DashboardPageComponent implements OnInit {
  @ViewChild(AnalyticsTabComponent) analyticsTab!: AnalyticsTabComponent;

  auth = inject(AuthService);
  private summaryService = inject(SummaryService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  private loanService = inject(LoanService);
  private backupService = inject(BackupService);
  private toast = inject(ToastService);

  exporting = signal(false);
  initialLoading = signal(true);
  loading = signal(false);
  currentMode = signal<'monthly' | 'custom' | 'alltime'>('monthly');
  currentSelection = signal<DateRangeSelection | null>(null);
  trendTitle = signal('Monthly Trend (Last 6 Months)');
  currentMonthSummaries = signal<MonthlySummary[]>([]);
  personBreakdown = signal<Record<string, Record<string, { income: number; expense: number }>>>({});
  loanSummary = signal({ totalGiven: 0, totalReceived: 0, pendingGiven: 0, pendingReceived: 0, totalSanctioned: 0, totalOutstanding: 0, upcomingEMICount: 0, upcomingEMIAmount: 0, totalInterestPaid: 0, unusedInHand: 0 });
  hasLoanData = computed(() => Object.values(this.loanSummary()).some(v => v > 0));
  noSegmentAccess = computed(() => this.auth.isSegmentRestricted() && this.auth.assignedSegments().length === 0);
  segments = signal<Segment[]>([]);
  trendData = signal<{ month: string; income: number; expense: number }[]>([]);

  private nameMap: Record<string, string> = {};
  private initialized = false;
  private pendingSelection: DateRangeSelection | null = null;

  async ngOnInit(): Promise<void> {
    await safeLoad(this.initialLoading, async () => {
      const [users, loans, segs] = await Promise.all([
        this.userService.getAll(),
        this.loanService.getSummary(),
        this.segmentService.getAll(),
      ]);
      this.segments.set(segs);
      for (const u of users) this.nameMap[u.uid] = u.displayName;
      this.loanSummary.set(loans);
      this.initialized = true;
    }, this.toast);

    // Load data from the selection that arrived before init
    if (this.initialized && this.pendingSelection) {
      await this.onRangeChange(this.pendingSelection);
      this.pendingSelection = null;
    }
  }

  async onRangeChange(selection: DateRangeSelection): Promise<void> {
    if (!this.initialized) {
      this.pendingSelection = selection;
      return;
    }
    this.currentMode.set(selection.mode);
    this.currentSelection.set(selection);

    await safeLoad(this.loading, async () => {
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
      this.personBreakdown.set(this.buildPersonBreakdownFromSummaries(summaries));
    }, this.toast);
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

  async exportExcel(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.toast.info('Preparing full backup — fetching all data…');
    try {
      const { ExportService } = await import('../../../core/services/export.service');
      const data = await this.backupService.collectFullBackup();
      await new ExportService().exportBackupExcel(data);
      const txnCount = data.expenses.length + data.income.length;
      this.toast.success(`Backup exported: ${txnCount} transactions, ${data.loans.length} loans, ${data.animals.length} animals`);
    } catch (err) {
      console.error('[exportExcel]', err);
      this.toast.error('Failed to export Excel backup. Check your connection and try again.');
    } finally {
      this.exporting.set(false);
    }
  }

  async exportPdf(): Promise<void> {
    try {
      if (this.analyticsTab) {
        await this.analyticsTab.exportPdf();
      }
    } catch (err) {
      console.error('[exportPdf]', err);
      this.toast.error('Failed to export PDF report. Check your connection and try again.');
    }
  }

  shareWhatsApp(): void {
    if (this.analyticsTab) {
      this.analyticsTab.shareWhatsApp();
    }
  }
}
