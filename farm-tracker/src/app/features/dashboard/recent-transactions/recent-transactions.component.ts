import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { Transaction } from '../../../core/models/transaction.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-recent-transactions',
  standalone: true,
  imports: [CurrencyInrPipe, RelativeTimePipe, MatCardModule, MatButtonModule],
  template: `
    <mat-card class="recent-card">
      <div class="card-header">
        <h3>Recent Transactions</h3>
        <button mat-button color="primary" (click)="viewAll()">View All</button>
      </div>
      @for (txn of transactions; track txn.id) {
        <div class="txn-row">
          <div class="txn-info">
            <span class="txn-type" [class]="txn.type">{{ txn.type === 'expense' ? '-' : '+' }}</span>
            <div>
              <div class="txn-desc">{{ txn.categoryName }} - {{ txn.segmentName }}</div>
              <div class="txn-meta">{{ txn.createdByName }} &middot; {{ txn.createdAt | relativeTime }}</div>
            </div>
          </div>
          <span class="txn-amount" [class]="txn.type">{{ txn.amount | currencyInr }}</span>
        </div>
      }
      @if (transactions.length === 0) {
        <p class="no-data">No recent transactions</p>
      }
    </mat-card>
  `,
  styles: [`
    .recent-card { padding: 1.5rem; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    h3 { margin: 0; font-size: 1rem; color: #1e293b; }
    .txn-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #f1f5f9; }
    .txn-info { display: flex; align-items: center; gap: 12px; }
    .txn-type { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; }
    .txn-type.expense { background: #fef2f2; color: #dc2626; }
    .txn-type.income { background: #f0fdf4; color: #16a34a; }
    .txn-desc { font-size: 0.875rem; color: #1e293b; }
    .txn-meta { font-size: 0.75rem; color: #94a3b8; }
    .txn-amount { font-weight: 600; font-size: 0.875rem; }
    .txn-amount.expense { color: #dc2626; }
    .txn-amount.income { color: #16a34a; }
    .no-data { text-align: center; color: #94a3b8; padding: 2rem; }
  `],
})
export class RecentTransactionsComponent {
  @Input() transactions: Transaction[] = [];

  constructor(private router: Router) {}
  viewAll(): void { this.router.navigate(['/transactions']); }
}
