import { Component, Input } from '@angular/core';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-summary-cards',
  standalone: true,
  imports: [CurrencyInrPipe, MatCardModule, MatIconModule],
  template: `
    <div class="cards-grid">
      <mat-card class="summary-card income">
        <mat-icon>trending_up</mat-icon>
        <div class="card-content">
          <span class="label">Total Income</span>
          <span class="value">{{ totalIncome | currencyInr }}</span>
        </div>
      </mat-card>

      <mat-card class="summary-card expense">
        <mat-icon>trending_down</mat-icon>
        <div class="card-content">
          <span class="label">Total Expense</span>
          <span class="value">{{ totalExpense | currencyInr }}</span>
        </div>
      </mat-card>

      <mat-card class="summary-card" [class.profit]="netProfit >= 0" [class.loss]="netProfit < 0">
        <mat-icon>{{ netProfit >= 0 ? 'thumb_up' : 'thumb_down' }}</mat-icon>
        <div class="card-content">
          <span class="label">Net {{ netProfit >= 0 ? 'Profit' : 'Loss' }}</span>
          <span class="value">{{ netProfit | currencyInr }}</span>
        </div>
      </mat-card>

    </div>
  `,
  styles: [`
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
    .summary-card {
      display: flex; align-items: center; gap: 1rem; padding: 1.25rem;
      border-left: 4px solid transparent;
    }
    .summary-card mat-icon { font-size: 2rem; width: 2rem; height: 2rem; opacity: 0.8; }
    .card-content { display: flex; flex-direction: column; }
    .label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .value { font-size: 1.5rem; font-weight: 700; }
    .income { border-color: #16a34a; }
    .income .value { color: #16a34a; }
    .income mat-icon { color: #16a34a; }
    .expense { border-color: #dc2626; }
    .expense .value { color: #dc2626; }
    .expense mat-icon { color: #dc2626; }
    .profit { border-color: #16a34a; }
    .profit .value { color: #16a34a; }
    .profit mat-icon { color: #16a34a; }
    .loss { border-color: #dc2626; }
    .loss .value { color: #dc2626; }
    .loss mat-icon { color: #dc2626; }
  `],
})
export class SummaryCardsComponent {
  @Input() totalIncome = 0;
  @Input() totalExpense = 0;
  @Input() netProfit = 0;
}
