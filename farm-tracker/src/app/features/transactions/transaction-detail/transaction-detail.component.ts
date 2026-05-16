import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TransactionService } from '../../../core/services/transaction.service';
import { Transaction } from '../../../core/models/transaction.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-transaction-detail',
  standalone: true,
  imports: [DatePipe, CurrencyInrPipe, RelativeTimePipe, LoadingSpinnerComponent, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (transaction()) {
      <div class="page-header">
        <h1>Transaction Detail</h1>
        <div>
          <button mat-stroked-button (click)="edit()">
            <mat-icon>edit</mat-icon> Edit
          </button>
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <mat-card class="detail-card">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Type</label>
            <span class="type-badge" [class]="transaction()!.type">{{ transaction()!.type }}</span>
          </div>
          <div class="detail-item">
            <label>Date</label>
            <span>{{ transaction()!.date.toDate() | date:'dd MMM yyyy' }}</span>
          </div>
          <div class="detail-item">
            <label>Amount</label>
            <span class="amount" [class]="transaction()!.type">{{ transaction()!.amount | currencyInr }}</span>
          </div>
          <div class="detail-item">
            <label>Segment</label>
            <span>{{ transaction()!.segmentName }}</span>
          </div>
          <div class="detail-item">
            <label>Category</label>
            <span>{{ transaction()!.categoryName }}</span>
          </div>
          <div class="detail-item">
            <label>Payment Method</label>
            <span class="payment-badge" [class]="transaction()!.paymentMethod || 'cash'">{{ (transaction()!.paymentMethod || 'cash').toUpperCase() }}</span>
          </div>
          <div class="detail-item">
            <label>{{ transaction()!.type === 'expense' ? 'Paid By' : 'Received By' }}</label>
            <span>{{ transaction()!.paidByName || transaction()!.createdByName }}</span>
          </div>
          <div class="detail-item full">
            <label>Description</label>
            <span>{{ transaction()!.description || 'No description' }}</span>
          </div>
          <div class="detail-item">
            <label>Created By</label>
            <span>{{ transaction()!.createdByName }}</span>
          </div>
          <div class="detail-item">
            <label>Created At</label>
            <span>{{ transaction()!.createdAt | relativeTime }}</span>
          </div>
        </div>
      </mat-card>

      @if (transaction()!.timeline && transaction()!.timeline.length > 0) {
        <h3 class="section-title">Timeline</h3>
        <mat-card>
          @for (entry of transaction()!.timeline; track $index) {
            <div class="audit-entry">
              <strong>{{ entry.byName }}</strong> {{ entry.action }} this transaction
              <span class="audit-time">{{ entry.at | relativeTime }}</span>
              @if (entry.changes) {
                <div class="changes">{{ entry.changes }}</div>
              }
            </div>
          }
        </mat-card>
      }
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; }
    .detail-card { padding: 1.5rem; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; }
    .detail-item label { display: block; font-size: 0.75rem; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .detail-item span { font-size: 1rem; color: #1e293b; }
    .detail-item.full { grid-column: 1 / -1; }
    .type-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .type-badge.expense { background: #fef2f2; color: #dc2626; }
    .type-badge.income { background: #f0fdf4; color: #16a34a; }
    .amount.expense { color: #dc2626; font-weight: 700; font-size: 1.25rem !important; }
    .amount.income { color: #16a34a; font-weight: 700; font-size: 1.25rem !important; }
    .payment-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .payment-badge.cash { background: #fef3c7; color: #d97706; }
    .payment-badge.upi { background: #dbeafe; color: #2563eb; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; color: #1e293b; }
    .audit-entry { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; font-size: 0.875rem; }
    .audit-time { color: #94a3b8; margin-left: 8px; }
    .changes { margin: 4px 0 0 1rem; font-size: 0.8rem; color: #64748b; }
  `],
})
export class TransactionDetailComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  transaction = signal<Transaction | null>(null);
  loading = signal(true);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.params['id'];
    this.transaction.set(await this.transactionService.getById(id));
    this.loading.set(false);
  }

  edit(): void {
    this.router.navigate(['/transactions', this.transaction()!.id, 'edit']);
  }

  back(): void {
    this.router.navigate(['/transactions']);
  }
}
