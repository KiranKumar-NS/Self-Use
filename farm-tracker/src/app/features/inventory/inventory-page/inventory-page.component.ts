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
      <!-- Stock Cards -->
      <div class="stock-grid">
        @for (seg of segments(); track seg.id) {
          <mat-card class="stock-card">
            <span class="stock-icon">{{ seg.icon }}</span>
            <div class="stock-info">
              <span class="stock-name">{{ seg.name }}</span>
              <span class="stock-count">{{ seg.currentStock || 0 }}</span>
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
            @for (seg of segments(); track seg.id) {
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
                <tr><td [attr.colspan]="auth.isViewer() ? 6 : 7" class="empty-cell">No inventory events recorded yet.</td></tr>
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
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .subtitle { margin: 4px 0 0; color: #64748b; font-size: 0.85rem; }
    .stock-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stock-card { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; border-left: 4px solid #4f46e5; }
    .stock-icon { font-size: 2rem; }
    .stock-name { display: block; font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
    .stock-count { display: block; font-size: 2rem; font-weight: 700; color: #1e293b; }
    .filter-card { margin-bottom: 1rem; padding: 1rem; }
    .filter-field { min-width: 200px; }
    .table-card { padding: 0; overflow: hidden; }
    .table-container { overflow-x: auto; }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #64748b; font-weight: 700; border-bottom: 2px solid #e2e8f0; }
    .data-table td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; color: #334155; }
    .date-cell { white-space: nowrap; color: #64748b; font-size: 0.8rem; }
    .event-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; }
    .event-badge.birth { background: #f0fdf4; color: #16a34a; }
    .event-badge.purchase { background: #dbeafe; color: #2563eb; }
    .event-badge.sale { background: #fef3c7; color: #d97706; }
    .event-badge.death { background: #fef2f2; color: #dc2626; }
    .event-badge.adjustment { background: #f1f5f9; color: #475569; }
    .count-cell { font-weight: 700; }
    .count-cell.positive { color: #16a34a; }
    .count-cell.negative { color: #dc2626; }
    .note-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #94a3b8; }
    .empty-cell { text-align: center; color: #94a3b8; padding: 2rem !important; }
    .actions-th { text-align: center; }
    .actions-cell { white-space: nowrap; text-align: center; }
    .actions-cell button { opacity: 0.5; }
    tr:hover .actions-cell button { opacity: 1; }
    .sortable { cursor: pointer; user-select: none; }
    .sortable:hover { color: #1e293b; }
    .sort-icon { font-size: 0.7rem; color: #94a3b8; }
    .pagination {
      display: flex; align-items: center; justify-content: flex-end; gap: 1rem;
      padding: 8px 16px; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #64748b;
    }
    .page-size { display: flex; align-items: center; gap: 6px; }
    .page-size select { border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 6px; font-size: 0.8rem; background: white; color: #334155; }
    .page-info { font-size: 0.8rem; }
    .page-buttons { display: flex; align-items: center; }
    .page-buttons button { width: 32px; height: 32px; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .filter-field { min-width: 0; width: 100%; }
    }
    @media (max-width: 640px) {
      .hide-mobile { display: none; }
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
  sortDirection: 'asc' | 'desc' = 'asc';
  pageSize = 20;
  currentPage = 1;

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
    await this.loadEvents();
    this.loading.set(false);
  }

  async loadEvents(): Promise<void> {
    this.currentPage = 1;
    this.events.set(await this.inventoryService.getEvents(this.filterSegment || undefined));
  }

  sortedEvents(): InventoryEvent[] {
    let data = this.events();
    if (this.sortColumn) {
      data = [...data].sort((a, b) => {
        let valA: any, valB: any;
        if (this.sortColumn === 'date') {
          valA = a.date.toMillis(); valB = b.date.toMillis();
        } else {
          valA = (a as any)[this.sortColumn]; valB = (b as any)[this.sortColumn];
        }
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = (valB || '').toLowerCase(); }
        const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
        return this.sortDirection === 'asc' ? cmp : -cmp;
      });
    }
    return data;
  }

  paginatedEvents(): InventoryEvent[] {
    const all = this.sortedEvents();
    const start = (this.currentPage - 1) * this.pageSize;
    return all.slice(start, start + this.pageSize);
  }

  totalPages(): number { return Math.max(1, Math.ceil(this.sortedEvents().length / this.pageSize)); }
  pageStart(): number { return this.sortedEvents().length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  pageEnd(): number { return Math.min(this.currentPage * this.pageSize, this.sortedEvents().length); }

  toggleSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.currentPage = 1;
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '↕';
    return this.sortDirection === 'asc' ? '↑' : '↓';
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
