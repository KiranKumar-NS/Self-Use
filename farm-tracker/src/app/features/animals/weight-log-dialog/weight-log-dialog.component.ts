import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Timestamp } from '@angular/fire/firestore';

import { AnimalService } from '../../../core/services/animal.service';
import { WeightLogEntry } from '../../../core/models/animal.model';

export interface WeightLogDialogData {
  animalId: string;
}

@Component({
  selector: 'app-weight-log-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>Add Weight Log</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="datePicker" [(ngModel)]="date" [max]="today" required />
          <mat-datepicker-toggle matSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Weight (kg)</mat-label>
          <input matInput type="number" [(ngModel)]="weight" min="0.1" step="0.1" required />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Remarks</mat-label>
          <input matInput [(ngModel)]="remarks" />
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !weight" (click)="save()">
        {{ saving() ? 'Saving...' : 'Add' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [],
})
export class WeightLogDialogComponent {
  data = inject<WeightLogDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<WeightLogDialogComponent>);
  private animalService = inject(AnimalService);

  saving = signal(false);
  error = signal('');

  today = new Date();
  date: Date = new Date();
  weight: number | null = null;
  remarks = '';

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const entry: WeightLogEntry = {
        id: crypto.randomUUID(),
        date: Timestamp.fromDate(this.date),
        weight: this.weight!,
        ...(this.remarks ? { remarks: this.remarks } : {}),
      };
      await this.animalService.addWeightLog(this.data.animalId, entry);
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
