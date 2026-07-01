import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { InventoryService } from '../../../core/services/inventory.service';
import { SegmentService } from '../../../core/services/segment.service';
import { AuthService } from '../../../core/services/auth.service';
import { InventoryEvent } from '../../../core/models/inventory.model';
import { Segment } from '../../../core/models/segment.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { InventoryEventDialogComponent } from '../inventory-event-dialog/inventory-event-dialog.component';
import { sortData, toggleSortState, getSortIndicator, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [
    FormsModule, DatePipe, LoadingSpinnerComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatSelectModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Inventory</h1>
        <p class="subtitle">Track animal stock across segments</p>
      </div>
      @if (!auth.isViewer()) {
        <button mat-flat-button color="primary" (click)="openEventDialog()">
          <mat-icon>add</mat-icon> Record Event
        </button>
      }
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <!-- Stock Cards (animals only) -->
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

      <!-- Filter -->
      <mat-card class="filter-card">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Filter by Segment</mat-label>
          <mat-select [(ngModel)]="filterSegment" (selectionChange)="loadEvents()">
            <mat-option value="">All Segments</mat-option>
            @for (seg of animalSegments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </mat-card>

      <!-- Event History -->
      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th class="sortable" (click)="toggleSort('date')">Date <span class="sort-icon">{{ getSortIcon('date') }}</span></th>
                <th class="sortable" (click)="toggleSort('segmentName')">Segment <span class="sort-icon">{{ getSortIcon('segmentName') }}</span></th>
                <th class="sortable" (click)="toggleSort('eventType')">Event <span class="sort-icon">{{ getSortIcon('eventType') }}</span></th>
                <th class="sortable" (click)="toggleSort('count')">Count <span class="sort-icon">{{ getSortIcon('count') }}</span></th>
                <th class="sortable" (click)="toggleSort('breed')">Breed <span class="sort-icon">{{ getSortIcon('breed') }}</span></th>
                <th class="hide-mobile">Note</th>
                <th class="sortable hide-mobile" (click)="toggleSort('createdByName')">By <span class="sort-icon">{{ getSortIcon('createdByName') }}</span></th>
                @if (!auth.isViewer()) {
                  <th class="actions-th">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (ev of paginatedEvents(); track ev.id) {
                <tr>
                  <td class="date-cell">{{ ev.date.toDate() | date:'dd MMM yyyy' }}</td>
                  <td>{{ ev.segmentName }}</td>
                  <td><span class="event-badge" [class]="ev.eventType">{{ ev.eventType }}</span></td>
                  <td class="count-cell" [class.positive]="ev.count > 0" [class.negative]="ev.count < 0">
                    {{ ev.count > 0 ? '+' : '' }}{{ ev.count }}
                  </td>
                  <td class="breed-cell">{{ ev.breed || '-' }}</td>
                  <td class="note-cell hide-mobile">{{ ev.note || '-' }}</td>
                  <td class="hide-mobile">{{ ev.createdByName }}</td>
                  @if (!auth.isViewer()) {
                    <td class="actions-cell">
                      <button mat-icon-button (click)="editEvent(ev)" title="Edit">
                        <mat-icon>edit</mat-icon>
                      </button>
                      <button mat-icon-button color="warn" (click)="confirmDeleteEvent(ev)" title="Delete">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </td>
                  }
                </tr>
              }
              @if (events().length === 0) {
                <tr><td [attr.colspan]="auth.isViewer() ? 7 : 8" class="empty-cell">No inventory events recorded yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
        @if (events().length > 0) {
          <div class="pagination">
            <div class="page-size">
              <span>Rows per page:</span>
              <select [(ngModel)]="pageSize" (change)="currentPage = 1">
                <option [ngValue]="10">10</option>
                <option [ngValue]="20">20</option>
                <option [ngValue]="50">50</option>
              </select>
            </div>
            <span class="page-info">{{ pageStart() }}–{{ pageEnd() }} of {{ sortedEvents().length }}</span>
            <div class="page-buttons">
              <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = 1"><mat-icon>first_page</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = currentPage - 1"><mat-icon>chevron_left</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = currentPage + 1"><mat-icon>chevron_right</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = totalPages()"><mat-icon>last_page</mat-icon></button>
            </div>
          </div>
        }
      </mat-card>
    }
  `,
  styles: [`
    .stock-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stock-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; border-left: 4px solid var(--color-primary); }
    .stock-icon { font-size: 2rem; }
    .stock-name { display: block; font-size: var(--font-sm); color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600; }
    .stock-count { display: block; font-size: 2rem; font-weight: 700; color: var(--color-text); }
    .event-badge { padding: 2px 8px; border-radius: var(--radius-sm); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
    .event-badge.birth { background: var(--color-income-bg); color: var(--color-income); }
    .event-badge.purchase { background: var(--color-info-light); color: var(--color-info); }
    .event-badge.sale { background: var(--color-warning-light); color: var(--color-warning); }
    .event-badge.death { background: var(--color-expense-bg); color: var(--color-expense); }
    .event-badge.adjustment { background: var(--color-bg-alt); color: var(--color-text-subtle); }
    .count-cell { font-weight: 700; }
    .count-cell.positive { color: var(--color-income); }
    .count-cell.negative { color: var(--color-expense); }
    .breed-cell { font-size: 0.8rem; color: var(--color-purple); font-weight: 500; }
    .note-cell { max-width: 200px; }
    .empty-cell { text-align: center; color: var(--color-text-muted); padding: 2rem !important; }
    @media (max-width: 768px) {
      .filter-field { min-width: 0; width: 100%; }
    }
  `],
})
export class InventoryPageComponent implements OnInit {
  private inventoryService = inject(InventoryService);
  private segmentService = inject(SegmentService);
  private dialog = inject(MatDialog);
  auth = inject(AuthService);

  loading = signal(true);
  segments = signal<Segment[]>([]);
  events = signal<InventoryEvent[]>([]);
  filterSegment = '';

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  async ngOnInit(): Promise<void> {
    // Auto-migrate: set segmentType, unit, fix icons on existing segments
    await this.segmentService.migrateSegmentTypes();
    this.segments.set(await this.segmentService.getAll());
    await this.loadEvents();
    this.loading.set(false);
  }

  animalSegments(): Segment[] {
    return this.segments().filter(s => s.segmentType !== 'crop');
  }

  async loadEvents(): Promise<void> {
    this.currentPage = 1;
    this.events.set(await this.inventoryService.getEvents(this.filterSegment || undefined));
  }

  sortedEvents(): InventoryEvent[] {
    return sortData(this.events(), this.sortColumn, this.sortDirection);
  }

  paginatedEvents(): InventoryEvent[] {
    return paginate(this.sortedEvents(), this.currentPage, this.pageSize);
  }

  totalPages(): number { return totalPages(this.sortedEvents().length, this.pageSize); }
  pageStart(): number { return pageStart(this.sortedEvents().length, this.currentPage, this.pageSize); }
  pageEnd(): number { return pageEnd(this.sortedEvents().length, this.currentPage, this.pageSize); }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  getSortIcon(column: string): string {
    return getSortIndicator(this.sortColumn, this.sortDirection, column);
  }

  openEventDialog(): void {
    const ref = this.dialog.open(InventoryEventDialogComponent, {
      width: '90vw',
      maxWidth: '500px',
      data: {},
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.segmentService.clearCache();
        this.segments.set(await this.segmentService.getAll());
        await this.loadEvents();
      }
    });
  }

  editEvent(ev: InventoryEvent): void {
    const ref = this.dialog.open(InventoryEventDialogComponent, {
      width: '90vw',
      maxWidth: '500px',
      data: { event: ev },
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.segmentService.clearCache();
        this.segments.set(await this.segmentService.getAll());
        await this.loadEvents();
      }
    });
  }

  confirmDeleteEvent(ev: InventoryEvent): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Inventory Event',
        message: `Delete this ${ev.eventType} event (${Math.abs(ev.count)} ${ev.segmentName})? Stock will be adjusted.`,
        confirmText: 'Delete',
        showDeleteOptions: true,
      } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        if (result.deleteType === 'hard') {
          await this.inventoryService.deleteEvent(ev.id, ev.segment, ev.count);
        } else {
          await this.inventoryService.softDeleteEvent(ev.id, ev.segment, ev.count);
        }
        this.segmentService.clearCache();
        this.segments.set(await this.segmentService.getAll());
        await this.loadEvents();
      }
    });
  }
}
