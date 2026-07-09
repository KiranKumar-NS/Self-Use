import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HarvestService } from '../../../core/services/harvest.service';
import { Harvest } from '../../../core/models/harvest.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { HarvestFormDialogComponent } from '../harvest-form-dialog/harvest-form-dialog.component';
import { sortData, toggleSortState, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-harvest-list',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Harvests</h1>
        <p class="subtitle">Track harvest records, sales, and inventory</p>
      </div>
      <button mat-flat-button color="primary" (click)="addHarvest()">
        <mat-icon>add</mat-icon> <span class="btn-label">Record Harvest</span>
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (harvests().length === 0) {
      <app-empty-state icon="🌾" title="No harvests yet" message="Record your first harvest to start tracking." actionLabel="Record Harvest" (actionClick)="addHarvest()" />
    } @else {
      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="sortable" (click)="toggleSort('harvestDate')">Harvest Date</th>
                <th class="sortable" (click)="toggleSort('cropName')">Crop</th>
                <th class="sortable" (click)="toggleSort('totalQuantity')">Quantity</th>
                <th>Remaining</th>
                <th>Status</th>
                <th class="sortable" (click)="toggleSort('totalRevenue')">Revenue</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (harvest of paginatedHarvests(); track harvest.id) {
                <tr (click)="viewDetail(harvest.id)" class="clickable-row">
                  <td class="date-cell">{{ harvest.harvestDate.toDate() | date:'dd MMM yyyy' }}</td>
                  <td><strong>{{ harvest.cropName }}</strong>{{ harvest.variety ? ' (' + harvest.variety + ')' : '' }}</td>
                  <td>{{ harvest.totalQuantity }} {{ harvest.unit }}</td>
                  <td>{{ harvest.remainingQuantity }}/{{ harvest.totalQuantity }} {{ harvest.unit }}</td>
                  <td><span class="status-badge" [attr.data-status]="harvest.status">{{ formatStatus(harvest.status) }}</span></td>
                  <td class="amount-cell">{{ harvest.totalRevenue | currencyInr }}</td>
                  <td class="actions-cell" (click)="$event.stopPropagation()">
                    <button mat-icon-button (click)="editHarvest(harvest)" title="Edit"><mat-icon>edit</mat-icon></button>
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
          <span class="page-info">{{ pageStartNum() }}-{{ pageEndNum() }} of {{ displayedHarvests().length }}</span>
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
    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.82rem;
      font-weight: 600;
    }
    .status-badge[data-status="harvested"] { background: #e3f2fd; color: #1565c0; }
    .status-badge[data-status="in_storage"] { background: #fff3e0; color: #e65100; }
    .status-badge[data-status="partially_sold"] { background: #f3e5f5; color: #7b1fa2; }
    .status-badge[data-status="fully_sold"] { background: #e8f5e9; color: #2e7d32; }
    .amount-cell { font-weight: 600; color: var(--color-income); }
  `],
})
export class HarvestListComponent implements OnInit {
  private harvestService = inject(HarvestService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  harvests = signal<Harvest[]>([]);
  loading = signal(true);

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.harvests.set(await this.harvestService.getAll());
    this.loading.set(false);
  }

  displayedHarvests(): Harvest[] {
    return sortData(this.harvests(), this.sortColumn, this.sortDirection);
  }

  paginatedHarvests(): Harvest[] { return paginate(this.displayedHarvests(), this.currentPage, this.pageSize); }
  totalPagesNum(): number { return totalPages(this.displayedHarvests().length, this.pageSize); }
  pageStartNum(): number { return pageStart(this.displayedHarvests().length, this.currentPage, this.pageSize); }
  pageEndNum(): number { return pageEnd(this.displayedHarvests().length, this.currentPage, this.pageSize); }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  viewDetail(id: string): void { this.router.navigate(['/harvests', id]); }

  addHarvest(): void {
    const ref = this.dialog.open(HarvestFormDialogComponent, { width: '90vw', maxWidth: '600px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Harvest recorded', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  editHarvest(harvest: Harvest): void {
    const ref = this.dialog.open(HarvestFormDialogComponent, { width: '90vw', maxWidth: '600px', data: { harvest } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Harvest updated', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }
}
