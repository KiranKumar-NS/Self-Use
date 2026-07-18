import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { Transaction, DistributionEntry } from '../../../core/models/transaction.model';
import { UserService } from '../../../core/services/user.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { ToastService } from '../../../core/services/toast.service';
import { safeLoad } from '../../../core/utils/async.utils';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';

export interface DistributionDialogData {
  transaction: Transaction;
}

interface DistributionRow {
  uid: string;
  name: string;
  amount: number;
}

@Component({
  selector: 'app-distribution-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatIconModule, CurrencyInrPipe,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">account_balance_wallet</mat-icon>
      Distribute Income
    </h2>

    <mat-dialog-content>
      <div class="total-amount">
        Total Income: <strong>{{ data.transaction.amount | currencyInr }}</strong>
      </div>

      @if (loading()) {
        <p class="loading-text">Loading users...</p>
      } @else {
        <div class="dist-rows">
          @for (row of rows(); track row.uid) {
            <div class="dist-row">
              <span class="person-name" [class.reinvestment]="row.uid === 'reinvestment'">
                @if (row.uid === 'reinvestment') {
                  <mat-icon class="row-icon">savings</mat-icon>
                } @else {
                  <mat-icon class="row-icon">person</mat-icon>
                }
                {{ row.name }}
              </span>
              <mat-form-field appearance="outline" class="amount-field">
                <mat-label>Amount</mat-label>
                <input matInput type="number" [(ngModel)]="row.amount"
                  min="0" [max]="data.transaction.amount"
                  (ngModelChange)="onAmountChange()" />
              </mat-form-field>
            </div>
          }
        </div>

        <div class="summary-bar" [class.over]="remaining() < 0" [class.exact]="remaining() === 0">
          <span>Distributed: {{ totalDistributed() | currencyInr }}</span>
          <span>
            @if (remaining() > 0) {
              Remaining: {{ remaining() | currencyInr }}
            } @else if (remaining() === 0) {
              Fully distributed
            } @else {
              Over by: {{ -remaining() | currencyInr }}
            }
          </span>
        </div>
      }

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary"
        [disabled]="saving() || remaining() < 0 || loading()"
        (click)="save()">
        {{ saving() ? 'Saving...' : 'Save Distribution' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .title-icon { vertical-align: middle; margin-right: 8px; }
    .total-amount {
      background: var(--color-info-light); padding: 12px 16px; border-radius: 8px;
      font-size: 1.1rem; margin-bottom: 16px; color: var(--color-info);
    }
    .loading-text { text-align: center; color: var(--color-text-secondary); padding: 2rem; }
    .dist-rows { display: flex; flex-direction: column; gap: 8px; }
    .dist-row {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 4px 0;
    }
    .person-name {
      display: flex; align-items: center; gap: 8px;
      font-size: 0.95rem; color: var(--color-text); min-width: 0; flex: 1;
    }
    .person-name.reinvestment { color: var(--color-purple); font-weight: 600; }
    .row-icon { font-size: 20px; width: 20px; height: 20px; color: var(--color-text-secondary); }
    .person-name.reinvestment .row-icon { color: var(--color-purple); }
    .amount-field { flex: 0 1 160px; min-width: 100px; }
    .summary-bar {
      display: flex; justify-content: space-between; padding: 12px 16px;
      border-radius: 8px; margin-top: 16px; font-weight: 500;
      background: var(--color-warning-light); color: var(--color-warning);
    }
    .summary-bar.exact { background: var(--color-income-bg); color: var(--color-income); }
    .summary-bar.over { background: var(--color-expense-bg); color: var(--color-expense); }
    .error-msg {
      background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px;
      border-radius: 6px; margin-top: 12px;
    }
    @media (max-width: 480px) {
      .dist-row { flex-wrap: wrap; gap: 8px; }
      .person-name { min-width: 0; }
      .amount-field { width: 100%; }
      .summary-bar { flex-direction: column; gap: 4px; }
    }
  `],
})
export class DistributionDialogComponent implements OnInit {
  data = inject<DistributionDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<DistributionDialogComponent>);
  private userService = inject(UserService);
  private transactionService = inject(TransactionService);
  private toast = inject(ToastService);

  rows = signal<DistributionRow[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  totalDistributed = signal(0);
  remaining = signal(0);

  async ngOnInit(): Promise<void> {
    await safeLoad(this.loading, async () => {
      const users = await this.userService.getAll();
      const activeUsers = users.filter(u => u.isActive);
      const existing = this.data.transaction.distributions || [];

      const distRows: DistributionRow[] = activeUsers.map(u => ({
        uid: u.uid,
        name: u.displayName,
        amount: existing.find(d => d.uid === u.uid)?.amount || 0,
      }));

      // Add reinvestment row
      distRows.push({
        uid: 'reinvestment',
        name: 'Reinvestment',
        amount: existing.find(d => d.uid === 'reinvestment')?.amount || 0,
      });

      this.rows.set(distRows);
      this.onAmountChange();
    }, this.toast);
  }

  onAmountChange(): void {
    const total = this.rows().reduce((s, r) => s + (r.amount || 0), 0);
    this.totalDistributed.set(total);
    this.remaining.set(this.data.transaction.amount - total);
  }

  async save(): Promise<void> {
    if (this.remaining() < 0) return;

    this.saving.set(true);
    this.error.set('');

    try {
      const distributions: DistributionEntry[] = this.rows()
        .filter(r => r.amount > 0)
        .map(r => ({ uid: r.uid, name: r.name, amount: r.amount }));

      await this.transactionService.updateDistribution(
        this.data.transaction.id,
        distributions,
      );
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save distribution');
    } finally {
      this.saving.set(false);
    }
  }
}
