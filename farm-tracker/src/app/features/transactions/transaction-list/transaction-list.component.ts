import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../../core/services/transaction.service';
import { AuthService } from '../../../core/services/auth.service';
import { Transaction } from '../../../core/models/transaction.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe, RelativeTimePipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatChipsModule,
  ],
  template: `
    <div class="page-header">
      <h1>Transactions</h1>
      <button mat-flat-button color="primary" (click)="addNew()">
        <mat-icon>add</mat-icon> Add Transaction
      </button>
    </div>

    <mat-card class="filter-card">
      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="filterType" (selectionChange)="loadData()">
            <mat-option value="">All</mat-option>
            <mat-option value="expense">Expense</mat-option>
            <mat-option value="income">Income</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="filterSegment" (selectionChange)="loadData()">
            <mat-option value="">All</mat-option>
            <mat-option value="goats">Goats</mat-option>
            <mat-option value="chickens">Chickens</mat-option>
            <mat-option value="cows">Cows</mat-option>
            <mat-option value="fruits">Fruits</mat-option>
            <mat-option value="crops">Crops</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Month</mat-label>
          <input matInput type="month" [(ngModel)]="filterMonth" (change)="loadData()" />
        </mat-form-field>
      </div>
    </mat-card>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (transactions().length === 0) {
      <app-empty-state icon="📋" title="No transactions" message="No transactions found for the selected filters." />
    } @else {
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Segment</th>
              <th>Category</th>
              <th>Amount</th>
              <th>By</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (txn of transactions(); track txn.id) {
              <tr>
                <td>{{ txn.date.toDate() | date:'dd MMM yyyy' }}</td>
                <td>
                  <span class="type-badge" [class]="txn.type">{{ txn.type }}</span>
                </td>
                <td>{{ txn.segmentName }}</td>
                <td>{{ txn.categoryName }}</td>
                <td class="amount" [class]="txn.type">{{ txn.amount | currencyInr }}</td>
                <td>{{ txn.createdByName }}</td>
                <td class="desc-cell">{{ txn.description }}</td>
                <td>
                  <button mat-icon-button (click)="edit(txn.id)" title="Edit">
                    <mat-icon>edit</mat-icon>
                  </button>
                  @if (auth.isAdmin()) {
                    <button mat-icon-button color="warn" (click)="confirmDelete(txn)" title="Delete">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (hasMore()) {
        <div class="load-more">
          <button mat-stroked-button (click)="loadMore()">Load More</button>
        </div>
      }
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .filter-card { margin-bottom: 1rem; padding: 1rem; }
    .filters { display: flex; gap: 1rem; flex-wrap: wrap; }
    .filters mat-form-field { flex: 1; min-width: 150px; }
    .table-container { background: white; border-radius: 8px; overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .data-table td { padding: 12px 16px; border-top: 1px solid #f1f5f9; font-size: 0.875rem; }
    .data-table tr:hover { background: #f8fafc; }
    .type-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .type-badge.expense { background: #fef2f2; color: #dc2626; }
    .type-badge.income { background: #f0fdf4; color: #16a34a; }
    .amount.expense { color: #dc2626; font-weight: 600; }
    .amount.income { color: #16a34a; font-weight: 600; }
    .desc-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .load-more { text-align: center; padding: 1rem; }
  `],
})
export class TransactionListComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);

  transactions = signal<Transaction[]>([]);
  loading = signal(true);
  hasMore = signal(false);
  private lastDoc: any = null;

  filterType = '';
  filterSegment = '';
  filterMonth = '';

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.lastDoc = null;
    const filters: any = {};
    if (this.filterType) filters.type = this.filterType;
    if (this.filterSegment) filters.segment = this.filterSegment;
    if (this.filterMonth) filters.month = this.filterMonth;

    const result = await this.transactionService.getAll(filters, 20);
    this.transactions.set(result.transactions);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.transactions.length === 20);
    this.loading.set(false);
  }

  async loadMore(): Promise<void> {
    const filters: any = {};
    if (this.filterType) filters.type = this.filterType;
    if (this.filterSegment) filters.segment = this.filterSegment;
    if (this.filterMonth) filters.month = this.filterMonth;

    const result = await this.transactionService.getAll(filters, 20, this.lastDoc);
    this.transactions.update((prev) => [...prev, ...result.transactions]);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.transactions.length === 20);
  }

  addNew(): void {
    this.router.navigate(['/transactions/new']);
  }

  edit(id: string): void {
    this.router.navigate(['/transactions', id, 'edit']);
  }

  async confirmDelete(txn: Transaction): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Transaction',
        message: `Are you sure you want to delete this ${txn.type} of ${txn.amount}?`,
        confirmText: 'Delete',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.transactionService.softDelete(txn.id);
        await this.loadData();
      }
    });
  }
}
