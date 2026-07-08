import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TransactionService } from '../../../core/services/transaction.service';
import { AuthService } from '../../../core/services/auth.service';
import { Transaction } from '../../../core/models/transaction.model';
import { CostAttributionDialogComponent } from '../../animals/cost-attribution-dialog/cost-attribution-dialog.component';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { DistributionDialogComponent } from '../distribution-dialog/distribution-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-transaction-detail',
  standalone: true,
  imports: [DatePipe, CurrencyInrPipe, RelativeTimePipe, LoadingSpinnerComponent, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (transaction()) {
      <div class="page-header">
        <h1>Transaction Detail</h1>
        <div class="header-actions">
          @if (transaction()!.type === 'income' && transaction()!.paymentStatus === 'pending' && !auth.isViewer()) {
            <button mat-flat-button color="primary" (click)="markAsReceived()" [disabled]="marking()">
              <mat-icon>check_circle</mat-icon>
              {{ marking() ? 'Updating...' : 'Mark as Received' }}
            </button>
          }
          @if (transaction()!.type === 'expense' && transaction()!.expensePaymentStatus === 'pending' && !auth.isViewer()) {
            <button mat-flat-button color="primary" (click)="markAsPaid()" [disabled]="marking()">
              <mat-icon>check_circle</mat-icon>
              {{ marking() ? 'Updating...' : 'Mark as Paid' }}
            </button>
          }
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
          @if (transaction()!.type === 'income') {
            <div class="detail-item">
              <label>Payment Status</label>
              <span class="pay-status-badge" [class]="transaction()!.paymentStatus || 'received'">
                {{ (transaction()!.paymentStatus || 'received').toUpperCase() }}
              </span>
            </div>
          }
          @if (transaction()!.type === 'expense') {
            <div class="detail-item">
              <label>Payment Status</label>
              <span class="pay-status-badge" [class]="transaction()!.expensePaymentStatus || 'paid'">
                {{ (transaction()!.expensePaymentStatus || 'paid').toUpperCase() }}
              </span>
            </div>
          }
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

      <!-- Linked Animals -->
      @if (transaction()!.linkedAnimalIds?.length) {
        <h3 class="section-title">Linked Animals</h3>
        <mat-card class="linked-card">
          <div class="linked-animals">
            @for (name of transaction()!.linkedAnimalNames || []; track $index) {
              <a [routerLink]="['/animals', transaction()!.linkedAnimalIds![$index]]" class="animal-chip">
                <mat-icon>pets</mat-icon> {{ name }}
              </a>
            }
          </div>
        </mat-card>
      }

      @if (transaction()!.linkedBuyerName) {
        <h3 class="section-title">Buyer</h3>
        <mat-card class="linked-card">
          @if (transaction()!.linkedBuyerId) {
            <a [routerLink]="['/buyers', transaction()!.linkedBuyerId]" class="buyer-link">
              <mat-icon>person</mat-icon> {{ transaction()!.linkedBuyerName }}
            </a>
          } @else {
            <span><mat-icon>person</mat-icon> {{ transaction()!.linkedBuyerName }}</span>
          }
        </mat-card>
      }

      <!-- Link to Animals button (expense, no linked animals yet) -->
      @if (transaction()!.type === 'expense' && !transaction()!.linkedAnimalIds?.length && !auth.isViewer()) {
        <div class="link-action">
          <button mat-stroked-button (click)="openCostAttribution()">
            <mat-icon>pets</mat-icon> Link to Animals
          </button>
        </div>
      }

      <!-- Distribution Section (income only) -->
      @if (transaction()!.type === 'income') {
        <div class="dist-header">
          <h3 class="section-title">Distribution</h3>
          @if (!auth.isViewer()) {
            <button mat-stroked-button (click)="openDistributionDialog()">
              <mat-icon>{{ hasDistributions() ? 'edit' : 'account_balance_wallet' }}</mat-icon>
              {{ hasDistributions() ? 'Edit Distribution' : 'Distribute' }}
            </button>
          }
        </div>

        <mat-card class="dist-card">
          @if (hasDistributions()) {
            <div class="dist-table">
              @for (d of transaction()!.distributions; track d.uid) {
                <div class="dist-row">
                  <span class="dist-name" [class.reinvestment]="d.uid === 'reinvestment'">
                    @if (d.uid === 'reinvestment') {
                      <mat-icon class="dist-icon">savings</mat-icon>
                    } @else {
                      <mat-icon class="dist-icon">person</mat-icon>
                    }
                    {{ d.name }}
                  </span>
                  <span class="dist-amount">{{ d.amount | currencyInr }}</span>
                  <span class="dist-pct">{{ ((d.amount / transaction()!.amount) * 100).toFixed(0) }}%</span>
                </div>
              }
              @if (undistributed() > 0) {
                <div class="dist-row undistributed">
                  <span class="dist-name">
                    <mat-icon class="dist-icon">hourglass_empty</mat-icon>
                    Undistributed
                  </span>
                  <span class="dist-amount">{{ undistributed() | currencyInr }}</span>
                  <span class="dist-pct">{{ ((undistributed() / transaction()!.amount) * 100).toFixed(0) }}%</span>
                </div>
              }
            </div>
          } @else {
            <div class="dist-empty">
              <mat-icon>info_outline</mat-icon>
              <span>Not yet distributed. Full amount available for distribution or reinvestment.</span>
            </div>
          }
        </mat-card>
      }

      @if (transaction()!.timeline && transaction()!.timeline.length > 0) {
        <h3 class="section-title">Timeline</h3>
        <mat-card>
          @for (entry of transaction()!.timeline; track $index) {
            <div class="audit-entry">
              <strong>{{ entry.byName }}</strong>
              @if (entry.action === 'distributed') {
                distributed this income
              } @else if (entry.action === 'payment_received') {
                marked this income as received
              } @else if (entry.action === 'payment_paid') {
                marked this expense as paid
              } @else {
                {{ entry.action }} this transaction
              }
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
    .detail-item label { display: block; font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px; }
    .detail-item span { font-size: 1rem; color: var(--color-text); }
    .detail-item.full { grid-column: 1 / -1; }
    .type-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .type-badge.expense { background: var(--color-expense-bg); color: var(--color-expense); }
    .type-badge.income { background: var(--color-income-bg); color: var(--color-income); }
    .amount.expense { color: var(--color-expense); font-weight: 700; font-size: 1.25rem !important; }
    .amount.income { color: var(--color-income); font-weight: 700; font-size: 1.25rem !important; }
    .payment-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .payment-badge.cash { background: var(--color-warning-light); color: var(--color-warning); }
    .payment-badge.upi { background: var(--color-info-light); color: var(--color-info); }
    .pay-status-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .pay-status-badge.pending { background: var(--color-expense-bg); color: var(--color-expense); }
    .pay-status-badge.received, .pay-status-badge.paid { background: var(--color-income-bg); color: var(--color-income); }
    .header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; color: var(--color-text); }
    .dist-header { display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; }
    .dist-header .section-title { margin: 0; }
    .dist-card { padding: 1rem; margin-top: 0.5rem; }
    .dist-table { display: flex; flex-direction: column; }
    .dist-row { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-bg-alt); }
    .dist-row:last-child { border-bottom: none; }
    .dist-row.undistributed { opacity: 0.6; font-style: italic; }
    .dist-name { display: flex; align-items: center; gap: 8px; flex: 1; font-size: 0.95rem; }
    .dist-name.reinvestment { color: var(--color-purple); font-weight: 600; }
    .dist-icon { font-size: 20px; width: 20px; height: 20px; color: var(--color-text-secondary); }
    .dist-name.reinvestment .dist-icon { color: var(--color-purple); }
    .dist-amount { font-weight: 600; min-width: 100px; text-align: right; }
    .dist-pct { color: var(--color-text-secondary); font-size: 0.8rem; min-width: 50px; text-align: right; }
    .dist-empty { display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); font-size: 0.9rem; padding: 8px 0; }
    .linked-card { padding: 1rem; margin-top: 0.5rem; }
    .linked-animals { display: flex; flex-wrap: wrap; gap: 8px; }
    .animal-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: var(--color-income-bg); color: var(--color-income); border-radius: 20px; font-size: 0.85rem; font-weight: 600; text-decoration: none; }
    .animal-chip mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .buyer-link { display: inline-flex; align-items: center; gap: 6px; color: var(--color-primary); font-weight: 600; text-decoration: none; }
    .link-action { margin-top: 1rem; }
    .audit-entry { padding: 12px 16px; border-bottom: 1px solid var(--color-bg-alt); font-size: 0.875rem; }
    .audit-time { color: var(--color-text-muted); margin-left: 8px; }
    .changes { margin: 4px 0 0 1rem; font-size: 0.8rem; color: var(--color-text-secondary); }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .header-actions { flex-wrap: wrap; }
      .detail-grid { grid-template-columns: 1fr 1fr; gap: 1rem; }
      .detail-card { padding: 1rem; }
    }
    @media (max-width: 480px) {
      .detail-grid { grid-template-columns: 1fr; }
      .dist-amount { min-width: 0; }
      .dist-pct { min-width: 0; }
    }
  `],
})
export class TransactionDetailComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);

  transaction = signal<Transaction | null>(null);
  loading = signal(true);
  marking = signal(false);

  private txnId = '';

  async ngOnInit(): Promise<void> {
    this.txnId = this.route.snapshot.params['id'];
    await this.loadTransaction();
  }

  async loadTransaction(): Promise<void> {
    this.loading.set(true);
    this.transaction.set(await this.transactionService.getById(this.txnId));
    this.loading.set(false);
  }

  hasDistributions(): boolean {
    return !!(this.transaction()?.distributions?.length);
  }

  undistributed(): number {
    const txn = this.transaction();
    if (!txn?.distributions?.length) return txn?.amount || 0;
    const distributed = txn.distributions.reduce((s, d) => s + d.amount, 0);
    return txn.amount - distributed;
  }

  openDistributionDialog(): void {
    const ref = this.dialog.open(DistributionDialogComponent, {
      width: '90vw',
      maxWidth: '500px',
      data: { transaction: this.transaction() },
    });

    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        await this.loadTransaction();
      }
    });
  }

  async markAsReceived(): Promise<void> {
    this.marking.set(true);
    try {
      await this.transactionService.markAsReceived(this.txnId);
      await this.loadTransaction();
    } finally {
      this.marking.set(false);
    }
  }

  async markAsPaid(): Promise<void> {
    this.marking.set(true);
    try {
      await this.transactionService.markAsPaid(this.txnId);
      await this.loadTransaction();
    } finally {
      this.marking.set(false);
    }
  }

  openCostAttribution(): void {
    const txn = this.transaction();
    if (!txn) return;
    const ref = this.dialog.open(CostAttributionDialogComponent, {
      width: '90vw',
      maxWidth: '500px',
      data: { transaction: txn, segment: txn.segment },
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result) await this.loadTransaction();
    });
  }

  edit(): void {
    this.router.navigate(['/transactions', this.txnId, 'edit']);
  }

  back(): void {
    this.router.navigate(['/transactions']);
  }
}
