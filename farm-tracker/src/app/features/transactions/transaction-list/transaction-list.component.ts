import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
import { DateRangeFilterComponent, DateRangeSelection } from '../../../shared/components/date-range-filter/date-range-filter.component';
import { sortData, toggleSortState, getSortIndicator, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { getMonthString } from '../../../core/utils/date.utils';
import { normalizeName } from '../../../core/utils/name.utils';

@Component({
  selector: 'app-transaction-list',
  standalone: true,
  imports: [
    FormsModule, DatePipe, UpperCasePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent, DateRangeFilterComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatSnackBarModule,
  ],
  template: `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>Transactions</h1>
        <p class="subtitle">Track all income and expenses</p>
      </div>
      <button mat-flat-button color="primary" (click)="addNew()">
        <mat-icon>add</mat-icon> <span class="btn-label">Add Transaction</span>
      </button>
    </div>

    <!-- Date Range Filter -->
    <app-date-range-filter (rangeChange)="onRangeChange($event)" />

    <!-- Filters -->
    <mat-card class="filter-card">
      <div class="filter-header" (click)="filtersOpen = !filtersOpen">
        <mat-icon>filter_list</mat-icon>
        <span>Filters</span>
        @if (activeFilterCount() > 0) {
          <span class="filter-count">{{ activeFilterCount() }} active</span>
        }
        @if (filterType || filterSegment || filterPaidBy || filterPaymentStatus || searchTerm) {
          <button mat-button class="clear-btn" (click)="clearFilters(); $event.stopPropagation()">Clear All</button>
        }
        <mat-icon class="toggle-icon" [class.expanded]="filtersOpen">expand_more</mat-icon>
      </div>
      <div class="filters" [class.collapsed]="!filtersOpen">
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
          <mat-label>Paid By</mat-label>
          <mat-select [(ngModel)]="filterPaidBy">
            <mat-option value="">All People</mat-option>
            @for (p of paidByList(); track p) {
              <mat-option [value]="p">{{ p }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Payment</mat-label>
          <mat-select [(ngModel)]="filterPaymentStatus">
            <mat-option value="">All</mat-option>
            <mat-option value="received">Received</mat-option>
            <mat-option value="pending">Pending</mat-option>
            <mat-option value="paid">Paid</mat-option>
            <mat-option value="credit">Credit (Unpaid)</mat-option>
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
      <app-empty-state icon="📋" title="No transactions" message="No transactions found. Try changing the filters or add a new transaction." actionLabel="Add Transaction" (actionClick)="addNew()" />
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
          <table class="data-table data-table--wide">
            <thead>
              <tr>
                <th class="sortable" (click)="toggleSort('date')" [attr.aria-sort]="sortColumn === 'date' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : null">Date <span class="sort-icon">{{ getSortIcon('date') }}</span></th>
                <th class="sortable" (click)="toggleSort('type')" [attr.aria-sort]="sortColumn === 'type' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : null">Type <span class="sort-icon">{{ getSortIcon('type') }}</span></th>
                <th class="sortable" (click)="toggleSort('segmentName')" [attr.aria-sort]="sortColumn === 'segmentName' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : null">Segment <span class="sort-icon">{{ getSortIcon('segmentName') }}</span></th>
                <th class="sortable" (click)="toggleSort('categoryName')" [attr.aria-sort]="sortColumn === 'categoryName' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : null">Category <span class="sort-icon">{{ getSortIcon('categoryName') }}</span></th>
                <th class="sortable" (click)="toggleSort('amount')" [attr.aria-sort]="sortColumn === 'amount' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : null">Amount <span class="sort-icon">{{ getSortIcon('amount') }}</span></th>
                <th>Paid Via</th>
                <th class="sortable" (click)="toggleSort('paidByName')" [attr.aria-sort]="sortColumn === 'paidByName' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : null">By <span class="sort-icon">{{ getSortIcon('paidByName') }}</span></th>
                <th>Description</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (txn of paginatedTransactions(); track txn.id) {
                <tr (click)="viewDetail(txn.id)" class="clickable-row" [class.income-row]="txn.type === 'income'" [class.expense-row]="txn.type === 'expense'">
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
                    @if (txn.type === 'expense' && txn.expensePaymentStatus === 'pending') {
                      <span class="pay-status-chip credit">Credit</span>
                    }
                  </td>
                  <td>{{ txn.segmentName }}</td>
                  <td>{{ txn.categoryName }}</td>
                  <td class="amount-cell" [class]="txn.type">
                    {{ txn.amount | currencyInr }}
                    @if (txn.quantity) {
                      <span class="qty-info">{{ txn.quantity }} {{ txn.unit || '' }} × {{ txn.ratePerUnit | currencyInr }}/{{ txn.unit || 'unit' }}</span>
                    }
                  </td>
                  <td>
                    <span class="payment-badge" [class]="txn.paymentMethod || 'cash'">{{ (txn.paymentMethod || 'cash') | uppercase }}</span>
                  </td>
                  <td class="by-cell">{{ txn.paidByName || txn.createdByName }}</td>
                  <td class="desc-cell">{{ txn.description || '-' }}</td>
                  <td class="actions-cell" (click)="$event.stopPropagation()">
                    <button mat-icon-button (click)="edit(txn.id)" title="Edit" aria-label="Edit transaction">
                      <mat-icon>edit</mat-icon>
                    </button>
                    @if (auth.isAdmin()) {
                      <button mat-icon-button color="warn" (click)="confirmDelete(txn)" title="Delete" aria-label="Delete transaction">
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <!-- Pagination -->
        <div class="pagination">
          <div class="page-size">
            <span>Rows per page:</span>
            <select [(ngModel)]="pageSize" (change)="currentPage = 1">
              <option [ngValue]="10">10</option>
              <option [ngValue]="20">20</option>
              <option [ngValue]="50">50</option>
            </select>
          </div>
          <span class="page-info">{{ pageStart() }}–{{ pageEnd() }} of {{ displayedTransactions().length }}</span>
          <div class="page-buttons">
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = 1" title="First page" aria-label="First page">
              <mat-icon>first_page</mat-icon>
            </button>
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = currentPage - 1" title="Previous page" aria-label="Previous page">
              <mat-icon>chevron_left</mat-icon>
            </button>
            <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = currentPage + 1" title="Next page" aria-label="Next page">
              <mat-icon>chevron_right</mat-icon>
            </button>
            <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = totalPages()" title="Last page" aria-label="Last page">
              <mat-icon>last_page</mat-icon>
            </button>
          </div>
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
    .search-field { min-width: 250px; }
    .filter-header { cursor: pointer; }
    .filter-count {
      font-size: 0.7rem; background: var(--color-primary); color: white;
      padding: 1px 8px; border-radius: 10px; font-weight: 600;
    }
    .toggle-icon {
      margin-left: auto; transition: transform 0.2s; color: var(--color-text-muted);
      font-size: 20px; width: 20px; height: 20px;
    }
    .toggle-icon.expanded { transform: rotate(180deg); }
    .filters.collapsed { display: none; }

    .summary-bar { display: flex; gap: 1rem; margin-bottom: 0.75rem; padding: 0 4px; }
    .summary-item { display: flex; gap: 6px; align-items: center; }
    .summary-label { font-size: var(--font-sm); color: var(--color-text-muted); text-transform: uppercase; }
    .summary-value { font-size: var(--font-base); color: var(--color-text); font-weight: 600; }

    .type-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border-radius: var(--radius-full); font-size: 0.7rem;
      font-weight: 700; text-transform: uppercase;
    }
    .type-badge .type-icon { font-size: 14px; width: 14px; height: 14px; }
    .type-badge.expense { background: var(--color-expense-bg); color: var(--color-expense); }
    .type-badge.income { background: var(--color-income-bg); color: var(--color-income); }

    .amount-cell.expense { color: var(--color-expense); }
    .amount-cell.income { color: var(--color-income); }
    .qty-info { display: block; font-size: var(--font-xs); font-weight: 500; color: var(--color-text-muted); }

    .by-cell { font-size: 0.8rem; color: var(--color-text-subtle); white-space: nowrap; }
    .desc-cell { max-width: 180px; }

    .clickable-row:hover .actions-cell button { opacity: 1; }
    .income-row td:first-child { border-left: 3px solid var(--color-income); }
    .expense-row td:first-child { border-left: 3px solid var(--color-expense); }

    .dist-chip {
      display: inline-block; margin-left: 6px; padding: 2px 6px;
      border-radius: var(--radius-sm); font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; vertical-align: middle;
    }
    .dist-chip.full { background: var(--color-income-bg); color: var(--color-income); }
    .dist-chip.partial { background: var(--color-warning-light); color: var(--color-warning); }
    .dist-chip.none { background: var(--color-bg-alt); color: var(--color-text-muted); }

    .pay-status-chip {
      display: inline-block; margin-left: 6px; padding: 2px 6px;
      border-radius: var(--radius-sm); font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; vertical-align: middle;
    }
    .pay-status-chip.pending { background: var(--color-expense-bg); color: var(--color-expense); }
    .pay-status-chip.credit { background: var(--color-warning-light); color: var(--color-warning); }

    .load-more { text-align: center; padding: 1.5rem; }
    .load-more button { padding: 8px 24px; }
    @media (max-width: 768px) {
      .search-field { min-width: 0; }
    }
  `],
})
export class TransactionListComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  auth = inject(AuthService);

  transactions = signal<Transaction[]>([]);
  segments = signal<Segment[]>([]);
  loading = signal(true);
  hasMore = signal(false);
  private lastDoc: any = null;

  filtersOpen = window.innerWidth > 768;
  filterType = '';
  filterSegment = '';
  filterPaidBy = '';
  filterPaymentStatus = '';
  searchTerm = '';
  paidByList = signal<string[]>([]);

  // Date range state
  private currentSelection: DateRangeSelection = { mode: 'monthly', month: getMonthString(new Date()) };

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.filterType) count++;
    if (this.filterSegment) count++;
    if (this.filterPaidBy) count++;
    if (this.filterPaymentStatus) count++;
    if (this.searchTerm) count++;
    return count;
  });

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  displayedTransactions(): Transaction[] {
    let filtered = this.transactions();

    // Client-side month range filter for custom/alltime modes
    if (this.currentSelection.mode === 'custom') {
      filtered = filtered.filter(txn =>
        txn.month >= this.currentSelection.fromMonth! && txn.month <= this.currentSelection.toMonth!
      );
    }

    if (this.filterPaidBy) {
      filtered = filtered.filter(txn => normalizeName(txn.paidByName || txn.createdByName || 'Unknown') === this.filterPaidBy);
    }

    if (this.filterPaymentStatus) {
      filtered = filtered.filter(txn => {
        if (this.filterPaymentStatus === 'pending') return txn.paymentStatus === 'pending';
        if (this.filterPaymentStatus === 'received') return txn.type === 'income' && txn.paymentStatus !== 'pending';
        if (this.filterPaymentStatus === 'credit') return txn.type === 'expense' && txn.expensePaymentStatus === 'pending';
        if (this.filterPaymentStatus === 'paid') return txn.type === 'expense' && txn.expensePaymentStatus !== 'pending';
        return true;
      });
    }

    const term = this.searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(txn =>
        txn.description?.toLowerCase().includes(term) ||
        txn.paidByName?.toLowerCase().includes(term) ||
        txn.createdByName?.toLowerCase().includes(term) ||
        txn.categoryName?.toLowerCase().includes(term) ||
        txn.segmentName?.toLowerCase().includes(term) ||
        txn.amount.toString().includes(term)
      );
    }

    return sortData(filtered, this.sortColumn, this.sortDirection);
  }

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
  }

  async onRangeChange(selection: DateRangeSelection): Promise<void> {
    this.currentSelection = selection;
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.lastDoc = null;
    this.currentPage = 1;
    const filters: any = {};
    if (this.filterType) filters.type = this.filterType;
    if (this.filterSegment) filters.segment = this.filterSegment;

    // Use server-side month filter only for single month mode
    if (this.currentSelection.mode === 'monthly') {
      filters.month = this.currentSelection.month;
    }

    const limit = this.currentSelection.mode === 'monthly' ? 20 : 200;
    const result = await this.transactionService.getAll(filters, limit);
    this.transactions.set(result.transactions);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.transactions.length === limit);
    this.paidByList.set([...new Set(result.transactions.map(t => normalizeName(t.paidByName || t.createdByName || 'Unknown')))].sort());
    this.loading.set(false);
  }

  async loadMore(): Promise<void> {
    const filters: any = {};
    if (this.filterType) filters.type = this.filterType;
    if (this.filterSegment) filters.segment = this.filterSegment;
    if (this.currentSelection.mode === 'monthly') {
      filters.month = this.currentSelection.month;
    }

    const limit = this.currentSelection.mode === 'monthly' ? 20 : 200;
    const result = await this.transactionService.getAll(filters, limit, this.lastDoc);
    this.transactions.update((prev) => [...prev, ...result.transactions]);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.transactions.length === limit);
  }

  paginatedTransactions(): Transaction[] {
    return paginate(this.displayedTransactions(), this.currentPage, this.pageSize);
  }

  totalPages(): number {
    return totalPages(this.displayedTransactions().length, this.pageSize);
  }

  pageStart(): number {
    return pageStart(this.displayedTransactions().length, this.currentPage, this.pageSize);
  }

  pageEnd(): number {
    return pageEnd(this.displayedTransactions().length, this.currentPage, this.pageSize);
  }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  getSortIcon(column: string): string {
    return getSortIndicator(this.sortColumn, this.sortDirection, column);
  }

  clearFilters(): void {
    this.filterType = '';
    this.filterSegment = '';
    this.filterPaidBy = '';
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
        showDeleteOptions: true,
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        if (result.deleteType === 'hard') {
          await this.transactionService.hardDelete(txn.id);
        } else {
          await this.transactionService.softDelete(txn.id);
        }
        this.snackBar.open('Transaction deleted', '', { duration: 2500 });
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
}
