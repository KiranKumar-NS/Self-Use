import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-loan-summary-widget',
  standalone: true,
  imports: [CurrencyInrPipe, MatCardModule, MatButtonModule],
  template: `
    <mat-card class="loan-card">
      <div class="card-header">
        <h3>Owe & Lent Summary</h3>
        <button mat-button color="primary" (click)="viewAll()">View All</button>
      </div>
      <div class="loan-grid">
        <div class="loan-item">
          <span class="loan-label">Total Lent</span>
          <span class="loan-value given">{{ totalGiven | currencyInr }}</span>
        </div>
        <div class="loan-item">
          <span class="loan-label">Total Owed</span>
          <span class="loan-value received">{{ totalReceived | currencyInr }}</span>
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
    h3 { margin: 0; font-size: 1rem; color: #1e293b; }
    .loan-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .loan-item { display: flex; flex-direction: column; }
    .loan-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
    .loan-value { font-size: 1.25rem; font-weight: 700; }
    .loan-value.given { color: #d97706; }
    .loan-value.received { color: #2563eb; }
    .loan-value.pending { color: #dc2626; }
    .loan-value.formal { color: #7c3aed; }
    .loan-value.upcoming { color: #0284c7; font-size: 1rem; }
    .formal-divider { border-top: 1px solid #e2e8f0; margin: 1rem 0; }
    .formal-header { font-size: 0.8rem; color: #7c3aed; font-weight: 600; text-transform: uppercase; margin-bottom: 0.75rem; }
  `],
})
export class LoanSummaryWidgetComponent {
  @Input() totalGiven = 0;
  @Input() totalReceived = 0;
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
