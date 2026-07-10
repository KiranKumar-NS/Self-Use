import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Timestamp } from '@angular/fire/firestore';

import { AnimalService } from '../../../core/services/animal.service';
import { VaccinationEntry } from '../../../core/models/animal.model';

export interface VaccinationDialogData {
  animalId: string;
}

@Component({
  selector: 'app-vaccination-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>Add Vaccination Record</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Vaccine Name</mat-label>
          <input matInput [(ngModel)]="vaccineName" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="datePicker" [(ngModel)]="date" [max]="today" required />
          <mat-datepicker-toggle matSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Dosage</mat-label>
          <input matInput [(ngModel)]="dosage" placeholder="e.g. 2ml" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Administered By</mat-label>
          <input matInput [(ngModel)]="administeredBy" placeholder="Doctor / Vet name" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Batch Number</mat-label>
          <input matInput [(ngModel)]="batchNumber" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Next Due Date</mat-label>
          <input matInput [matDatepicker]="nextDuePicker" [(ngModel)]="nextDueDate" />
          <mat-datepicker-toggle matSuffix [for]="nextDuePicker" />
          <mat-datepicker #nextDuePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Cost (₹)</mat-label>
          <input matInput type="number" [(ngModel)]="cost" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Note</mat-label>
          <input matInput [(ngModel)]="note" />
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !vaccineName.trim()" (click)="save()">
        {{ saving() ? 'Saving...' : 'Add Record' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .full-width { grid-column: 1 / -1; }
    .error-msg { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
    @media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } }
  `],
})
export class VaccinationDialogComponent {
  data = inject<VaccinationDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<VaccinationDialogComponent>);
  private animalService = inject(AnimalService);

  saving = signal(false);
  error = signal('');

  today = new Date();
  vaccineName = '';
  date: Date = new Date();
  dosage = '';
  administeredBy = '';
  batchNumber = '';
  nextDueDate: Date | null = null;
  cost: number | null = null;
  note = '';

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const entry: VaccinationEntry = {
        id: crypto.randomUUID(),
        date: Timestamp.fromDate(this.date),
        vaccineName: this.vaccineName,
        ...(this.dosage ? { dosage: this.dosage } : {}),
        ...(this.administeredBy ? { administeredBy: this.administeredBy } : {}),
        ...(this.batchNumber ? { batchNumber: this.batchNumber } : {}),
        ...(this.nextDueDate ? { nextDueDate: Timestamp.fromDate(this.nextDueDate) } : {}),
        ...(this.cost ? { cost: this.cost } : {}),
        ...(this.note ? { note: this.note } : {}),
      };
      await this.animalService.addVaccination(this.data.animalId, entry);
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
