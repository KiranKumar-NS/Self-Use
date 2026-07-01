import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../../../core/services/loan.service';
import { AuthService } from '../../../core/services/auth.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Loan } from '../../../core/models/loan.model';
import { Segment } from '../../../core/models/segment.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { sortData, toggleSortState, getSortIndicator, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-loan-list',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe, LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatChipsModule,
  ],
  template: `
    <div class="page-header">
      <h1>Owe & Lent</h1>
      <button mat-flat-button color="primary" (click)="addNew()">
        <mat-icon>add</mat-icon> Add Entry
      </button>
    </div>

    <mat-card class="filter-card">
      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="filterType" (selectionChange)="loadData()">
            <mat-option value="">All</mat-option>
            <mat-option value="given">Lent (We gave)</mat-option>
            <mat-option value="received">Owed (We borrowed)</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="filterStatus" (selectionChange)="loadData()">
            <mat-option value="">All</mat-option>
            <mat-option value="pending">Pending</mat-option>
            <mat-option value="partial">Partial</mat-option>
            <mat-option value="completed">Completed</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="filterSegment" (selectionChange)="loadData()">
            <mat-option value="">All</mat-option>
            <mat-option value="personal">Personal</mat-option>
            @for (seg of segments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
    </mat-card>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (loans().length === 0) {
      <app-empty-state icon="🏦" title="No records" message="No owe or lent records found." />
    } @else {
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable" (click)="toggleSort('date')">Date <span class="sort-icon">{{ getSortIcon('date') }}</span></th>
              <th class="sortable" (click)="toggleSort('type')">Type <span class="sort-icon">{{ getSortIcon('type') }}</span></th>
              <th class="sortable" (click)="toggleSort('personName')">Person <span class="sort-icon">{{ getSortIcon('personName') }}</span></th>
              <th class="sortable" (click)="toggleSort('amount')">Amount <span class="sort-icon">{{ getSortIcon('amount') }}</span></th>
              <th class="sortable" (click)="toggleSort('totalRepaid')">Repaid <span class="sort-icon">{{ getSortIcon('totalRepaid') }}</span></th>
              <th class="sortable" (click)="toggleSort('balanceRemaining')">Balance <span class="sort-icon">{{ getSortIcon('balanceRemaining') }}</span></th>
              <th class="sortable" (click)="toggleSort('repaymentStatus')">Status <span class="sort-icon">{{ getSortIcon('repaymentStatus') }}</span></th>
              <th class="hide-mobile">Segment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (loan of paginatedLoans(); track loan.id) {
              <tr>
                <td>{{ loan.date.toDate() | date:'dd MMM yyyy' }}</td>
                <td>
                  <span class="type-badge" [class]="loan.type">{{ loan.type === 'given' ? 'Lent' : 'Owed' }}</span>
                </td>
                <td>{{ loan.personName }}</td>
                <td class="amount">{{ loan.amount | currencyInr }}</td>
                <td class="hide-mobile">{{ loan.totalRepaid | currencyInr }}</td>
                <td class="balance">{{ loan.balanceRemaining | currencyInr }}</td>
                <td>
                  <span class="status-badge" [class]="loan.repaymentStatus">{{ loan.repaymentStatus }}</span>
                </td>
                <td class="hide-mobile">
                  <span class="segment-tag" [class.personal]="loan.segment === 'personal' || !loan.segment">{{ loan.segmentName || 'Personal' }}</span>
                </td>
                <td>
                  <button mat-icon-button (click)="viewDetail(loan.id)" title="View">
                    <mat-icon>visibility</mat-icon>
                  </button>
                  @if (loan.repaymentStatus === 'pending') {
                    <button mat-icon-button (click)="edit(loan.id)" title="Edit">
                      <mat-icon>edit</mat-icon>
                    </button>
                  }
                  @if (auth.isAdmin()) {
                    <button mat-icon-button color="warn" (click)="confirmDelete(loan)" title="Delete">
                      <mat-icon>delete</mat-icon>
                    </button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
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
          <span class="page-info">{{ pageStart() }}–{{ pageEnd() }} of {{ sortedLoans().length }}</span>
          <div class="page-buttons">
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = 1"><mat-icon>first_page</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = currentPage - 1"><mat-icon>chevron_left</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = currentPage + 1"><mat-icon>chevron_right</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = totalPages()"><mat-icon>last_page</mat-icon></button>
          </div>
        </div>
      </div>

      @if (hasMore()) {
        <div class="load-more">
          <button mat-stroked-button (click)="loadMore()">Load More</button>
        </div>
      }
    }
  `,
  styles: [`
    .filters mat-form-field { flex: 1; min-width: 150px; }
    .table-container { background: white; border-radius: var(--radius-md); overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .type-badge { padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--font-sm); font-weight: 600; }
    .type-badge.given { background: var(--color-warning-light); color: var(--color-warning); }
    .type-badge.received { background: var(--color-info-light); color: var(--color-info); }
    .status-badge { padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--font-sm); font-weight: 600; text-transform: capitalize; }
    .status-badge.pending { background: var(--color-expense-bg); color: var(--color-expense); }
    .status-badge.partial { background: var(--color-warning-light); color: var(--color-warning); }
    .status-badge.completed { background: var(--color-income-bg); color: var(--color-income); }
    .amount { font-weight: 600; }
    .balance { color: var(--color-expense); font-weight: 600; }
    .segment-tag { font-size: 0.8rem; }
    .segment-tag.personal { color: var(--color-purple); font-style: italic; }
    .load-more { text-align: center; padding: 1rem; }
    @media (max-width: 768px) {
      .filters mat-form-field { min-width: 0; flex-basis: 100%; }
    }
  `],
})
export class LoanListComponent implements OnInit {
  private loanService = inject(LoanService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);

  loans = signal<Loan[]>([]);
  segments = signal<Segment[]>([]);
  loading = signal(true);
  hasMore = signal(false);
  private lastDoc: any = null;

  filterType = '';
  filterStatus = '';
  filterSegment = '';

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.lastDoc = null;
    this.currentPage = 1;
    const filters: any = {};
    if (this.filterType) filters.type = this.filterType;
    if (this.filterStatus) filters.repaymentStatus = this.filterStatus;
    if (this.filterSegment) filters.segment = this.filterSegment;

    const result = await this.loanService.getAll(filters, 20);
    this.loans.set(result.loans);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.loans.length === 20);
    this.loading.set(false);
  }

  async loadMore(): Promise<void> {
    const filters: any = {};
    if (this.filterType) filters.type = this.filterType;
    if (this.filterStatus) filters.repaymentStatus = this.filterStatus;
    if (this.filterSegment) filters.segment = this.filterSegment;

    const result = await this.loanService.getAll(filters, 20, this.lastDoc);
    this.loans.update((prev) => [...prev, ...result.loans]);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.loans.length === 20);
  }

  sortedLoans(): Loan[] {
    return sortData(this.loans(), this.sortColumn, this.sortDirection);
  }

  paginatedLoans(): Loan[] {
    return paginate(this.sortedLoans(), this.currentPage, this.pageSize);
  }

  totalPages(): number { return totalPages(this.sortedLoans().length, this.pageSize); }
  pageStart(): number { return pageStart(this.sortedLoans().length, this.currentPage, this.pageSize); }
  pageEnd(): number { return pageEnd(this.sortedLoans().length, this.currentPage, this.pageSize); }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  getSortIcon(column: string): string {
    return getSortIndicator(this.sortColumn, this.sortDirection, column);
  }

  addNew(): void { this.router.navigate(['/loans/new']); }
  viewDetail(id: string): void { this.router.navigate(['/loans', id]); }
  edit(id: string): void { this.router.navigate(['/loans', id, 'edit']); }

  async confirmDelete(loan: Loan): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Entry', message: `Delete ${loan.type === 'given' ? 'lent' : 'owed'} entry of ${loan.amount} - ${loan.personName}?`, confirmText: 'Delete', showDeleteOptions: true } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        if (result.deleteType === 'hard') {
          await this.loanService.hardDelete(loan.id);
        } else {
          await this.loanService.softDelete(loan.id);
        }
        await this.loadData();
      }
    });
  }
}
