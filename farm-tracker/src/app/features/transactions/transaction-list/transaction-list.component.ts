import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UpperCasePipe, DatePipe } from '@angular/common';
import { TransactionService } from '../../../core/services/transaction.service';
import { AuthService } from '../../../core/services/auth.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Transaction } from '../../../core/models/transaction.model';
import { Segment } from '../../../core/models/segment.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { getMonthString } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [
    FormsModule, DatePipe, UpperCasePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule,
  ],
  template: `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>Transactions</h1>
        <p class="subtitle">Track all income and expenses</p>
      </div>
      <button mat-flat-button color="primary" (click)="addNew()">
        <mat-icon>add</mat-icon> Add Transaction
      </button>
    </div>

    <!-- Filters -->
    <mat-card class="filter-card">
      <div class="filter-header">
        <mat-icon>filter_list</mat-icon>
        <span>Filters</span>
        @if (filterType || filterSegment || filterMonth || filterPaymentStatus || searchTerm) {
          <button mat-button class="clear-btn" (click)="clearFilters()">Clear All</button>
        }
      </div>
      <div class="filters">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="filterType" (selectionChange)="loadData()">
            <mat-option value="">All Types</mat-option>
            <mat-option value="expense">Expense</mat-option>
            <mat-option value="income">Income</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="filterSegment" (selectionChange)="loadData()">
            <mat-option value="">All Segments</mat-option>
            @for (seg of segments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Month</mat-label>
          <mat-select [(ngModel)]="filterMonth" (selectionChange)="loadData()">
            <mat-option value="">All Months</mat-option>
            @for (m of availableMonths; track m.value) {
              <mat-option [value]="m.value">{{ m.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Payment</mat-label>
          <mat-select [(ngModel)]="filterPaymentStatus">
            <mat-option value="">All</mat-option>
            <mat-option value="received">Received</mat-option>
            <mat-option value="pending">Pending</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field search-field">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="searchTerm" placeholder="Description, person, amount..." />
          @if (searchTerm) {
            <button matSuffix mat-icon-button (click)="searchTerm = ''"><mat-icon>close</mat-icon></button>
          }
        </mat-form-field>
      </div>
    </mat-card>

    <!-- Content -->
    @if (loading()) {
      <app-loading-spinner />
    } @else if (displayedTransactions().length === 0) {
      <app-empty-state icon="📋" title="No transactions" message="No transactions found. Try changing the filters or add a new transaction." />
    } @else {
      <!-- Summary Bar -->
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-label">Showing</span>
          <span class="summary-value">{{ displayedTransactions().length }} records</span>
        </div>
      </div>

      <!-- Table -->
      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Segment</th>
                <th>Category</th>
                <th>Amount</th>
                <th class="hide-mobile">Paid Via</th>
                <th class="hide-mobile">By</th>
                <th class="hide-mobile">Description</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (txn of displayedTransactions(); track txn.id) {
                <tr (click)="viewDetail(txn.id)" class="clickable-row">
                  <td class="date-cell">{{ txn.date.toDate() | date:'dd MMM yyyy' }}</td>
                  <td>
                    <span class="type-badge" [class]="txn.type">
                      <mat-icon class="type-icon">{{ txn.type === 'expense' ? 'arrow_downward' : 'arrow_upward' }}</mat-icon>
                      {{ txn.type }}
                    </span>
                    @if (txn.type === 'income') {
                      <span class="dist-chip" [class]="getDistStatus(txn)">{{ getDistLabel(txn) }}</span>
                      @if (txn.paymentStatus === 'pending') {
                        <span class="pay-status-chip pending">Pending</span>
                      }
                    }
                  </td>
                  <td>{{ txn.segmentName }}</td>
                  <td>{{ txn.categoryName }}</td>
                  <td class="amount-cell" [class]="txn.type">{{ txn.amount | currencyInr }}</td>
                  <td class="hide-mobile">
                    <span class="payment-badge" [class]="txn.paymentMethod || 'cash'">{{ (txn.paymentMethod || 'cash') | uppercase }}</span>
                  </td>
                  <td class="by-cell hide-mobile">{{ txn.paidByName || txn.createdByName }}</td>
                  <td class="desc-cell hide-mobile">{{ txn.description || '-' }}</td>
                  <td class="actions-cell" (click)="$event.stopPropagation()">
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
      </mat-card>

      @if (hasMore()) {
        <div class="load-more">
          <button mat-stroked-button (click)="loadMore()">
            <mat-icon>expand_more</mat-icon> Load More
          </button>
        </div>
      }
    }
  `,
  styles: [`
    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;
    }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; font-weight: 700; }
    .subtitle { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }

    .filter-card { margin-bottom: 1.25rem; padding: 1rem 1.25rem; }
    .filter-header {
      display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
      font-size: 0.85rem; font-weight: 600; color: #475569;
    }
    .filter-header mat-icon { font-size: 18px; width: 18px; height: 18px; color: #94a3b8; }
    .clear-btn { margin-left: auto; font-size: 0.8rem; color: #4f46e5; }
    .filters { display: flex; gap: 1rem; flex-wrap: wrap; }
    .filter-field { flex: 1; min-width: 180px; }
    .search-field { min-width: 250px; }

    .summary-bar {
      display: flex; gap: 1rem; margin-bottom: 0.75rem; padding: 0 4px;
    }
    .summary-item { display: flex; gap: 6px; align-items: center; }
    .summary-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
    .summary-value { font-size: 0.85rem; color: #1e293b; font-weight: 600; }

    .table-card { padding: 0; overflow: hidden; }
    .table-container { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th {
      background: #f8fafc; padding: 12px 14px; text-align: left;
      font-size: 0.7rem; text-transform: uppercase; color: #64748b;
      font-weight: 700; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0;
      white-space: nowrap;
    }
    .data-table td {
      padding: 14px 14px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem;
      color: #334155; vertical-align: middle;
    }
    .clickable-row { cursor: pointer; transition: background 0.15s; }
    .clickable-row:hover { background: #f8fafc; }

    .date-cell { white-space: nowrap; color: #64748b; font-size: 0.8rem; }

    .type-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: 20px; font-size: 0.7rem;
      font-weight: 700; text-transform: uppercase;
    }
    .type-badge .type-icon { font-size: 14px; width: 14px; height: 14px; }
    .type-badge.expense { background: #fef2f2; color: #dc2626; }
    .type-badge.income { background: #f0fdf4; color: #16a34a; }

    .amount-cell { font-weight: 700; white-space: nowrap; font-size: 0.9rem; }
    .amount-cell.expense { color: #dc2626; }
    .amount-cell.income { color: #16a34a; }

    .payment-badge {
      padding: 3px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 700;
      letter-spacing: 0.05em;
    }
    .payment-badge.cash { background: #fef3c7; color: #d97706; }
    .payment-badge.upi { background: #dbeafe; color: #2563eb; }

    .by-cell { font-size: 0.8rem; color: #475569; white-space: nowrap; }
    .desc-cell {
      max-width: 180px; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; color: #94a3b8; font-size: 0.8rem;
    }

    .actions-th { text-align: center; }
    .actions-cell { white-space: nowrap; text-align: center; }
    .actions-cell button { opacity: 0.6; }
    .clickable-row:hover .actions-cell button { opacity: 1; }

    .dist-chip {
      display: inline-block; margin-left: 6px; padding: 2px 6px;
      border-radius: 4px; font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; vertical-align: middle;
    }
    .dist-chip.full { background: #f0fdf4; color: #16a34a; }
    .dist-chip.partial { background: #fef3c7; color: #d97706; }
    .dist-chip.none { background: #f1f5f9; color: #94a3b8; }

    .pay-status-chip {
      display: inline-block; margin-left: 6px; padding: 2px 6px;
      border-radius: 4px; font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; vertical-align: middle;
    }
    .pay-status-chip.pending { background: #fef2f2; color: #dc2626; }

    .load-more { text-align: center; padding: 1.5rem; }
    .load-more button { padding: 8px 24px; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .filter-field { min-width: 0; flex-basis: 100%; }
      .search-field { min-width: 0; }
      .filter-card { padding: 0.75rem; }
    }
    @media (max-width: 640px) {
      .hide-mobile { display: none; }
    }
  `],
})
export class TransactionListComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);

  transactions = signal<Transaction[]>([]);
  segments = signal<Segment[]>([]);
  loading = signal(true);
  hasMore = signal(false);
  private lastDoc: any = null;

  filterType = '';
  filterSegment = '';
  filterMonth = '';
  filterPaymentStatus = '';
  searchTerm = '';

  // Generate last 12 months for month filter
  availableMonths = this.generateMonths(12);

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
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

  displayedTransactions(): Transaction[] {
    let filtered = this.transactions();

    if (this.filterPaymentStatus) {
      filtered = filtered.filter(txn => {
        if (this.filterPaymentStatus === 'pending') return txn.paymentStatus === 'pending';
        return txn.type === 'expense' || txn.paymentStatus !== 'pending';
      });
    }

    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return filtered;
    return filtered.filter(txn =>
      txn.description?.toLowerCase().includes(term) ||
      txn.paidByName?.toLowerCase().includes(term) ||
      txn.createdByName?.toLowerCase().includes(term) ||
      txn.categoryName?.toLowerCase().includes(term) ||
      txn.segmentName?.toLowerCase().includes(term) ||
      txn.amount.toString().includes(term)
    );
  }

  clearFilters(): void {
    this.filterType = '';
    this.filterSegment = '';
    this.filterMonth = '';
    this.filterPaymentStatus = '';
    this.searchTerm = '';
    this.loadData();
  }

  addNew(): void {
    this.router.navigate(['/transactions/new']);
  }

  viewDetail(id: string): void {
    this.router.navigate(['/transactions', id]);
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

  getDistStatus(txn: Transaction): string {
    if (!txn.distributions?.length) return 'none';
    const total = txn.distributions.reduce((s, d) => s + d.amount, 0);
    return total >= txn.amount ? 'full' : 'partial';
  }

  getDistLabel(txn: Transaction): string {
    const status = this.getDistStatus(txn);
    if (status === 'full') return 'Distributed';
    if (status === 'partial') return 'Partial';
    return 'Undistributed';
  }

  private generateMonths(count: number): { value: string; label: string }[] {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = getMonthString(d);
      const label = d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long' });
      months.push({ value, label });
    }
    return months;
  }
}
