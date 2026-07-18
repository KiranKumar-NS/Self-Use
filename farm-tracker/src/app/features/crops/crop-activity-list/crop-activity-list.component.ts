import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { CropActivityService } from '../../../core/services/crop-activity.service';
import { CropActivity } from '../../../core/models/crop-activity.model';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CropActivityFormDialogComponent } from '../crop-activity-form-dialog/crop-activity-form-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { sortData, toggleSortState, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
import { safeLoad } from '../../../core/utils/async.utils';
import { ToastService } from '../../../core/services/toast.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-crop-activity-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatSelectModule, MatFormFieldModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Crop Activities</h1>
        <p class="subtitle">Track farming activities across crop segments</p>
      </div>
      <button mat-flat-button color="primary" (click)="addActivity()">
        <mat-icon>add</mat-icon> <span class="btn-label">Add Activity</span>
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (activities().length === 0) {
      <app-empty-state icon="🌱" title="No crop activities yet" message="Record your first crop activity to start tracking." actionLabel="Add Activity" (actionClick)="addActivity()" />
    } @else {
      <!-- Filter -->
      <mat-card class="filter-card">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Filter by Segment</mat-label>
          <mat-select [(ngModel)]="filterSegment" (selectionChange)="loadData()">
            <mat-option value="">All Segments</mat-option>
            @for (seg of cropSegments(); track seg.id) {
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
                <th class="sortable" (click)="toggleSort('date')">Date</th>
                <th>Segment</th>
                <th>Activity Type</th>
                <th>Product Used</th>
                <th class="sortable" (click)="toggleSort('quantity')">Quantity</th>
                <th class="sortable" (click)="toggleSort('cost')">Cost</th>
                <th>Note</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (activity of paginatedActivities(); track activity.id) {
                <tr>
                  <td class="date-cell">{{ activity.date.toDate() | date:'dd MMM yyyy' }}</td>
                  <td>{{ activity.segmentName || '-' }}</td>
                  <td><span class="activity-badge" [attr.data-type]="activity.activityType">{{ formatType(activity.activityType) }}</span></td>
                  <td>{{ activity.productUsed || '-' }}</td>
                  <td>{{ activity.quantity ? activity.quantity + ' ' + (activity.unit || '') : '-' }}</td>
                  <td class="amount-cell">{{ activity.cost ? (activity.cost | currencyInr) : '-' }}</td>
                  <td class="note-cell">{{ activity.note || '-' }}</td>
                  <td class="actions-cell" (click)="$event.stopPropagation()">
                    <button mat-icon-button (click)="editActivity(activity)" title="Edit" aria-label="Edit activity"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button color="warn" (click)="confirmDelete(activity)" title="Delete" aria-label="Delete activity"><mat-icon>delete</mat-icon></button>
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
          <span class="page-info">{{ pageStartNum() }}-{{ pageEndNum() }} of {{ displayedActivities().length }}</span>
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
    .activity-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.82rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .activity-badge[data-type="irrigation"] { background: #e3f2fd; color: #1565c0; }
    .activity-badge[data-type="fertilizer"] { background: #e8f5e9; color: #2e7d32; }
    .activity-badge[data-type="pruning"] { background: #fff3e0; color: #e65100; }
    .activity-badge[data-type="spraying"] { background: #fce4ec; color: #c62828; }
    .activity-badge[data-type="weeding"] { background: #f1f8e9; color: #558b2f; }
    .activity-badge[data-type="flowering"] { background: #fce4ec; color: #ad1457; }
    .activity-badge[data-type="harvest"] { background: #fff8e1; color: #f57f17; }
    .activity-badge[data-type="planting"] { background: #e0f2f1; color: #00695c; }
    .activity-badge[data-type="mulching"] { background: #efebe9; color: #4e342e; }
    .activity-badge[data-type="soil_testing"] { background: #e8eaf6; color: #283593; }
    .activity-badge[data-type="other"] { background: #f5f5f5; color: #616161; }
    .amount-cell { font-weight: 600; color: var(--color-expense); }
    .note-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
})
export class CropActivityListComponent implements OnInit {
  private cropActivityService = inject(CropActivityService);
  private segmentService = inject(SegmentService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  activities = signal<CropActivity[]>([]);
  cropSegments = signal<Segment[]>([]);
  loading = signal(true);
  filterSegment = '';

  sortColumn = signal('');
  sortDirection = signal<SortDirection>('asc');
  pageSize = signal(20);
  currentPage = signal(1);

  async ngOnInit(): Promise<void> {
    try {
      const allSegments = await this.segmentService.getAll();
      this.cropSegments.set(allSegments.filter(s => s.segmentType === 'crop'));
    } catch (err) {
      console.error('Failed to load segments', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load segments');
    }
    await this.loadData();
  }

  async loadData(): Promise<void> {
    await safeLoad(this.loading, async () => {
      const filters: { segment?: string } = {};
      if (this.filterSegment) filters.segment = this.filterSegment;
      this.activities.set(await this.cropActivityService.getAll(filters));
    }, this.toast);
    this.currentPage.set(1);
  }

  displayedActivities = computed<CropActivity[]>(() =>
    sortData(this.activities(), this.sortColumn(), this.sortDirection())
  );

  paginatedActivities = computed<CropActivity[]>(() => paginate(this.displayedActivities(), this.currentPage(), this.pageSize()));
  totalPagesNum = computed<number>(() => totalPages(this.displayedActivities().length, this.pageSize()));
  pageStartNum = computed<number>(() => pageStart(this.displayedActivities().length, this.currentPage(), this.pageSize()));
  pageEndNum = computed<number>(() => pageEnd(this.displayedActivities().length, this.currentPage(), this.pageSize()));

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn(), direction: this.sortDirection() }, column);
    this.sortColumn.set(state.column);
    this.sortDirection.set(state.direction);
    this.currentPage.set(1);
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  addActivity(): void {
    const ref = this.dialog.open(CropActivityFormDialogComponent, { width: '90vw', maxWidth: '600px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.toast.success('Activity added');
        await this.loadData();
      }
    });
  }

  editActivity(activity: CropActivity): void {
    const ref = this.dialog.open(CropActivityFormDialogComponent, { width: '90vw', maxWidth: '600px', data: { activity } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.toast.success('Activity updated');
        await this.loadData();
      }
    });
  }

  async confirmDelete(activity: CropActivity): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Activity', message: `Delete this ${this.formatType(activity.activityType)} activity?`, confirmText: 'Delete' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          await this.cropActivityService.softDelete(activity.id);
          this.toast.success('Activity deleted');
        } catch (err) {
          console.error('Failed to delete activity', err);
          this.toast.error(err instanceof Error ? err.message : 'Failed to delete activity');
        }
        await this.loadData();
      }
    });
  }
}
