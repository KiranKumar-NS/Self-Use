import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Timestamp } from '@angular/fire/firestore';

import { AnimalService } from '../../../core/services/animal.service';
import { MedicalEntry } from '../../../core/models/animal.model';

export interface MedicalDialogData {
  animalId: string;
}

@Component({
  selector: 'app-medical-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>Add Medical Record</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="recordType" required>
            <mat-option value="treatment">Treatment</mat-option>
            <mat-option value="checkup">Checkup</mat-option>
            <mat-option value="surgery">Surgery</mat-option>
            <mat-option value="emergency">Emergency</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="datePicker" [(ngModel)]="date" required />
          <mat-datepicker-toggle matSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Disease / Condition</mat-label>
          <input matInput [(ngModel)]="disease" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Symptoms</mat-label>
          <input matInput [(ngModel)]="symptoms" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Medicine</mat-label>
          <input matInput [(ngModel)]="medicine" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Dosage</mat-label>
          <input matInput [(ngModel)]="dosage" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Doctor / Vet</mat-label>
          <input matInput [(ngModel)]="doctor" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Temperature (°F)</mat-label>
          <input matInput type="number" [(ngModel)]="temperature" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Weight (kg)</mat-label>
          <input matInput type="number" [(ngModel)]="weight" min="0" />
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
      <button mat-flat-button color="primary" [disabled]="saving()" (click)="save()">
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
export class MedicalDialogComponent {
  data = inject<MedicalDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<MedicalDialogComponent>);
  private animalService = inject(AnimalService);

  saving = signal(false);
  error = signal('');

  recordType: 'treatment' | 'checkup' | 'surgery' | 'emergency' = 'treatment';
  date: Date = new Date();
  disease = '';
  symptoms = '';
  medicine = '';
  dosage = '';
  doctor = '';
  temperature: number | null = null;
  weight: number | null = null;
  cost: number | null = null;
  note = '';

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const entry: MedicalEntry = {
        id: crypto.randomUUID(),
        date: Timestamp.fromDate(this.date),
        type: this.recordType,
        ...(this.disease ? { disease: this.disease } : {}),
        ...(this.symptoms ? { symptoms: this.symptoms } : {}),
        ...(this.medicine ? { medicine: this.medicine } : {}),
        ...(this.dosage ? { dosage: this.dosage } : {}),
        ...(this.doctor ? { doctor: this.doctor } : {}),
        ...(this.temperature ? { temperature: this.temperature } : {}),
        ...(this.weight ? { weight: this.weight } : {}),
        ...(this.cost ? { cost: this.cost } : {}),
        ...(this.note ? { note: this.note } : {}),
      };
      await this.animalService.addMedicalRecord(this.data.animalId, entry);
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
