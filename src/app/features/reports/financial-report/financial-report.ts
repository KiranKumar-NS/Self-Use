import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { TransactionStore } from '../../transactions/store/transaction.store';
import { ExportService } from '../../../core/services/export.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatCard } from '../../../shared/components/stat-card/stat-card';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-financial-report',
  imports: [
    RouterLink, DatePipe, UpperCasePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    PageHeader, StatCard, CurrencyInrPipe, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="REPORTS.FINANCIAL" icon="account_balance">
      <button mat-stroked-button (click)="exportPdf()">
        <mat-icon>picture_as_pdf</mat-icon>
        {{ 'REPORTS.EXPORT_PDF' | translate }}
      </button>
      <button mat-stroked-button (click)="exportExcel()">
        <mat-icon>table_chart</mat-icon>
        {{ 'REPORTS.EXPORT_EXCEL' | translate }}
      </button>
      <a mat-button routerLink="/reports">
        <mat-icon>arrow_back</mat-icon>
        Back
      </a>
    </app-page-header>

    <div class="grid-3">
      <app-stat-card [label]="'TRANSACTIONS.TOTAL_INCOME' | translate" [value]="store.totalIncome() | currencyInr" icon="trending_up" color="#2e7d32" />
      <app-stat-card [label]="'TRANSACTIONS.TOTAL_EXPENSE' | translate" [value]="store.totalExpense() | currencyInr" icon="trending_down" color="#c62828" />
      <app-stat-card [label]="'TRANSACTIONS.NET_PROFIT' | translate" [value]="store.netProfit() | currencyInr" icon="account_balance" [color]="store.netProfit() >= 0 ? '#2e7d32' : '#c62828'" />
    </div>

    <mat-card>
      <mat-card-header>
        <mat-card-title>Transaction Details</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (store.entities().length === 0) {
          <p class="empty-text">{{ 'COMMON.NO_DATA' | translate }}</p>
        } @else {
          <table mat-table [dataSource]="store.entities()" class="full-width">
            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let row">{{ row.transactionDate.toDate() | date:'mediumDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="type">
              <th mat-header-cell *matHeaderCellDef>Type</th>
              <td mat-cell *matCellDef="let row">{{ row.type | uppercase }}</td>
            </ng-container>
            <ng-container matColumnDef="description">
              <th mat-header-cell *matHeaderCellDef>Description</th>
              <td mat-cell *matCellDef="let row">{{ row.description }}</td>
            </ng-container>
            <ng-container matColumnDef="category">
              <th mat-header-cell *matHeaderCellDef>Category</th>
              <td mat-cell *matCellDef="let row" [class]="row.category">{{ row.category | uppercase }}</td>
            </ng-container>
            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>Amount</th>
              <td mat-cell *matCellDef="let row" [class]="row.category">{{ row.amountInr | currencyInr }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="columns"></tr>
            <tr mat-row *matRowDef="let row; columns: columns;"></tr>
          </table>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .grid-3 { margin-bottom: 16px; }
    .full-width { width: 100%; }
    .empty-text { color: #999; text-align: center; padding: 24px; }
    .income { color: #2e7d32; font-weight: 500; }
    .expense { color: #c62828; font-weight: 500; }
  `,
})
export class FinancialReport {
  readonly store = inject(TransactionStore);
  private readonly exportService = inject(ExportService);
  readonly columns = ['date', 'type', 'description', 'category', 'amount'];

  async exportPdf(): Promise<void> {
    const headers = ['Date', 'Type', 'Description', 'Category', 'Amount (₹)'];
    const rows = this.store.entities().map((t) => [
      t.transactionDate.toDate().toLocaleDateString('en-IN'),
      t.type,
      t.description,
      t.category,
      t.amountInr.toString(),
    ]);
    await this.exportService.exportToPdf('Financial Report', headers, rows);
  }

  async exportExcel(): Promise<void> {
    const headers = ['Date', 'Type', 'Description', 'Category', 'Amount (₹)'];
    const rows = this.store.entities().map((t) => [
      t.transactionDate.toDate().toLocaleDateString('en-IN'),
      t.type,
      t.description,
      t.category,
      t.amountInr,
    ]);
    await this.exportService.exportToExcel('Financial Report', headers, rows);
  }
}
