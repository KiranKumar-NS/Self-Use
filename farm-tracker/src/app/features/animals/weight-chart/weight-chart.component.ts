import { Component, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { WeightLogEntry } from '../../../core/models/animal.model';

@Component({
  selector: 'app-weight-chart',
  standalone: true,
  imports: [BaseChartDirective],
  template: `
    @if (chartData()) {
      <div class="chart-container">
        <canvas baseChart
          [data]="chartData()!"
          [options]="chartOptions"
          type="line"></canvas>
      </div>
    }
  `,
  styles: [`
    .chart-container { position: relative; height: 250px; width: 100%; }
  `],
})
export class WeightChartComponent {
  weightLogs = input<WeightLogEntry[]>([]);

  chartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      y: {
        title: { display: true, text: 'Weight (kg)' },
        beginAtZero: false,
      },
    },
  };

  chartData(): ChartConfiguration<'line'>['data'] | null {
    const logs = this.weightLogs();
    if (!logs || logs.length === 0) return null;

    const sorted = [...logs].sort((a, b) => a.date.toDate().getTime() - b.date.toDate().getTime());

    return {
      labels: sorted.map(l => l.date.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })),
      datasets: [{
        data: sorted.map(l => l.weight),
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#4CAF50',
      }],
    };
  }
}
