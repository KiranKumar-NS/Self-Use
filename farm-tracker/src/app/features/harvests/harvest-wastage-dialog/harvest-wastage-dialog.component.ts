import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { HarvestService } from '../../../core/services/harvest.service';
import { Harvest } from '../../../core/models/harvest.model';
import { ToastService } from '../../../core/services/toast.service';

export interface HarvestWastageDialogData {
  harvest: Harvest;
}

@Component({
  selector: 'app-harvest-wastage-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>Record Wastage</h2>
    <mat-dialog-content>
      <p class="wastage-info">Wasting from <strong>{{ data.harvest.cropName }}</strong> &mdash; {{ data.harvest.remainingQuantity }} {{ data.harvest.unit }} available</p>

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Quantity ({{ data.harvest.unit }})</mat-label>
          <input matInput type="number" [(ngModel)]="quantity" required min="0" [max]="data.harvest.remainingQuantity" />
          <mat-hint>Max {{ data.harvest.remainingQuantity }} {{ data.harvest.unit }}</mat-hint>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Reason</mat-label>
          <input matInput [(ngModel)]="reason" placeholder="Spoilage, pest damage..." />
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !quantity || quantity <= 0 || quantity > data.harvest.remainingQuantity" (click)="save()">
        {{ saving() ? 'Saving...' : 'Record Wastage' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .wastage-info { margin-bottom: 16px; color: var(--color-text-secondary); }
  `],
})
export class HarvestWastageDialogComponent {
  data = inject<HarvestWastageDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<HarvestWastageDialogComponent>);
  private harvestService = inject(HarvestService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');

  quantity: number | null = null;
  reason = '';

  async save(): Promise<void> {
    const qty = this.quantity ?? 0;
    if (qty <= 0 || qty > this.data.harvest.remainingQuantity) {
      this.error.set('Invalid quantity');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      await this.harvestService.recordWastage(this.data.harvest.id, qty, this.reason.trim() || undefined);
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to record wastage');
    } finally {
      this.saving.set(false);
    }
  }
}
