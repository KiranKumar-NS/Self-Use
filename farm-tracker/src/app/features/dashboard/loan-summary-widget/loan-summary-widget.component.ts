import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-loan-summary-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyInrPipe, MatCardModule, MatButtonModule],
  template: `
    <mat-card class="loan-card">
      <div class="card-header">
        <h3>Owe & Lent Summary</h3>
        <button mat-button color="primary" (click)="viewAll()">View All</button>
      </div>
      <div class="loan-grid">
        <div class="loan-item span-all">
          <span class="loan-label">Unused (In Hand)</span>
          <span class="loan-value inhand">{{ unusedInHand | currencyInr }}</span>
        </div>
        <div class="loan-item">
          <span class="loan-label">Pending (Lent)</span>
          <span class="loan-value pending">{{ pendingGiven | currencyInr }}</span>
        </div>
        <div class="loan-item">
          <span class="loan-label">Pending (Owed)</span>
          <span class="loan-value pending">{{ pendingReceived | currencyInr }}</span>
        </div>
      </div>

      @if (totalSanctioned > 0) {
        <div class="formal-divider"></div>
        <div class="formal-header">Formal Loans</div>
        <div class="loan-grid">
          <div class="loan-item">
            <span class="loan-label">Total Sanctioned</span>
            <span class="loan-value formal">{{ totalSanctioned | currencyInr }}</span>
          </div>
          <div class="loan-item">
            <span class="loan-label">Total Outstanding</span>
            <span class="loan-value pending">{{ totalOutstanding | currencyInr }}</span>
          </div>
          <div class="loan-item">
            <span class="loan-label">Upcoming EMIs</span>
            <span class="loan-value upcoming">{{ upcomingEMICount }} ({{ upcomingEMIAmount | currencyInr }})</span>
          </div>
          <div class="loan-item">
            <span class="loan-label">Interest Paid</span>
            <span class="loan-value">{{ totalInterestPaid | currencyInr }}</span>
          </div>
        </div>
      }
    </mat-card>
  `,
  styles: [`
    .loan-card { padding: 1.5rem; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    h3 { margin: 0; font-size: 1rem; color: var(--color-text); }
    .loan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .loan-item { display: flex; flex-direction: column; }
    .loan-label { font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; }
    .loan-value { font-size: 1.25rem; font-weight: 700; }
    .loan-item.span-all { grid-column: 1 / -1; }
    .loan-value.inhand { color: var(--color-income); }
    .loan-value.pending { color: var(--color-danger); }
    .loan-value.formal { color: var(--color-purple); }
    .loan-value.upcoming { color: var(--color-info); font-size: 1rem; }
    .formal-divider { border-top: 1px solid var(--color-border); margin: 1rem 0; }
    .formal-header { font-size: 0.8rem; color: var(--color-purple); font-weight: 600; text-transform: uppercase; margin-bottom: 0.75rem; }
    @media (max-width: 480px) {
      .loan-card { padding: 1rem; }
      .loan-grid { gap: 0.75rem; }
      .loan-value { font-size: 1rem; }
      .loan-value.upcoming { font-size: 0.85rem; }
    }
  `],
})
export class LoanSummaryWidgetComponent {
  @Input() unusedInHand = 0;
  @Input() pendingGiven = 0;
  @Input() pendingReceived = 0;

  // Formal loan metrics
  @Input() totalSanctioned = 0;
  @Input() totalOutstanding = 0;
  @Input() upcomingEMICount = 0;
  @Input() upcomingEMIAmount = 0;
  @Input() totalInterestPaid = 0;

  constructor(private router: Router) {}
  viewAll(): void { this.router.navigate(['/loans']); }
}
