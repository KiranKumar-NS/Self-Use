import { Component, Input, OnChanges } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-segment-breakdown-chart',
  standalone: true,
  imports: [BaseChartDirective, MatCardModule],
  template: `
    <mat-card class="chart-card">
      <h3>Income vs Expense by Segment</h3>
      <canvas baseChart
        [datasets]="chartData.datasets"
        [labels]="chartData.labels"
        [options]="chartOptions"
        type="bar"></canvas>
    </mat-card>
  `,
  styles: [`
    .chart-card { padding: 1.5rem; }
    h3 { margin: 0 0 1rem; font-size: 1rem; color: #1e293b; }
  `],
})
export class SegmentBreakdownChartComponent implements OnChanges {
  @Input() summaries: MonthlySummary[] = [];

  chartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: { legend: { position: 'top' } },
    scales: { y: { beginAtZero: true } },
  };

  ngOnChanges(): void {
    this.chartData = {
      labels: this.summaries.map((s) => s.segment),
      datasets: [
        {
          label: 'Income',
          data: this.summaries.map((s) => s.totalIncome || 0),
          backgroundColor: '#4ade80',
        },
        {
          label: 'Expense',
          data: this.summaries.map((s) => s.totalExpense || 0),
          backgroundColor: '#f87171',
        },
      ],
    };
  }
}
