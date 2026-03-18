import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { TransactionStore } from '../store/transaction.store';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatCard } from '../../../shared/components/stat-card/stat-card';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { TranslateModule } from '@ngx-translate/core';
import { TransactionCategory } from '../../../core/models';

@Component({
  selector: 'app-transaction-list',
  imports: [
    RouterLink, DatePipe, UpperCasePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatProgressSpinnerModule,
    PageHeader, StatCard, CurrencyInrPipe, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="TRANSACTIONS.TITLE" icon="receipt_long">
      <a mat-raised-button color="primary" routerLink="/transactions/new">
        <mat-icon>add</mat-icon>
        {{ 'TRANSACTIONS.NEW' | translate }}
      </a>
    </app-page-header>

    <div class="grid-3">
      <app-stat-card [label]="'TRANSACTIONS.TOTAL_INCOME' | translate" [value]="store.totalIncome() | currencyInr" icon="trending_up" color="#2e7d32" />
      <app-stat-card [label]="'TRANSACTIONS.TOTAL_EXPENSE' | translate" [value]="store.totalExpense() | currencyInr" icon="trending_down" color="#c62828" />
      <app-stat-card [label]="'TRANSACTIONS.NET_PROFIT' | translate" [value]="store.netProfit() | currencyInr" icon="account_balance" [color]="store.netProfit() >= 0 ? '#2e7d32' : '#c62828'" />
    </div>

    <mat-card>
      <mat-card-content>
        <mat-chip-listbox (change)="onFilter($event.value)" class="filter-chips">
          <mat-chip-option value="all" [selected]="store.filterCategory() === 'all'">{{ 'COMMON.ALL' | translate }}</mat-chip-option>
          <mat-chip-option value="income">{{ 'TRANSACTIONS.INCOME' | translate }}</mat-chip-option>
          <mat-chip-option value="expense">{{ 'TRANSACTIONS.EXPENSE' | translate }}</mat-chip-option>
        </mat-chip-listbox>

        @if (store.loading()) {
          <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
        } @else if (store.filteredTransactions().length === 0) {
          <p class="empty-text">{{ 'COMMON.NO_DATA' | translate }}</p>
        } @else {
          <table mat-table [dataSource]="store.filteredTransactions()" class="full-width">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>{{ 'TRANSACTIONS.DATE' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ row.transactionDate.toDate() | date:'mediumDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>{{ 'TRANSACTIONS.TYPE' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ row.type | uppercase }}</td>
            </ng-container>
            <ng-container matColumnDef="description">
              <th mat-header-cell *matHeaderCellDef>{{ 'TRANSACTIONS.DESCRIPTION' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ row.description }}</td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>{{ 'TRANSACTIONS.AMOUNT' | translate }}</th>
              <td mat-cell *matCellDef="let row" [class.income]="row.category === 'income'" [class.expense]="row.category === 'expense'">
                {{ row.category === 'income' ? '+' : '-' }}{{ row.amountInr | currencyInr }}
              </td>
            </ng-container>
            <ng-container matColumnDef="party">
              <th mat-header-cell *matHeaderCellDef>{{ 'TRANSACTIONS.PARTY_NAME' | translate }}</th>
              <td mat-cell *matCellDef="let row">{{ row.partyName || '-' }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .grid-3 { margin-bottom: 16px; }
    .filter-chips { margin-bottom: 16px; }
    .loading { display: flex; justify-content: center; padding: 40px; }
    .full-width { width: 100%; }
    .empty-text { color: #999; text-align: center; padding: 24px; }
    .income { color: #2e7d32; font-weight: 500; }
    .expense { color: #c62828; font-weight: 500; }
  `,
})
export class TransactionList {
  readonly store = inject(TransactionStore);
  readonly displayedColumns = ['date', 'type', 'description', 'amount', 'party'];

  onFilter(value: string): void {
    this.store.setFilterCategory(value as TransactionCategory | 'all');
  }
}
