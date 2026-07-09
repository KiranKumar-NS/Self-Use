import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { SupplierService } from '../../../core/services/supplier.service';
import { Supplier } from '../../../core/models/supplier.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SupplierFormDialogComponent } from '../supplier-form-dialog/supplier-form-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { sortData, toggleSortState, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule, MatInputModule, MatFormFieldModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Suppliers</h1>
        <p class="subtitle">Manage suppliers and track order history</p>
      </div>
      <button mat-flat-button color="primary" (click)="addSupplier()">
        <mat-icon>add</mat-icon> <span class="btn-label">Add Supplier</span>
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (suppliers().length === 0) {
      <app-empty-state icon="🏭" title="No suppliers yet" message="Add your first supplier to start tracking orders." actionLabel="Add Supplier" (actionClick)="addSupplier()" />
    } @else {
      <!-- Search -->
      <mat-card class="filter-card">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="searchTerm" placeholder="Name, phone, location..." />
          @if (searchTerm) {
            <button matSuffix mat-icon-button (click)="searchTerm = ''"><mat-icon>close</mat-icon></button>
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
                <th>GST</th>
                <th class="sortable" (click)="toggleSort('totalOrders')">Total Orders</th>
                <th class="sortable" (click)="toggleSort('totalAmountPaid')">Total Paid</th>
                <th class="sortable" (click)="toggleSort('pendingAmount')">Pending</th>
                <th class="sortable" (click)="toggleSort('averageRate')">Avg Rate</th>
                <th class="sortable" (click)="toggleSort('lastOrderDate')">Last Order</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (supplier of paginatedSuppliers(); track supplier.id) {
                <tr>
                  <td class="name-cell"><strong>{{ supplier.name }}</strong></td>
                  <td>{{ supplier.phone || '-' }}</td>
                  <td>{{ supplier.location || '-' }}</td>
                  <td>{{ supplier.gstNumber || '-' }}</td>
                  <td class="count-cell">{{ supplier.totalOrders }}</td>
                  <td class="amount-cell">{{ supplier.totalAmountPaid | currencyInr }}</td>
                  <td class="pending-cell">{{ supplier.pendingAmount | currencyInr }}</td>
                  <td>{{ supplier.averageRate ? (supplier.averageRate | currencyInr) : '-' }}</td>
                  <td class="date-cell">{{ supplier.lastOrderDate ? (supplier.lastOrderDate.toDate() | date:'dd MMM yyyy') : '-' }}</td>
                  <td class="actions-cell">
                    <button mat-icon-button (click)="editSupplier(supplier)" title="Edit"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button color="warn" (click)="confirmDelete(supplier)" title="Delete"><mat-icon>delete</mat-icon></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="pagination">
          <div class="page-size">
            <span>Rows per page:</span>
            <select [(ngModel)]="pageSize" (change)="currentPage = 1">
              <option [ngValue]="10">10</option>
              <option [ngValue]="20">20</option>
              <option [ngValue]="50">50</option>
            </select>
          </div>
          <span class="page-info">{{ pageStartNum() }}-{{ pageEndNum() }} of {{ displayedSuppliers().length }}</span>
          <div class="page-buttons">
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = 1" aria-label="First"><mat-icon>first_page</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = currentPage - 1" aria-label="Prev"><mat-icon>chevron_left</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage >= totalPagesNum()" (click)="currentPage = currentPage + 1" aria-label="Next"><mat-icon>chevron_right</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage >= totalPagesNum()" (click)="currentPage = totalPagesNum()" aria-label="Last"><mat-icon>last_page</mat-icon></button>
          </div>
        </div>
      </mat-card>
    }
  `,
  styles: [`
    .name-cell { font-weight: 600; }
    .count-cell { font-weight: 700; color: var(--color-primary); }
    .amount-cell { font-weight: 600; color: var(--color-income); }
    .pending-cell { font-weight: 600; color: var(--color-expense); }
  `],
})
export class SupplierListComponent implements OnInit {
  private supplierService = inject(SupplierService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  suppliers = signal<Supplier[]>([]);
  loading = signal(true);
  searchTerm = '';

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.suppliers.set(await this.supplierService.getAll());
    this.loading.set(false);
  }

  displayedSuppliers(): Supplier[] {
    let filtered = this.suppliers();
    const term = this.searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(term) ||
        s.phone?.toLowerCase().includes(term) ||
        s.location?.toLowerCase().includes(term)
      );
    }
    return sortData(filtered, this.sortColumn, this.sortDirection);
  }

  paginatedSuppliers(): Supplier[] { return paginate(this.displayedSuppliers(), this.currentPage, this.pageSize); }
  totalPagesNum(): number { return totalPages(this.displayedSuppliers().length, this.pageSize); }
  pageStartNum(): number { return pageStart(this.displayedSuppliers().length, this.currentPage, this.pageSize); }
  pageEndNum(): number { return pageEnd(this.displayedSuppliers().length, this.currentPage, this.pageSize); }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  addSupplier(): void {
    const ref = this.dialog.open(SupplierFormDialogComponent, { width: '90vw', maxWidth: '500px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Supplier added', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  editSupplier(supplier: Supplier): void {
    const ref = this.dialog.open(SupplierFormDialogComponent, { width: '90vw', maxWidth: '500px', data: { supplier } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Supplier updated', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  async confirmDelete(supplier: Supplier): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Supplier', message: `Delete "${supplier.name}"?`, confirmText: 'Delete' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        await this.supplierService.softDelete(supplier.id);
        this.snackBar.open('Supplier deleted', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }
}
