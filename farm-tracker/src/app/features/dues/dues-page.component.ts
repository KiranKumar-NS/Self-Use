import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DuesService, PartyDues } from '../../core/services/dues.service';
import { TransactionService } from '../../core/services/transaction.service';
import { ToastService } from '../../core/services/toast.service';
import { CurrencyInrPipe } from '../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { safeLoad } from '../../core/utils/async.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-dues-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, RouterLink, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatTabsModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Dues</h1>
        <p class="subtitle">Pending payments by customer and supplier</p>
      </div>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <mat-tab-group>
        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon income">call_received</mat-icon>
            To Receive
          </ng-template>
          <div class="tab-body">
            @if (receivables().length === 0) {
              <app-empty-state icon="✅" title="All settled" message="No pending payments to receive." />
            } @else {
              <div class="total-bar income-bg">
                <span>Total to receive</span>
                <strong>{{ receivablesTotal() | currencyInr }}</strong>
              </div>
              @for (group of receivables(); track group.key) {
                <mat-card class="party-card">
                  <div class="party-row" (click)="toggle(group.key)">
                    <div class="party-info">
                      @if (group.partyId) {
                        <a class="party-name" [routerLink]="['/buyers', group.partyId]" (click)="$event.stopPropagation()">{{ group.partyName }}</a>
                      } @else {
                        <span class="party-name">{{ group.partyName }}</span>
                      }
                      <span class="party-count">{{ group.count }} pending {{ group.count === 1 ? 'sale' : 'sales' }}</span>
                    </div>
                    <div class="party-total income">{{ group.total | currencyInr }}</div>
                    <mat-icon class="expand-icon">{{ expandedKey() === group.key ? 'expand_less' : 'expand_more' }}</mat-icon>
                  </div>
                  @if (expandedKey() === group.key) {
                    <div class="txn-list">
                      @for (txn of group.transactions; track txn.id) {
                        <div class="txn-row">
                          <div class="txn-info">
                            <span class="txn-date">{{ txn.date.toDate() | date: 'dd MMM yyyy' }}</span>
                            <span class="txn-desc">{{ txn.description || txn.categoryName }}</span>
                            <span class="txn-segment">{{ txn.segmentName }}</span>
                          </div>
                          <span class="txn-amount">{{ txn.amount | currencyInr }}</span>
                          <a mat-icon-button [routerLink]="['/transactions', txn.id]" aria-label="View details">
                            <mat-icon>open_in_new</mat-icon>
                          </a>
                          <button mat-stroked-button color="primary" [disabled]="marking() === txn.id"
                                  (click)="markReceived(txn.id)">
                            {{ marking() === txn.id ? 'Saving…' : 'Mark received' }}
                          </button>
                        </div>
                      }
                    </div>
                  }
                </mat-card>
              }
            }
          </div>
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <mat-icon class="tab-icon expense">call_made</mat-icon>
            To Pay
          </ng-template>
          <div class="tab-body">
            @if (payables().length === 0) {
              <app-empty-state icon="✅" title="All settled" message="No pending payments to make." />
            } @else {
              <div class="total-bar expense-bg">
                <span>Total to pay</span>
                <strong>{{ payablesTotal() | currencyInr }}</strong>
              </div>
              @for (group of payables(); track group.key) {
                <mat-card class="party-card">
                  <div class="party-row" (click)="toggle(group.key)">
                    <div class="party-info">
                      <span class="party-name">{{ group.partyName }}</span>
                      <span class="party-count">{{ group.count }} pending {{ group.count === 1 ? 'purchase' : 'purchases' }}</span>
                    </div>
                    <div class="party-total expense">{{ group.total | currencyInr }}</div>
                    <mat-icon class="expand-icon">{{ expandedKey() === group.key ? 'expand_less' : 'expand_more' }}</mat-icon>
                  </div>
                  @if (expandedKey() === group.key) {
                    <div class="txn-list">
                      @for (txn of group.transactions; track txn.id) {
                        <div class="txn-row">
                          <div class="txn-info">
                            <span class="txn-date">{{ txn.date.toDate() | date: 'dd MMM yyyy' }}</span>
                            <span class="txn-desc">{{ txn.description || txn.categoryName }}</span>
                            <span class="txn-segment">{{ txn.segmentName }}</span>
                          </div>
                          <span class="txn-amount">{{ txn.amount | currencyInr }}</span>
                          <a mat-icon-button [routerLink]="['/transactions', txn.id]" aria-label="View details">
                            <mat-icon>open_in_new</mat-icon>
                          </a>
                          <button mat-stroked-button color="primary" [disabled]="marking() === txn.id"
                                  (click)="markPaid(txn.id)">
                            {{ marking() === txn.id ? 'Saving…' : 'Mark paid' }}
                          </button>
                        </div>
                      }
                    </div>
                  }
                </mat-card>
              }
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .tab-icon { margin-right: 8px; }
    .tab-icon.income { color: var(--color-income, #2e7d32); }
    .tab-icon.expense { color: var(--color-expense, #c62828); }
    .tab-body { padding: 1rem 0; }
    .total-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 1rem;
      font-size: 1rem;
    }
    .total-bar strong { font-size: 1.2rem; }
    .income-bg { background: rgba(46, 125, 50, 0.08); color: var(--color-income, #2e7d32); }
    .expense-bg { background: rgba(198, 40, 40, 0.08); color: var(--color-expense, #c62828); }
    .party-card { margin-bottom: 0.75rem; padding: 0; }
    .party-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      cursor: pointer;
    }
    .party-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .party-name { font-weight: 600; color: var(--color-text-primary); text-decoration: none; }
    a.party-name { color: var(--color-primary); }
    a.party-name:hover { text-decoration: underline; }
    .party-count { font-size: var(--font-sm, 0.8rem); color: var(--color-text-secondary); }
    .party-total { font-weight: 700; font-size: 1.05rem; white-space: nowrap; }
    .party-total.income { color: var(--color-income, #2e7d32); }
    .party-total.expense { color: var(--color-expense, #c62828); }
    .expand-icon { color: var(--color-text-secondary); }
    .txn-list { border-top: 1px solid var(--color-border, #e0e0e0); padding: 4px 16px 12px; }
    .txn-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid var(--color-border, #f0f0f0);
    }
    .txn-row:last-child { border-bottom: none; }
    .txn-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .txn-date { font-size: var(--font-sm, 0.8rem); color: var(--color-text-secondary); }
    .txn-desc { font-size: 0.9rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .txn-segment { font-size: var(--font-sm, 0.75rem); color: var(--color-text-secondary); }
    .txn-amount { font-weight: 600; white-space: nowrap; }
    @media (max-width: 600px) {
      .txn-row { flex-wrap: wrap; }
      .txn-info { flex-basis: 100%; }
    }
  `],
})
export class DuesPageComponent implements OnInit {
  private duesService = inject(DuesService);
  private transactionService = inject(TransactionService);
  private toast = inject(ToastService);

  loading = signal(true);
  receivables = signal<PartyDues[]>([]);
  payables = signal<PartyDues[]>([]);
  expandedKey = signal('');
  marking = signal('');

  receivablesTotal = computed(() => this.receivables().reduce((sum, g) => sum + g.total, 0));
  payablesTotal = computed(() => this.payables().reduce((sum, g) => sum + g.total, 0));

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    await safeLoad(this.loading, async () => {
      const [receivables, payables] = await Promise.all([
        this.duesService.getReceivables(),
        this.duesService.getPayables(),
      ]);
      this.receivables.set(receivables);
      this.payables.set(payables);
    }, this.toast, 'Failed to load dues');
  }

  toggle(key: string): void {
    this.expandedKey.set(this.expandedKey() === key ? '' : key);
  }

  async markReceived(txnId: string): Promise<void> {
    await this.mark(txnId, () => this.transactionService.markAsReceived(txnId), 'Payment marked as received');
  }

  async markPaid(txnId: string): Promise<void> {
    await this.mark(txnId, () => this.transactionService.markAsPaid(txnId), 'Payment marked as paid');
  }

  private async mark(txnId: string, action: () => Promise<void>, successMsg: string): Promise<void> {
    this.marking.set(txnId);
    try {
      await action();
      this.toast.success(successMsg);
      await this.load();
    } catch (err) {
      console.error('Failed to update payment status', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to save');
      await this.load();
    } finally {
      this.marking.set('');
    }
  }
}
