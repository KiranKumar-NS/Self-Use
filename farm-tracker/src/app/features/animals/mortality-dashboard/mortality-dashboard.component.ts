import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { MortalityService, MortalityStats } from '../../../core/services/mortality.service';
import { ToastService } from '../../../core/services/toast.service';
import { safeLoad } from '../../../core/utils/async.utils';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';

@Component({
  selector: 'app-mortality-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyInrPipe, LoadingSpinnerComponent, BaseChartDirective, MatCardModule, MatIconModule, MatButtonModule],
  template: `
    <div class="page-header">
      <div>
        <h1>Mortality Analysis</h1>
        <p class="subtitle">Death statistics and loss tracking</p>
      </div>
      <button mat-button (click)="back()">Back to Stock</button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (stats()) {
      <!-- Summary Cards -->
      <div class="summary-grid">
        <mat-card class="stat-card">
          <div class="stat-icon danger"><mat-icon>heart_broken</mat-icon></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats()!.totalDeaths }}</span>
            <span class="stat-label">Total Deaths</span>
          </div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-icon warning"><mat-icon>percent</mat-icon></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats()!.mortalityRate }}%</span>
            <span class="stat-label">Mortality Rate</span>
          </div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-icon expense"><mat-icon>trending_down</mat-icon></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats()!.estimatedLoss | currencyInr }}</span>
            <span class="stat-label">Estimated Loss</span>
          </div>
        </mat-card>

        <mat-card class="stat-card">
          <div class="stat-icon info"><mat-icon>calendar_today</mat-icon></div>
          <div class="stat-info">
            <span class="stat-value">{{ stats()!.averageAgeAtDeathDays }} days</span>
            <span class="stat-label">Avg Age at Death</span>
          </div>
        </mat-card>
      </div>

      <!-- By Segment -->
      <h3 class="section-title">By Segment</h3>
      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>Segment</th><th>Total</th><th>Deaths</th><th>Rate</th></tr></thead>
            <tbody>
              @for (seg of stats()!.bySegment; track seg.segment) {
                <tr>
                  <td><strong>{{ seg.segmentName }}</strong></td>
                  <td>{{ seg.total }}</td>
                  <td class="death-cell">{{ seg.deaths }}</td>
                  <td [class.danger-text]="seg.rate > 10">{{ seg.rate }}%</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </mat-card>

      <!-- By Cause -->
      @if (stats()!.byCause.length > 0) {
        <h3 class="section-title">By Cause</h3>
        <mat-card>
          <mat-card-content>
            @if (causeChartData()) {
              <div class="chart-container">
                <canvas baseChart [data]="causeChartData()!" [options]="pieOptions" type="doughnut"></canvas>
              </div>
            }
            <div class="cause-list">
              @for (c of stats()!.byCause; track c.cause) {
                <div class="cause-item">
                  <span class="cause-name">{{ c.cause }}</span>
                  <span class="cause-count">{{ c.count }}</span>
                </div>
              }
            </div>
          </mat-card-content>
        </mat-card>
      }

      <!-- Monthly Trend -->
      @if (stats()!.monthlyTrend.length > 1) {
        <h3 class="section-title">Monthly Trend</h3>
        <mat-card>
          <mat-card-content>
            <div class="chart-container">
              <canvas baseChart [data]="trendChartData()!" [options]="barOptions" type="bar"></canvas>
            </div>
          </mat-card-content>
        </mat-card>
      }
    }
  `,
  styles: [`
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 1.5rem; }
    .stat-card { display: flex; align-items: center; gap: 16px; padding: 1.25rem; }
    .stat-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .stat-icon.danger { background: var(--color-expense-bg); color: var(--color-danger); }
    .stat-icon.warning { background: #FFF3E0; color: #E65100; }
    .stat-icon.expense { background: var(--color-expense-bg); color: var(--color-expense); }
    .stat-icon.info { background: var(--color-info-light); color: var(--color-info); }
    .stat-value { font-size: 1.5rem; font-weight: 700; display: block; }
    .stat-label { font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; }
    .section-title { margin: 1.5rem 0 0.5rem; }
    .death-cell { color: var(--color-danger); font-weight: 700; }
    .danger-text { color: var(--color-danger); font-weight: 600; }
    .chart-container { height: 250px; position: relative; }
    .cause-list { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .cause-item { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--color-bg); border-radius: 20px; font-size: var(--font-sm); }
    .cause-name { text-transform: capitalize; }
    .cause-count { font-weight: 700; color: var(--color-danger); }
  `],
})
export class MortalityDashboardComponent implements OnInit {
  private mortalityService = inject(MortalityService);
  private router = inject(Router);
  private toast = inject(ToastService);

  stats = signal<MortalityStats | null>(null);
  loading = signal(true);

  pieOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'right' } },
  };

  barOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, title: { display: true, text: 'Deaths' } } },
  };

  async ngOnInit(): Promise<void> {
    await safeLoad(this.loading, async () => {
      this.stats.set(await this.mortalityService.getMortalityStats());
    }, this.toast);
  }

  causeChartData(): ChartConfiguration<'doughnut'>['data'] | null {
    const s = this.stats();
    if (!s || s.byCause.length === 0) return null;
    return {
      labels: s.byCause.map(c => c.cause),
      datasets: [{ data: s.byCause.map(c => c.count), backgroundColor: ['#EF5350', '#FF7043', '#FFA726', '#66BB6A', '#42A5F5', '#AB47BC'] }],
    };
  }

  trendChartData(): ChartConfiguration<'bar'>['data'] | null {
    const s = this.stats();
    if (!s || s.monthlyTrend.length === 0) return null;
    return {
      labels: s.monthlyTrend.map(m => m.month),
      datasets: [{ data: s.monthlyTrend.map(m => m.deaths), backgroundColor: '#EF5350' }],
    };
  }

  back(): void { this.router.navigate(['/stock']); }
}
