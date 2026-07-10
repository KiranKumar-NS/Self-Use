import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, TooltipItem } from 'chart.js';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { MatCardModule } from '@angular/material/card';
import { formatCurrency } from '../../../core/utils/firestore.utils';

@Component({
  selector: 'app-segment-breakdown-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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
    h3 { margin: 0 0 1rem; font-size: 1rem; color: var(--color-text); }
  `],
})
export class SegmentBreakdownChartComponent implements OnChanges {
  @Input() summaries: MonthlySummary[] = [];
  @Input() personBreakdown: Record<string, Record<string, { income: number; expense: number }>> = {};

  chartData: ChartConfiguration<'bar'>['data'] = { labels: [], datasets: [] };
  chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          afterBody: (items: TooltipItem<'bar'>[]) => {
            if (!items.length) return '';
            const item = items[0];
            const segment = item.label;
            const type = item.datasetIndex === 0 ? 'income' : 'expense';
            const persons = this.personBreakdown[segment];
            if (!persons) return '';

            const heading = type === 'expense' ? '── Who spent ──' : '── Who earned ──';
            const lines: string[] = ['', heading];
            for (const [name, data] of Object.entries(persons)) {
              const amount = type === 'income' ? data.income : data.expense;
              if (amount > 0) {
                lines.push(`${name}: ${formatCurrency(amount)}`);
              }
            }
            return lines.length > 2 ? lines : '';
          },
        },
      },
    },
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
