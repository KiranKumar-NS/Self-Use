import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AnimalService } from '../../../core/services/animal.service';
import { AuthService } from '../../../core/services/auth.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Animal } from '../../../core/models/animal.model';
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
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-animal-list',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatInputModule, MatSnackBarModule,
  ],
  template: `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>Animals</h1>
        <p class="subtitle">Track individual animals and batches</p>
      </div>
      <div class="header-actions">
        <button mat-stroked-button (click)="openAnalytics()">
          <mat-icon>insights</mat-icon> <span class="btn-label">Analytics</span>
        </button>
        <button mat-flat-button color="primary" (click)="addNew()">
          <mat-icon>add</mat-icon> <span class="btn-label">Register Animal</span>
        </button>
      </div>
    </div>

    <!-- Stats -->
    @if (!loading()) {
      <div class="stats-grid">
        <mat-card class="stat-card">
          <div class="stat-value">{{ activeCount() }}</div>
          <div class="stat-label">Active</div>
        </mat-card>
        <mat-card class="stat-card">
          <div class="stat-value">{{ soldCount() }}</div>
          <div class="stat-label">Sold</div>
        </mat-card>
        <mat-card class="stat-card">
          <div class="stat-value avg-profit" [class.positive]="avgProfit() > 0" [class.negative]="avgProfit() < 0">
            {{ avgProfit() | currencyInr }}
          </div>
          <div class="stat-label">Avg Profit (sold)</div>
        </mat-card>
      </div>
    }

    <!-- Filters -->
    <mat-card class="filter-card">
      <div class="filter-header" (click)="filtersOpen = !filtersOpen">
        <mat-icon>filter_list</mat-icon>
        <span>Filters</span>
        @if (activeFilterCount() > 0) {
          <span class="filter-count">{{ activeFilterCount() }} active</span>
        }
        @if (filterSegment || filterStatus || searchTerm) {
          <button mat-button class="clear-btn" (click)="clearFilters(); $event.stopPropagation()">Clear All</button>
        }
        <mat-icon class="toggle-icon" [class.expanded]="filtersOpen">expand_more</mat-icon>
      </div>
      <div class="filters" [class.collapsed]="!filtersOpen">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="filterSegment" (selectionChange)="loadData()">
            <mat-option value="">All Segments</mat-option>
            @for (seg of animalSegments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="filterStatus" (selectionChange)="loadData()">
            <mat-option value="">All</mat-option>
            <mat-option value="active">Active</mat-option>
            <mat-option value="sold">Sold</mat-option>
            <mat-option value="dead">Dead</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="searchTerm" placeholder="Tag, name, breed..." />
          @if (searchTerm) {
            <button matSuffix mat-icon-button (click)="searchTerm = ''"><mat-icon>close</mat-icon></button>
          }
        </mat-form-field>
      </div>
    </mat-card>

    <!-- Content -->
    @if (loading()) {
      <app-loading-spinner />
    } @else if (displayedAnimals().length === 0) {
      <app-empty-state icon="🐐" title="No animals registered" message="Register your first animal or batch to start tracking costs and profits." actionLabel="Register Animal" (actionClick)="addNew()" />
    } @else {
      <div class="summary-bar">
        <div class="summary-item">
          <span class="summary-label">Showing</span>
          <span class="summary-value">{{ displayedAnimals().length }} records</span>
        </div>
      </div>

      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="sortable" (click)="toggleSort('name')">Name/Tag</th>
                <th class="sortable" (click)="toggleSort('segmentName')">Segment</th>
                <th class="sortable" (click)="toggleSort('breed')">Breed</th>
                <th class="sortable" (click)="toggleSort('status')">Status</th>
                <th class="sortable" (click)="toggleSort('originDate')">Origin Date</th>
                <th class="sortable" (click)="toggleSort('totalInvested')">Invested</th>
                <th class="sortable" (click)="toggleSort('profit')">Profit</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (animal of paginatedAnimals(); track animal.id) {
                <tr (click)="viewDetail(animal.id)" class="clickable-row">
                  <td class="name-cell">
                    <div class="animal-name">{{ animalService.getDisplayName(animal) }}</div>
                    @if (animal.trackingMode === 'batch') {
                      <span class="batch-info">{{ animal.currentCount }}/{{ animal.batchSize }} remaining</span>
                    }
                  </td>
                  <td>{{ animal.segmentName }}</td>
                  <td class="breed-cell">{{ animal.breed || '-' }}</td>
                  <td>
                    <span class="status-badge" [class]="animal.status">{{ animal.status }}</span>
                  </td>
                  <td class="date-cell">{{ animal.originDate.toDate() | date:'dd MMM yyyy' }}</td>
                  <td class="amount-cell">{{ animal.totalInvested | currencyInr }}</td>
                  <td class="profit-cell" [class.positive]="(animal.profit || 0) > 0" [class.negative]="(animal.profit || 0) < 0" [class.neutral]="animal.status === 'active'">
                    @if (animal.status === 'sold') {
                      {{ animal.profit | currencyInr }}
                      <span class="margin-info">{{ animal.profitMargin?.toFixed(0) }}%</span>
                    } @else {
                      -
                    }
                  </td>
                  <td class="actions-cell" (click)="$event.stopPropagation()">
                    <button mat-icon-button (click)="edit(animal.id)" title="Edit" aria-label="Edit animal">
                      <mat-icon>edit</mat-icon>
                    </button>
                    @if (auth.isAdmin()) {
                      <button mat-icon-button color="warn" (click)="confirmDelete(animal)" title="Delete" aria-label="Delete animal">
                        <mat-icon>delete</mat-icon>
                      </button>
                    }
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
          <span class="page-info">{{ pageStartNum() }}-{{ pageEndNum() }} of {{ displayedAnimals().length }}</span>
          <div class="page-buttons">
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = 1" aria-label="First page"><mat-icon>first_page</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = currentPage - 1" aria-label="Previous page"><mat-icon>chevron_left</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage >= totalPagesNum()" (click)="currentPage = currentPage + 1" aria-label="Next page"><mat-icon>chevron_right</mat-icon></button>
            <button mat-icon-button [disabled]="currentPage >= totalPagesNum()" (click)="currentPage = totalPagesNum()" aria-label="Last page"><mat-icon>last_page</mat-icon></button>
          </div>
        </div>
      </mat-card>
    }
  `,
  styles: [`
    .header-actions { display: flex; gap: 8px; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-card { padding: 1rem; text-align: center; }
    .stat-value { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
    .stat-label { font-size: var(--font-xs); color: var(--color-text-muted); text-transform: uppercase; font-weight: 600; }
    .avg-profit.positive { color: var(--color-income); }
    .avg-profit.negative { color: var(--color-expense); }

    .filter-header { cursor: pointer; }
    .filter-count {
      font-size: 0.7rem; background: var(--color-primary); color: white;
      padding: 1px 8px; border-radius: 10px; font-weight: 600;
    }
    .toggle-icon { margin-left: auto; transition: transform 0.2s; color: var(--color-text-muted); font-size: 20px; width: 20px; height: 20px; }
    .toggle-icon.expanded { transform: rotate(180deg); }
    .filters.collapsed { display: none; }

    .summary-bar { display: flex; gap: 1rem; margin-bottom: 0.75rem; padding: 0 4px; }
    .summary-item { display: flex; gap: 6px; align-items: center; }
    .summary-label { font-size: var(--font-sm); color: var(--color-text-muted); text-transform: uppercase; }
    .summary-value { font-size: var(--font-base); color: var(--color-text); font-weight: 600; }

    .name-cell { min-width: 120px; }
    .animal-name { font-weight: 600; color: var(--color-text); }
    .batch-info { display: block; font-size: var(--font-xs); color: var(--color-text-muted); }
    .breed-cell { font-size: 0.8rem; color: var(--color-purple); font-weight: 500; }

    .status-badge {
      padding: 3px 10px; border-radius: var(--radius-full); font-size: 0.7rem;
      font-weight: 700; text-transform: uppercase;
    }
    .status-badge.active { background: var(--color-income-bg); color: var(--color-income); }
    .status-badge.sold { background: var(--color-info-light); color: var(--color-info); }
    .status-badge.dead { background: var(--color-expense-bg); color: var(--color-expense); }

    .profit-cell { font-weight: 600; }
    .profit-cell.positive { color: var(--color-income); }
    .profit-cell.negative { color: var(--color-expense); }
    .profit-cell.neutral { color: var(--color-text-muted); }
    .margin-info { display: block; font-size: var(--font-xs); font-weight: 500; color: var(--color-text-muted); }

    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: 1fr 1fr 1fr; }
      .stat-value { font-size: 1.2rem; }
    }
    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class AnimalListComponent implements OnInit {
  animalService = inject(AnimalService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  auth = inject(AuthService);

  animals = signal<Animal[]>([]);
  segments = signal<Segment[]>([]);
  loading = signal(true);

  filtersOpen = window.innerWidth > 768;
  filterSegment = '';
  filterStatus = '';
  searchTerm = '';

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  activeFilterCount = computed(() => {
    let count = 0;
    if (this.filterSegment) count++;
    if (this.filterStatus) count++;
    if (this.searchTerm) count++;
    return count;
  });

  activeCount = computed(() => this.animals().filter(a => a.status === 'active').length);
  soldCount = computed(() => this.animals().filter(a => a.status === 'sold').length);
  avgProfit = computed(() => {
    const sold = this.animals().filter(a => a.status === 'sold' && a.profit !== undefined);
    if (sold.length === 0) return 0;
    return Math.round(sold.reduce((s, a) => s + (a.profit || 0), 0) / sold.length);
  });

  animalSegments(): Segment[] {
    return this.segments().filter(s => s.segmentType !== 'crop');
  }

  displayedAnimals(): Animal[] {
    let filtered = this.animals();

    const term = this.searchTerm.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter(a =>
        a.name?.toLowerCase().includes(term) ||
        a.tag?.toLowerCase().includes(term) ||
        a.breed?.toLowerCase().includes(term) ||
        a.batchLabel?.toLowerCase().includes(term) ||
        a.buyerName?.toLowerCase().includes(term) ||
        a.segmentName?.toLowerCase().includes(term)
      );
    }

    return sortData(filtered, this.sortColumn, this.sortDirection);
  }

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.currentPage = 1;
    const filters: any = {};
    if (this.filterSegment) filters.segment = this.filterSegment;
    if (this.filterStatus) filters.status = this.filterStatus;
    this.animals.set(await this.animalService.getAll(filters));
    this.loading.set(false);
  }

  paginatedAnimals(): Animal[] {
    return paginate(this.displayedAnimals(), this.currentPage, this.pageSize);
  }

  totalPagesNum(): number { return totalPages(this.displayedAnimals().length, this.pageSize); }
  pageStartNum(): number { return pageStart(this.displayedAnimals().length, this.currentPage, this.pageSize); }
  pageEndNum(): number { return pageEnd(this.displayedAnimals().length, this.currentPage, this.pageSize); }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  clearFilters(): void {
    this.filterSegment = '';
    this.filterStatus = '';
    this.searchTerm = '';
    this.loadData();
  }

  addNew(): void { this.router.navigate(['/animals/new']); }
  openAnalytics(): void { this.router.navigate(['/animals/analytics']); }
  viewDetail(id: string): void { this.router.navigate(['/animals', id]); }
  edit(id: string): void { this.router.navigate(['/animals', id, 'edit']); }

  async confirmDelete(animal: Animal): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Animal',
        message: `Delete "${this.animalService.getDisplayName(animal)}"?`,
        confirmText: 'Delete',
        showDeleteOptions: true,
      } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        if (result.deleteType === 'hard') {
          await this.animalService.hardDelete(animal.id);
        } else {
          await this.animalService.softDelete(animal.id);
        }
        this.snackBar.open('Animal deleted', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }
}
