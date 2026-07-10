import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { MatCardModule } from '@angular/material/card';
import { getMonthName } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-monthly-trend-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective, MatCardModule],
  template: `
    <mat-card class="chart-card">
      <h3>{{ chartTitle }}</h3>
      <canvas baseChart
        [datasets]="chartData.datasets"
        [labels]="chartData.labels"
        [options]="chartOptions"
        type="line"></canvas>
    </mat-card>
  `,
  styles: [`
    .chart-card { padding: 1.5rem; }
    h3 { margin: 0 0 1rem; font-size: 1rem; color: var(--color-text); }
  `],
})
export class MonthlyTrendChartComponent implements OnChanges {
  @Input() trendData: { month: string; income: number; expense: number }[] = [];
  @Input() chartTitle = 'Monthly Trend (Last 6 Months)';

  chartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true } },
  };

  ngOnChanges(): void {
    this.chartData = {
      labels: this.trendData.map((d) => getMonthName(d.month)),
      datasets: [
        {
          label: 'Income',
          data: this.trendData.map((d) => d.income),
          borderColor: '#16a34a',
          backgroundColor: '#bbf7d0',
          fill: false,
          tension: 0.3,
        },
        {
          label: 'Expense',
          data: this.trendData.map((d) => d.expense),
          borderColor: '#dc2626',
          backgroundColor: '#fecaca',
          fill: false,
          tension: 0.3,
        },
      ],
    };
  }
}
