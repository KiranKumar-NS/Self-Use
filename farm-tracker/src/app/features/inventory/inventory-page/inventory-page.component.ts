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
                <th>Date</th>
                <th>Segment</th>
                <th>Event</th>
                <th>Count</th>
                <th class="hide-mobile">Note</th>
                <th class="hide-mobile">By</th>
                @if (!auth.isViewer()) {
                  <th class="actions-th">Actions</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (ev of events(); track ev.id) {
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

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
    await this.loadEvents();
    this.loading.set(false);
  }

  async loadEvents(): Promise<void> {
    this.events.set(await this.inventoryService.getEvents(this.filterSegment || undefined));
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
      } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.inventoryService.deleteEvent(ev.id, ev.segment, ev.count);
        this.segmentService.clearCache();
        this.segments.set(await this.segmentService.getAll());
        await this.loadEvents();
      }
    });
  }
}
