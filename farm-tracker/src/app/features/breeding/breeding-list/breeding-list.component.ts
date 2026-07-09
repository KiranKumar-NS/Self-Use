import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BreedingService } from '../../../core/services/breeding.service';
import { BreedingRecord } from '../../../core/models/breeding.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { BreedingFormDialogComponent } from '../breeding-form-dialog/breeding-form-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-breeding-list',
  standalone: true,
  imports: [
    DatePipe, FormsModule, LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Breeding Records</h1>
        <p class="subtitle">Track mating, pregnancy, and delivery</p>
      </div>
      <button mat-flat-button color="primary" (click)="addRecord()">
        <mat-icon>add</mat-icon> <span class="btn-label">Record Breeding</span>
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (records().length === 0) {
      <app-empty-state icon="🐣" title="No breeding records" message="Track mating and deliveries for your animals." actionLabel="Record Breeding" (actionClick)="addRecord()" />
    } @else {
      <mat-card class="table-card">
        <div class="table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Mating Date</th>
                <th>Dam (Female)</th>
                <th>Sire (Male)</th>
                <th>Status</th>
                <th>Expected</th>
                <th>Offspring</th>
                <th class="actions-th">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (r of records(); track r.id) {
                <tr>
                  <td class="date-cell">{{ r.matingDate.toDate() | date:'dd MMM yyyy' }}</td>
                  <td><strong>{{ r.damName }}</strong></td>
                  <td>{{ r.sireName || 'Unknown' }}</td>
                  <td>
                    <span class="status-badge" [class]="r.status">{{ formatStatus(r.status) }}</span>
                  </td>
                  <td class="date-cell">{{ r.expectedDeliveryDate ? (r.expectedDeliveryDate.toDate() | date:'dd MMM yyyy') : '-' }}</td>
                  <td>
                    @if (r.status === 'delivered') {
                      {{ r.offspringCount || 0 }}
                      @if (r.offspringMale || r.offspringFemale) {
                        <small>({{ r.offspringMale || 0 }}M / {{ r.offspringFemale || 0 }}F)</small>
                      }
                    } @else {
                      -
                    }
                  </td>
                  <td class="actions-cell" (click)="$event.stopPropagation()">
                    <button mat-icon-button (click)="editRecord(r)" title="Edit"><mat-icon>edit</mat-icon></button>
                    <button mat-icon-button color="warn" (click)="confirmDelete(r)" title="Delete"><mat-icon>delete</mat-icon></button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </mat-card>
    }
  `,
  styles: [`
    .status-badge { padding: 3px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; }
    .status-badge.mated { background: #E3F2FD; color: #1565C0; }
    .status-badge.confirmed_pregnant { background: #FFF3E0; color: #E65100; }
    .status-badge.delivered { background: var(--color-income-bg); color: var(--color-income); }
    .status-badge.failed { background: var(--color-expense-bg); color: var(--color-expense); }
  `],
})
export class BreedingListComponent implements OnInit {
  private breedingService = inject(BreedingService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  records = signal<BreedingRecord[]>([]);
  loading = signal(true);

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.records.set(await this.breedingService.getAll());
    this.loading.set(false);
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ');
  }

  addRecord(): void {
    const ref = this.dialog.open(BreedingFormDialogComponent, { width: '90vw', maxWidth: '600px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Breeding recorded', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  editRecord(record: BreedingRecord): void {
    const ref = this.dialog.open(BreedingFormDialogComponent, { width: '90vw', maxWidth: '600px', data: { record } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Record updated', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  confirmDelete(record: BreedingRecord): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Record', message: `Delete breeding record for ${record.damName}?`, confirmText: 'Delete' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        await this.breedingService.softDelete(record.id);
        this.snackBar.open('Record deleted', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }
}
