import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Timestamp } from 'firebase/firestore';
import { TransactionService } from '../services/transaction.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TransactionType, TransactionCategory } from '../../../core/models';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

const TYPE_CATEGORY_MAP: Record<TransactionType, TransactionCategory> = {
  goat_sale: 'income',
  milk_sale: 'income',
  other_income: 'income',
  goat_purchase: 'expense',
  feed_purchase: 'expense',
  veterinary: 'expense',
  other_expense: 'expense',
};

@Component({
  selector: 'app-transaction-form',
  imports: [
    FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="TRANSACTIONS.NEW" icon="receipt_long" />

    <mat-card>
      <mat-card-content>
        <form (ngSubmit)="onSave()" class="txn-form">
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'TRANSACTIONS.TYPE' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.type" name="type" required (ngModelChange)="onTypeChange($event)">
                <mat-option value="goat_sale">{{ 'TRANSACTIONS.GOAT_SALE' | translate }}</mat-option>
                <mat-option value="goat_purchase">{{ 'TRANSACTIONS.GOAT_PURCHASE' | translate }}</mat-option>
                <mat-option value="milk_sale">{{ 'TRANSACTIONS.MILK_SALE' | translate }}</mat-option>
                <mat-option value="feed_purchase">{{ 'TRANSACTIONS.FEED_PURCHASE' | translate }}</mat-option>
                <mat-option value="veterinary">{{ 'TRANSACTIONS.VETERINARY' | translate }}</mat-option>
                <mat-option value="other_income">{{ 'TRANSACTIONS.OTHER_INCOME' | translate }}</mat-option>
                <mat-option value="other_expense">{{ 'TRANSACTIONS.OTHER_EXPENSE' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'TRANSACTIONS.AMOUNT' | translate }}</mat-label>
              <input matInput type="number" [(ngModel)]="form.amount" name="amount" required />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'TRANSACTIONS.DATE' | translate }}</mat-label>
              <input matInput [matDatepicker]="datePicker" [(ngModel)]="form.date" name="date" required />
              <mat-datepicker-toggle matSuffix [for]="datePicker" />
              <mat-datepicker #datePicker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'TRANSACTIONS.PARTY_NAME' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.partyName" name="partyName" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'TRANSACTIONS.PARTY_PHONE' | translate }}</mat-label>
              <input matInput type="tel" [(ngModel)]="form.partyPhone" name="partyPhone" />
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'TRANSACTIONS.DESCRIPTION' | translate }}</mat-label>
            <textarea matInput [(ngModel)]="form.description" name="description" rows="2" required></textarea>
          </mat-form-field>

          <div class="form-actions">
            <button mat-button type="button" (click)="router.navigate(['/transactions'])">{{ 'COMMON.CANCEL' | translate }}</button>
            <button mat-raised-button color="primary" type="submit" [disabled]="saving()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { {{ 'COMMON.SAVE' | translate }} }
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .txn-form { max-width: 800px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
})
export class TransactionForm {
  private readonly txnService = inject(TransactionService);
  private readonly notify = inject(NotificationService);
  readonly router = inject(Router);
  saving = signal(false);

  form = {
    type: 'goat_sale' as TransactionType,
    category: 'income' as TransactionCategory,
    amount: 0,
    date: new Date(),
    description: '',
    partyName: '',
    partyPhone: '',
  };

  onTypeChange(type: TransactionType): void {
    this.form.category = TYPE_CATEGORY_MAP[type];
  }

  async onSave(): Promise<void> {
    if (!this.form.description || !this.form.amount) return;
    this.saving.set(true);
    try {
      await this.txnService.addTransaction({
        type: this.form.type,
        category: this.form.category,
        amountInr: this.form.amount,
        description: this.form.description,
        partyName: this.form.partyName || undefined,
        partyPhone: this.form.partyPhone || undefined,
        transactionDate: Timestamp.fromDate(this.form.date),
        farmId: '',
        createdBy: '',
      });
      this.notify.success('Transaction recorded!');
      this.router.navigate(['/transactions']);
    } catch (err: unknown) {
      this.notify.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
