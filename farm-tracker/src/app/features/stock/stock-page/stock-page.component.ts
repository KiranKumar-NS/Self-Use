import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { AnimalService } from '../../../core/services/animal.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { SegmentService } from '../../../core/services/segment.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Animal } from '../../../core/models/animal.model';
import { InventoryEvent } from '../../../core/models/inventory.model';
import { Segment } from '../../../core/models/segment.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { InventoryEventDialogComponent } from '../../inventory/inventory-event-dialog/inventory-event-dialog.component';
import { sortData, toggleSortState, getSortIndicator, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { safeLoad } from '../../../core/utils/async.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';

@Component({
  selector: 'app-stock-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatSelectModule, MatInputModule, MatTabsModule,
  ],
  template: `
    <!-- Header -->
    <div class="page-header">
      <div>
        <h1>Stock</h1>
        <p class="subtitle">Animals, inventory & records</p>
      </div>
      <div class="header-actions">
        <button mat-stroked-button (click)="openAnalytics()">
          <mat-icon>insights</mat-icon> <span class="btn-label">Analytics</span>
        </button>
        <button mat-stroked-button (click)="openMortality()">
          <mat-icon>heart_broken</mat-icon> <span class="btn-label">Mortality</span>
        </button>
        @if (!auth.isViewer()) {
          <button mat-stroked-button (click)="registerAnimal()">
            <mat-icon>pets</mat-icon> <span class="btn-label">Register Animal</span>
          </button>
          <button mat-flat-button color="primary" (click)="openEventDialog()">
            <mat-icon>add</mat-icon> <span class="btn-label">Record Event</span>
          </button>
        }
      </div>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <!-- Stock Cards -->
      <div class="stock-grid">
        @for (seg of animalSegments(); track seg.id) {
          <mat-card class="stock-card">
            <span class="stock-icon">{{ seg.icon }}</span>
            <div class="stock-info">
              <span class="stock-name">{{ seg.name }}</span>
              <span class="stock-count">{{ seg.currentStock || 0 }} <small>{{ seg.unit || 'head' }}</small></span>
            </div>
          </mat-card>
        }
      </div>

      <!-- Tabs -->
      <mat-tab-group [(selectedIndex)]="activeTab" animationDuration="200ms">
        <!-- Animals Tab -->
        <mat-tab label="Animals">
          <!-- Stats -->
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

          <!-- Filters -->
          <mat-card class="filter-card">
            <div class="filter-header" (click)="animalFiltersOpen.set(!animalFiltersOpen())">
              <mat-icon>filter_list</mat-icon>
              <span>Filters</span>
              @if (activeFilterCount() > 0) {
                <span class="filter-count">{{ activeFilterCount() }} active</span>
              }
              @if (filterSegment() || filterStatus() || searchTerm()) {
                <button mat-button class="clear-btn" (click)="clearAnimalFilters(); $event.stopPropagation()">Clear All</button>
              }
              <mat-icon class="toggle-icon" [class.expanded]="animalFiltersOpen()">expand_more</mat-icon>
            </div>
            <div class="filters" [class.collapsed]="!animalFiltersOpen()">
              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Segment</mat-label>
                <mat-select [(ngModel)]="filterSegment" (selectionChange)="loadAnimals()">
                  <mat-option value="">All Segments</mat-option>
                  @for (seg of animalSegments(); track seg.id) {
                    <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Status</mat-label>
                <mat-select [(ngModel)]="filterStatus" (selectionChange)="loadAnimals()">
                  <mat-option value="">All</mat-option>
                  <mat-option value="active">Active</mat-option>
                  <mat-option value="sold">Sold</mat-option>
                  <mat-option value="dead">Dead</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="filter-field">
                <mat-label>Search</mat-label>
                <input matInput [(ngModel)]="searchTerm" placeholder="Tag, name, breed..." />
                @if (searchTerm()) {
                  <button matSuffix mat-icon-button (click)="searchTerm.set('')" aria-label="Clear search"><mat-icon>close</mat-icon></button>
                }
              </mat-form-field>
            </div>
          </mat-card>

          @if (displayedAnimals().length === 0 && !filterSegment() && !filterStatus() && !searchTerm()) {
            <app-empty-state icon="🐐" title="No animals registered" message="Record a purchase or birth event to start tracking." actionLabel="Record Event" (actionClick)="openEventDialog()" />
          } @else {
            @if (displayedAnimals().length > 0) {
              <div class="summary-bar">
                <span class="summary-label">Showing</span>
                <span class="summary-value">{{ displayedAnimals().length }} records</span>
              </div>
            }
            <mat-card class="table-card">
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th class="sortable" (click)="toggleAnimalSort('name')">Name/Tag</th>
                      <th class="sortable" (click)="toggleAnimalSort('segmentName')">Segment</th>
                      <th class="sortable hide-sm" (click)="toggleAnimalSort('breed')">Breed</th>
                      <th class="sortable" (click)="toggleAnimalSort('status')">Status</th>
                      <th class="sortable hide-sm" (click)="toggleAnimalSort('originDate')">Origin</th>
                      <th class="sortable" (click)="toggleAnimalSort('totalInvested')">Invested</th>
                      <th class="sortable hide-sm" (click)="toggleAnimalSort('profit')">Profit</th>
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
                        <td class="breed-cell hide-sm">{{ animal.breed || '-' }}</td>
                        <td><span class="status-badge" [class]="animal.status">{{ animal.status }}</span></td>
                        <td class="date-cell hide-sm">{{ animal.originDate.toDate() | date:'dd MMM yy' }}</td>
                        <td class="amount-cell">{{ animal.totalInvested | currencyInr }}</td>
                        <td class="profit-cell hide-sm" [class.positive]="(animal.profit || 0) > 0" [class.negative]="(animal.profit || 0) < 0" [class.neutral]="animal.status === 'active'">
                          @if (animal.status === 'sold') {
                            {{ animal.profit | currencyInr }}
                            <span class="margin-info">{{ animal.profitMargin?.toFixed(0) }}%</span>
                          } @else { - }
                        </td>
                        <td class="actions-cell" (click)="$event.stopPropagation()">
                          <button mat-icon-button (click)="edit(animal.id)" title="Edit" aria-label="Edit animal"><mat-icon>edit</mat-icon></button>
                          @if (auth.isAdmin()) {
                            <button mat-icon-button color="warn" (click)="confirmDeleteAnimal(animal)" title="Delete" aria-label="Delete animal"><mat-icon>delete</mat-icon></button>
                          }
                        </td>
                      </tr>
                    }
                    @if (displayedAnimals().length === 0) {
                      <tr><td colspan="8" class="empty-cell">No animals match your filters.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              @if (displayedAnimals().length > 0) {
                <div class="pagination">
                  <div class="page-size">
                    <span>Rows:</span>
                    <select [(ngModel)]="animalPageSize" (change)="animalPage.set(1)">
                      <option [ngValue]="10">10</option>
                      <option [ngValue]="20">20</option>
                      <option [ngValue]="50">50</option>
                    </select>
                  </div>
                  <span class="page-info">{{ animalPageStart() }}-{{ animalPageEnd() }} of {{ displayedAnimals().length }}</span>
                  <div class="page-buttons">
                    <button mat-icon-button [disabled]="animalPage() === 1" (click)="animalPage.set(1)" aria-label="First page"><mat-icon>first_page</mat-icon></button>
                    <button mat-icon-button [disabled]="animalPage() === 1" (click)="animalPage.set(animalPage() - 1)" aria-label="Previous page"><mat-icon>chevron_left</mat-icon></button>
                    <button mat-icon-button [disabled]="animalPage() >= animalTotalPages()" (click)="animalPage.set(animalPage() + 1)" aria-label="Next page"><mat-icon>chevron_right</mat-icon></button>
                    <button mat-icon-button [disabled]="animalPage() >= animalTotalPages()" (click)="animalPage.set(animalTotalPages())" aria-label="Last page"><mat-icon>last_page</mat-icon></button>
                  </div>
                </div>
              }
            </mat-card>
          }
        </mat-tab>

        <!-- Stock Log Tab -->
        <mat-tab label="Stock Log">
          <mat-card class="filter-card">
            <mat-form-field appearance="outline" class="filter-field">
              <mat-label>Filter by Segment</mat-label>
              <mat-select [(ngModel)]="eventFilterSegment" (selectionChange)="loadEvents()">
                <mat-option value="">All Segments</mat-option>
                @for (seg of animalSegments(); track seg.id) {
                  <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </mat-card>

          <mat-card class="table-card">
            <div class="table-container">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="sortable" (click)="toggleEventSort('date')">Date</th>
                    <th class="sortable" (click)="toggleEventSort('segmentName')">Segment</th>
                    <th class="sortable" (click)="toggleEventSort('eventType')">Event</th>
                    <th class="sortable" (click)="toggleEventSort('count')">Count</th>
                    <th class="sortable hide-sm" (click)="toggleEventSort('breed')">Breed</th>
                    <th class="hide-sm">Note</th>
                    @if (!auth.isViewer()) {
                      <th class="actions-th">Actions</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (ev of paginatedEvents(); track ev.id) {
                    <tr>
                      <td class="date-cell">{{ ev.date.toDate() | date:'dd MMM' }}</td>
                      <td>{{ ev.segmentName }}</td>
                      <td><span class="event-badge" [class]="ev.eventType">{{ ev.eventType }}</span></td>
                      <td class="count-cell" [class.positive]="ev.count > 0" [class.negative]="ev.count < 0">
                        {{ ev.count > 0 ? '+' : '' }}{{ ev.count }}
                      </td>
                      <td class="breed-cell hide-sm">{{ ev.breed || '-' }}</td>
                      <td class="note-cell hide-sm">{{ ev.note || '-' }}</td>
                      @if (!auth.isViewer()) {
                        <td class="actions-cell">
                          <button mat-icon-button (click)="editEvent(ev)" title="Edit" aria-label="Edit event"><mat-icon>edit</mat-icon></button>
                          <button mat-icon-button color="warn" (click)="confirmDeleteEvent(ev)" title="Delete" aria-label="Delete event"><mat-icon>delete</mat-icon></button>
                        </td>
                      }
                    </tr>
                  }
                  @if (events().length === 0) {
                    <tr><td [attr.colspan]="auth.isViewer() ? 6 : 7" class="empty-cell">No inventory events recorded yet.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            @if (events().length > 0) {
              <div class="pagination">
                <div class="page-size">
                  <span>Rows:</span>
                  <select [(ngModel)]="eventPageSize" (change)="eventPage.set(1)">
                    <option [ngValue]="10">10</option>
                    <option [ngValue]="20">20</option>
                    <option [ngValue]="50">50</option>
                  </select>
                </div>
                <span class="page-info">{{ eventPageStart() }}-{{ eventPageEnd() }} of {{ sortedEvents().length }}</span>
                <div class="page-buttons">
                  <button mat-icon-button [disabled]="eventPage() === 1" (click)="eventPage.set(1)" aria-label="First page"><mat-icon>first_page</mat-icon></button>
                  <button mat-icon-button [disabled]="eventPage() === 1" (click)="eventPage.set(eventPage() - 1)" aria-label="Previous page"><mat-icon>chevron_left</mat-icon></button>
                  <button mat-icon-button [disabled]="eventPage() >= eventTotalPages()" (click)="eventPage.set(eventPage() + 1)" aria-label="Next page"><mat-icon>chevron_right</mat-icon></button>
                  <button mat-icon-button [disabled]="eventPage() >= eventTotalPages()" (click)="eventPage.set(eventTotalPages())" aria-label="Last page"><mat-icon>last_page</mat-icon></button>
                </div>
              </div>
            }
          </mat-card>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    /* Stock cards */
    .stock-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .stock-card { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; border-left: 4px solid var(--color-primary); min-width: 0; overflow: hidden; }
    .stock-icon { font-size: 1.5rem; flex-shrink: 0; }
    .stock-info { min-width: 0; flex: 1; }
    .stock-name { display: block; font-size: 0.65rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .stock-count { display: block; font-size: 1.4rem; font-weight: 700; color: var(--color-text); line-height: 1.2; }
    .stock-count small { font-size: 0.6rem; font-weight: 500; color: var(--color-text-secondary); }

    /* Stats */
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin: 1rem 0; }
    .stat-card { padding: 0.75rem; text-align: center; }
    .stat-value { font-size: 1.3rem; font-weight: 700; color: var(--color-text); }
    .stat-label { font-size: var(--font-xs); color: var(--color-text-muted); text-transform: uppercase; font-weight: 600; }
    .avg-profit.positive { color: var(--color-income); }
    .avg-profit.negative { color: var(--color-expense); }

    /* Filters */
    .filter-header { cursor: pointer; }
    .filter-count { font-size: 0.7rem; background: var(--color-primary); color: white; padding: 1px 8px; border-radius: 10px; font-weight: 600; }
    .toggle-icon { margin-left: auto; transition: transform 0.2s; color: var(--color-text-muted); font-size: 20px; width: 20px; height: 20px; }
    .toggle-icon.expanded { transform: rotate(180deg); }
    .filters.collapsed { display: none; }

    /* Summary */
    .summary-bar { display: flex; gap: 6px; align-items: center; margin-bottom: 0.75rem; padding: 0 4px; }
    .summary-label { font-size: var(--font-sm); color: var(--color-text-muted); text-transform: uppercase; }
    .summary-value { font-size: var(--font-base); color: var(--color-text); font-weight: 600; }

    /* Animal table */
    .name-cell { min-width: 100px; }
    .animal-name { font-weight: 600; color: var(--color-text); }
    .batch-info { display: block; font-size: var(--font-xs); color: var(--color-text-muted); }
    .breed-cell { font-size: 0.8rem; color: var(--color-purple); font-weight: 500; }
    .status-badge { padding: 3px 10px; border-radius: var(--radius-full); font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .status-badge.active { background: var(--color-income-bg); color: var(--color-income); }
    .status-badge.sold { background: var(--color-info-light); color: var(--color-info); }
    .status-badge.dead { background: var(--color-expense-bg); color: var(--color-expense); }
    .profit-cell { font-weight: 600; }
    .profit-cell.positive { color: var(--color-income); }
    .profit-cell.negative { color: var(--color-expense); }
    .profit-cell.neutral { color: var(--color-text-muted); }
    .margin-info { display: block; font-size: var(--font-xs); font-weight: 500; color: var(--color-text-muted); }

    /* Event table */
    .event-badge { padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
    .event-badge.birth { background: var(--color-income-bg); color: var(--color-income); }
    .event-badge.purchase { background: var(--color-info-light); color: var(--color-info); }
    .event-badge.sale { background: var(--color-warning-light); color: var(--color-warning); }
    .event-badge.death { background: var(--color-expense-bg); color: var(--color-expense); }
    .event-badge.adjustment { background: var(--color-bg-alt); color: var(--color-text-subtle); }
    .count-cell { font-weight: 700; }
    .count-cell.positive { color: var(--color-income); }
    .count-cell.negative { color: var(--color-expense); }
    .note-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-muted); font-size: 0.8rem; }
    .empty-cell { text-align: center; color: var(--color-text-muted); padding: 2rem !important; }

    @media (max-width: 768px) {
      .stock-grid { grid-template-columns: 1fr 1fr; }
      .stats-grid { grid-template-columns: 1fr 1fr 1fr; }
      .hide-sm { display: none; }
    }
    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr; }
      .stat-card { padding: 0.5rem; }
      .stat-value { font-size: 1.1rem; }
    }
  `],
})
export class StockPageComponent implements OnInit {
  animalService = inject(AnimalService);
  private inventoryService = inject(InventoryService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  loading = signal(true);
  segments = signal<Segment[]>([]);
  animals = signal<Animal[]>([]);
  events = signal<InventoryEvent[]>([]);

  activeTab = signal(0);

  // Animal filters
  animalFiltersOpen = signal(window.innerWidth > 768);
  filterSegment = signal('');
  filterStatus = signal('');
  searchTerm = signal('');
  animalSortColumn = signal('');
  animalSortDirection = signal<SortDirection>('asc');
  animalPageSize = signal(20);
  animalPage = signal(1);

  // Event filters
  eventFilterSegment = signal('');
  eventSortColumn = signal('');
  eventSortDirection = signal<SortDirection>('asc');
  eventPageSize = signal(20);
  eventPage = signal(1);

  // Computed animal stats
  activeCount = computed(() => this.animals().filter(a => a.status === 'active').length);
  soldCount = computed(() => this.animals().filter(a => a.status === 'sold').length);
  avgProfit = computed(() => {
    const sold = this.animals().filter(a => a.status === 'sold' && a.profit !== undefined);
    if (sold.length === 0) return 0;
    return Math.round(sold.reduce((s, a) => s + (a.profit || 0), 0) / sold.length);
  });
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.filterSegment()) count++;
    if (this.filterStatus()) count++;
    if (this.searchTerm()) count++;
    return count;
  });

  async ngOnInit(): Promise<void> {
    await safeLoad(this.loading, async () => {
      await this.segmentService.migrateSegmentTypes();
      this.segments.set(await this.segmentService.getAll());
      await Promise.all([this.loadAnimals(), this.loadEvents()]);
    }, this.toast);
  }

  animalSegments = computed<Segment[]>(() =>
    this.segments().filter(s => s.segmentType !== 'crop')
  );

  // ── Animals ──

  async loadAnimals(): Promise<void> {
    this.animalPage.set(1);
    try {
      const filters: any = {};
      if (this.filterSegment()) filters.segment = this.filterSegment();
      if (this.filterStatus()) filters.status = this.filterStatus();
      this.animals.set(await this.animalService.getAll(filters));
    } catch (err) {
      console.error('Failed to load animals', err);
      this.toast.error('Failed to load animals. Check your connection and try again.');
    }
  }

  displayedAnimals = computed<Animal[]>(() => {
    let filtered = this.animals();
    const term = this.searchTerm().toLowerCase().trim();
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
    return sortData(filtered, this.animalSortColumn(), this.animalSortDirection());
  });

  paginatedAnimals = computed<Animal[]>(() => paginate(this.displayedAnimals(), this.animalPage(), this.animalPageSize()));
  animalTotalPages = computed<number>(() => totalPages(this.displayedAnimals().length, this.animalPageSize()));
  animalPageStart = computed<number>(() => pageStart(this.displayedAnimals().length, this.animalPage(), this.animalPageSize()));
  animalPageEnd = computed<number>(() => pageEnd(this.displayedAnimals().length, this.animalPage(), this.animalPageSize()));

  toggleAnimalSort(column: string): void {
    const state = toggleSortState({ column: this.animalSortColumn(), direction: this.animalSortDirection() }, column);
    this.animalSortColumn.set(state.column);
    this.animalSortDirection.set(state.direction);
    this.animalPage.set(1);
  }

  clearAnimalFilters(): void {
    this.filterSegment.set('');
    this.filterStatus.set('');
    this.searchTerm.set('');
    this.loadAnimals();
  }

  viewDetail(id: string): void { this.router.navigate(['/stock', id]); }
  edit(id: string): void { this.router.navigate(['/stock', id, 'edit']); }
  openAnalytics(): void { this.router.navigate(['/stock/analytics']); }
  openMortality(): void { this.router.navigate(['/stock/mortality']); }
  registerAnimal(): void { this.router.navigate(['/stock/new']); }

  async confirmDeleteAnimal(animal: Animal): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Animal', message: `Delete "${this.animalService.getDisplayName(animal)}"?`, confirmText: 'Delete', showDeleteOptions: true } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          if (result.deleteType === 'hard') await this.animalService.hardDelete(animal.id);
          else await this.animalService.softDelete(animal.id);
          this.toast.success('Animal deleted');
          await this.loadAnimals();
        } catch (err) {
          console.error('Failed to delete animal', err);
          this.toast.error(err instanceof Error ? err.message : 'Failed to delete animal');
        }
      }
    });
  }

  // ── Events ──

  async loadEvents(): Promise<void> {
    this.eventPage.set(1);
    try {
      this.events.set(await this.inventoryService.getEvents(this.eventFilterSegment() || undefined));
    } catch (err) {
      console.error('Failed to load inventory events', err);
      this.toast.error('Failed to load stock log. Check your connection and try again.');
    }
  }

  sortedEvents = computed<InventoryEvent[]>(() => sortData(this.events(), this.eventSortColumn(), this.eventSortDirection()));
  paginatedEvents = computed<InventoryEvent[]>(() => paginate(this.sortedEvents(), this.eventPage(), this.eventPageSize()));
  eventTotalPages = computed<number>(() => totalPages(this.sortedEvents().length, this.eventPageSize()));
  eventPageStart = computed<number>(() => pageStart(this.sortedEvents().length, this.eventPage(), this.eventPageSize()));
  eventPageEnd = computed<number>(() => pageEnd(this.sortedEvents().length, this.eventPage(), this.eventPageSize()));

  toggleEventSort(column: string): void {
    const state = toggleSortState({ column: this.eventSortColumn(), direction: this.eventSortDirection() }, column);
    this.eventSortColumn.set(state.column);
    this.eventSortDirection.set(state.direction);
    this.eventPage.set(1);
  }

  // ── Dialogs ──

  openEventDialog(): void {
    const ref = this.dialog.open(InventoryEventDialogComponent, { width: '90vw', maxWidth: '500px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) await this.refreshAll();
    });
  }

  editEvent(ev: InventoryEvent): void {
    const ref = this.dialog.open(InventoryEventDialogComponent, { width: '90vw', maxWidth: '500px', data: { event: ev } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) await this.refreshAll();
    });
  }

  confirmDeleteEvent(ev: InventoryEvent): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Inventory Event', message: `Delete this ${ev.eventType} event (${Math.abs(ev.count)} ${ev.segmentName})? Stock will be adjusted.`, confirmText: 'Delete', showDeleteOptions: true } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          if (result.deleteType === 'hard') await this.inventoryService.deleteEvent(ev.id, ev.segment, ev.count);
          else await this.inventoryService.softDeleteEvent(ev.id, ev.segment, ev.count);
          await this.refreshAll();
        } catch (err) {
          console.error('Failed to delete inventory event', err);
          this.toast.error(err instanceof Error ? err.message : 'Failed to delete inventory event');
        }
      }
    });
  }

  private async refreshAll(): Promise<void> {
    this.segmentService.clearCache();
    try {
      this.segments.set(await this.segmentService.getAll());
    } catch (err) {
      console.error('Failed to refresh segments', err);
      this.toast.error('Failed to refresh data. Check your connection and try again.');
    }
    await Promise.all([this.loadAnimals(), this.loadEvents()]);
  }
}
