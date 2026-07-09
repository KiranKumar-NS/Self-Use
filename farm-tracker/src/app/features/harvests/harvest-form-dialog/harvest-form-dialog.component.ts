import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { HarvestService } from '../../../core/services/harvest.service';
import { Harvest } from '../../../core/models/harvest.model';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { Timestamp } from '@angular/fire/firestore';

export interface HarvestFormDialogData {
  harvest?: Harvest;
}

@Component({
  selector: 'app-harvest-form-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>{{ data.harvest ? 'Edit' : 'Record' }} Harvest</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="segment" required>
            @for (seg of cropSegments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Crop Name</mat-label>
          <input matInput [(ngModel)]="cropName" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Variety</mat-label>
          <input matInput [(ngModel)]="variety" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Harvest Date</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="harvestDate" [max]="today" required />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Total Quantity</mat-label>
          <input matInput type="number" [(ngModel)]="totalQuantity" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Unit</mat-label>
          <mat-select [(ngModel)]="unit">
            <mat-option value="kg">kg</mat-option>
            <mat-option value="dozen">dozen</mat-option>
            <mat-option value="pieces">pieces</mat-option>
            <mat-option value="bag">bag</mat-option>
            <mat-option value="bundle">bundle</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Grade</mat-label>
          <input matInput [(ngModel)]="grade" placeholder="A, B, Premium..." />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Storage Location</mat-label>
          <input matInput [(ngModel)]="storageLocation" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Harvest Cost</mat-label>
          <input matInput type="number" [(ngModel)]="harvestCost" min="0" />
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
      <button mat-flat-button color="primary" [disabled]="saving() || !segment || !cropName.trim() || !totalQuantity" (click)="save()">
        {{ saving() ? 'Saving...' : (data.harvest ? 'Update' : 'Record Harvest') }}
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
export class HarvestFormDialogComponent implements OnInit {
  data = inject<HarvestFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<HarvestFormDialogComponent>);
  private harvestService = inject(HarvestService);
  private segmentService = inject(SegmentService);

  saving = signal(false);
  error = signal('');
  cropSegments = signal<Segment[]>([]);

  today = new Date();
  segment = '';
  cropName = '';
  variety = '';
  harvestDate: Date = new Date();
  totalQuantity: number | null = null;
  unit = 'kg';
  grade = '';
  storageLocation = '';
  harvestCost: number | null = null;
  note = '';

  async ngOnInit(): Promise<void> {
    const allSegments = await this.segmentService.getAll();
    this.cropSegments.set(allSegments.filter(s => s.segmentType === 'crop'));

    if (this.data?.harvest) {
      const h = this.data.harvest;
      this.segment = h.segment;
      this.cropName = h.cropName;
      this.variety = h.variety || '';
      this.harvestDate = h.harvestDate?.toDate() || new Date();
      this.totalQuantity = h.totalQuantity;
      this.unit = h.unit || 'kg';
      this.grade = h.grade || '';
      this.storageLocation = h.storageLocation || '';
      this.harvestCost = h.harvestCost ?? null;
      this.note = h.note || '';
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const selectedSegment = this.cropSegments().find(s => s.id === this.segment);
      const formData: Partial<Harvest> = {
        segment: this.segment,
        segmentName: selectedSegment?.name || '',
        cropName: this.cropName,
        variety: this.variety || undefined,
        harvestDate: Timestamp.fromDate(this.harvestDate),
        totalQuantity: this.totalQuantity || 0,
        unit: this.unit,
        grade: this.grade || undefined,
        storageLocation: this.storageLocation || undefined,
        harvestCost: this.harvestCost ?? undefined,
        note: this.note || undefined,
      };

      if (this.data?.harvest) {
        await this.harvestService.update(this.data.harvest.id, formData);
      } else {
        await this.harvestService.create(formData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
