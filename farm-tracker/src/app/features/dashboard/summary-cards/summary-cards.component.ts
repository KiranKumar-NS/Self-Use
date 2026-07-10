import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-summary-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
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

      <mat-card class="summary-card distributed">
        <mat-icon>account_balance_wallet</mat-icon>
        <div class="card-content">
          <span class="label">Distributed</span>
          <span class="value">{{ totalDistributed | currencyInr }}</span>
        </div>
      </mat-card>

      @if (pendingIncome > 0) {
        <mat-card class="summary-card pending">
          <mat-icon>schedule</mat-icon>
          <div class="card-content">
            <span class="label">Pending Income</span>
            <span class="value">{{ pendingIncome | currencyInr }}</span>
          </div>
        </mat-card>
      }

      <mat-card class="summary-card reinvestment">
        <mat-icon>savings</mat-icon>
        <div class="card-content">
          <span class="label">Undistributed</span>
          <span class="value">{{ totalIncome - totalDistributed | currencyInr }}</span>
        </div>
      </mat-card>

    </div>
  `,
  styles: [`
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr)); gap: 1rem; }
    .summary-card {
      display: flex; align-items: center; gap: 1rem; padding: 1.25rem;
      border-left: 4px solid transparent;
    }
    .summary-card mat-icon { font-size: 2rem; width: 2rem; height: 2rem; opacity: 0.8; flex-shrink: 0; }
    .card-content { display: flex; flex-direction: column; min-width: 0; }
    .label { font-size: var(--font-sm); color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600; }
    .value {
      font-size: var(--font-2xl); font-weight: 700;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .income { border-color: var(--color-income); }
    .income .value { color: var(--color-income); }
    .income mat-icon { color: var(--color-income); }
    .expense { border-color: var(--color-expense); }
    .expense .value { color: var(--color-expense); }
    .expense mat-icon { color: var(--color-expense); }
    .profit { border-color: var(--color-income); }
    .profit .value { color: var(--color-income); }
    .profit mat-icon { color: var(--color-income); }
    .loss { border-color: var(--color-expense); }
    .loss .value { color: var(--color-expense); }
    .loss mat-icon { color: var(--color-expense); }
    .distributed { border-color: var(--color-purple); }
    .distributed .value { color: var(--color-purple); }
    .distributed mat-icon { color: var(--color-purple); }
    .reinvestment { border-color: var(--color-cyan); }
    .reinvestment .value { color: var(--color-cyan); }
    .reinvestment mat-icon { color: var(--color-cyan); }
    .pending { border-color: var(--color-warning); }
    .pending .value { color: var(--color-warning); }
    .pending mat-icon { color: var(--color-warning); }
    @media (max-width: 480px) {
      .cards-grid { grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); }
      .summary-card { padding: 1rem; gap: 0.75rem; }
      .value { font-size: 1.2rem; }
      .summary-card mat-icon { font-size: 1.5rem; width: 1.5rem; height: 1.5rem; }
    }
    @media (max-width: 360px) {
      .cards-grid { grid-template-columns: 1fr; gap: 0.5rem; }
      .value { white-space: normal; word-break: break-word; font-size: 1.1rem; }
    }
  `],
})
export class SummaryCardsComponent {
  @Input() totalIncome = 0;
  @Input() totalExpense = 0;
  @Input() netProfit = 0;
  @Input() totalDistributed = 0;
  @Input() pendingIncome = 0;
}
