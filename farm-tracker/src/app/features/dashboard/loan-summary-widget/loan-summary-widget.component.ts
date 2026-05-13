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
  `],
})
export class LoanSummaryWidgetComponent {
  @Input() totalGiven = 0;
  @Input() totalReceived = 0;
  @Input() pendingGiven = 0;
  @Input() pendingReceived = 0;

  constructor(private router: Router) {}
  viewAll(): void { this.router.navigate(['/loans']); }
}
