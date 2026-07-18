import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { BuyerService } from '../../../core/services/buyer.service';
import { Buyer } from '../../../core/models/buyer.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { BuyerFormDialogComponent } from '../buyer-form-dialog/buyer-form-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { sortData, toggleSortState, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { safeLoad } from '../../../core/utils/async.utils';
import { ToastService } from '../../../core/services/toast.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-buyer-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Buyers</h1>
        <p class="subtitle">Manage customers and track purchase history</p>
      </div>
      <button mat-flat-button color="primary" (click)="addBuyer()">
        <mat-icon>add</mat-icon> <span class="btn-label">Add Buyer</span>
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (buyers().length === 0) {
      <app-empty-state icon="🤝" title="No buyers yet" message="Add your first buyer to start tracking sales." actionLabel="Add Buyer" (actionClick)="addBuyer()" />
    } @else {
      <!-- Search -->
      <mat-card class="filter-card">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="searchTerm" placeholder="Name, phone, location..." />
          @if (searchTerm()) {
            <button matSuffix mat-icon-button (click)="searchTerm.set('')" aria-label="Clear search"><mat-icon>close</mat-icon></button>
          }
        </mat-form-field>
      </mat-card>

      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="sortable" (click)="toggleSort('name')">Name</th>
                <th>Phone</th>
                <th>Location</th>
                <th class="sortable" (click)="toggleSort('totalPurchases')">Purchases</th>
                <th class="sortable" (click)="toggleSort('totalAmountPaid')">Total Value</th>
                <th class="sortable" (click)="toggleSort('averageRate')">Avg Rate</th>
                <th class="sortable" (click)="toggleSort('lastPurchaseDate')">Last Purchase</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (buyer of paginatedBuyers(); track buyer.id) {
                <tr (click)="viewDetail(buyer.id)" class="clickable-row">
                  <td class="name-cell"><strong>{{ buyer.name }}</strong></td>
                  <td>{{ buyer.phone || '-' }}</td>
                  <td>{{ buyer.location || '-' }}</td>
                  <td class="count-cell">{{ buyer.totalPurchases }}</td>
                  <td class="amount-cell">{{ buyer.totalAmountPaid | currencyInr }}</td>
                  <td>{{ buyer.averageRate ? (buyer.averageRate | currencyInr) : '-' }}</td>
                  <td class="date-cell">{{ buyer.lastPurchaseDate ? (buyer.lastPurchaseDate.toDate() | date:'dd MMM yyyy') : '-' }}</td>
                  <td class="actions-cell" (click)="$event.stopPropagation()">
                    <button mat-icon-button (click)="editBuyer(buyer)" title="Edit" aria-label="Edit buyer"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button color="warn" (click)="confirmDelete(buyer)" title="Delete" aria-label="Delete buyer"><mat-icon>delete</mat-icon></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <div class="page-size">
            <span>Rows per page:</span>
            <select [(ngModel)]="pageSize" (change)="currentPage.set(1)">
              <option [ngValue]="10">10</option>
              <option [ngValue]="20">20</option>
              <option [ngValue]="50">50</option>
            </select>
          </div>
          <span class="page-info">{{ pageStartNum() }}-{{ pageEndNum() }} of {{ displayedBuyers().length }}</span>
          <div class="page-buttons">
            <button mat-icon-button [disabled]="currentPage() === 1" (click)="currentPage.set(1)" aria-label="First"><mat-icon>first_page</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage() === 1" (click)="currentPage.set(currentPage() - 1)" aria-label="Prev"><mat-icon>chevron_left</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage() >= totalPagesNum()" (click)="currentPage.set(currentPage() + 1)" aria-label="Next"><mat-icon>chevron_right</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage() >= totalPagesNum()" (click)="currentPage.set(totalPagesNum())" aria-label="Last"><mat-icon>last_page</mat-icon></button>
          </div>
        </div>
      </mat-card>
    }
  `,
  styles: [`
    .name-cell { font-weight: 600; }
    .count-cell { font-weight: 700; color: var(--color-primary); }
    .amount-cell { font-weight: 600; color: var(--color-income); }
  `],
})
export class BuyerListComponent implements OnInit {
  private buyerService = inject(BuyerService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  buyers = signal<Buyer[]>([]);
  loading = signal(true);
  searchTerm = signal('');

  sortColumn = signal('');
  sortDirection = signal<SortDirection>('asc');
  pageSize = signal(20);
  currentPage = signal(1);

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    await safeLoad(this.loading, async () => {
      this.buyers.set(await this.buyerService.getAll());
    }, this.toast);
  }

  displayedBuyers = computed<Buyer[]>(() => {
    let filtered = this.buyers();
    const term = this.searchTerm().toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(b =>
        b.name.toLowerCase().includes(term) ||
        b.phone?.toLowerCase().includes(term) ||
        b.location?.toLowerCase().includes(term)
      );
    }
    return sortData(filtered, this.sortColumn(), this.sortDirection());
  });

  paginatedBuyers = computed<Buyer[]>(() => paginate(this.displayedBuyers(), this.currentPage(), this.pageSize()));
  totalPagesNum = computed<number>(() => totalPages(this.displayedBuyers().length, this.pageSize()));
  pageStartNum = computed<number>(() => pageStart(this.displayedBuyers().length, this.currentPage(), this.pageSize()));
  pageEndNum = computed<number>(() => pageEnd(this.displayedBuyers().length, this.currentPage(), this.pageSize()));

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn(), direction: this.sortDirection() }, column);
    this.sortColumn.set(state.column);
    this.sortDirection.set(state.direction);
    this.currentPage.set(1);
  }

  viewDetail(id: string): void { this.router.navigate(['/buyers', id]); }

  addBuyer(): void {
    const ref = this.dialog.open(BuyerFormDialogComponent, { width: '90vw', maxWidth: '500px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.toast.success('Buyer added');
        await this.loadData();
      }
    });
  }

  editBuyer(buyer: Buyer): void {
    const ref = this.dialog.open(BuyerFormDialogComponent, { width: '90vw', maxWidth: '500px', data: { buyer } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.toast.success('Buyer updated');
        await this.loadData();
      }
    });
  }

  async confirmDelete(buyer: Buyer): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Buyer', message: `Delete "${buyer.name}"?`, confirmText: 'Delete' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          await this.buyerService.softDelete(buyer.id);
          this.toast.success('Buyer deleted');
        } catch (err) {
          console.error('Failed to delete buyer', err);
          this.toast.error(err instanceof Error ? err.message : 'Failed to delete buyer');
        }
        await this.loadData();
      }
    });
  }
}
