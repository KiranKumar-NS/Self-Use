import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { CropActivityService } from '../../../core/services/crop-activity.service';
import { CropActivity, CropActivityType } from '../../../core/models/crop-activity.model';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { Timestamp } from '@angular/fire/firestore';

export interface CropActivityFormDialogData {
  activity?: CropActivity;
}

@Component({
  selector: 'app-crop-activity-form-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>{{ data.activity ? 'Edit' : 'Add' }} Crop Activity</h2>
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
          <mat-label>Activity Type</mat-label>
          <mat-select [(ngModel)]="activityType" required>
            @for (type of activityTypes; track type) {
              <mat-option [value]="type">{{ formatType(type) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="date" [max]="today" required />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <input matInput [(ngModel)]="description" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Product Used</mat-label>
          <input matInput [(ngModel)]="productUsed" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Quantity</mat-label>
          <input matInput type="number" [(ngModel)]="quantity" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Unit</mat-label>
          <input matInput [(ngModel)]="unit" placeholder="kg, litres, bags..." />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Area</mat-label>
          <input matInput [(ngModel)]="area" placeholder="e.g. 2 acres" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Duration (hours)</mat-label>
          <input matInput type="number" [(ngModel)]="duration" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Labor Count</mat-label>
          <input matInput type="number" [(ngModel)]="laborCount" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Cost</mat-label>
          <input matInput type="number" [(ngModel)]="cost" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Weather</mat-label>
          <input matInput [(ngModel)]="weather" placeholder="Sunny, Rainy..." />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Temperature (°C)</mat-label>
          <input matInput type="number" [(ngModel)]="temperature" />
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
      <button mat-flat-button color="primary" [disabled]="saving() || !segment || !activityType" (click)="save()">
        {{ saving() ? 'Saving...' : (data.activity ? 'Update' : 'Add Activity') }}
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
export class CropActivityFormDialogComponent implements OnInit {
  data = inject<CropActivityFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<CropActivityFormDialogComponent>);
  private cropActivityService = inject(CropActivityService);
  private segmentService = inject(SegmentService);

  saving = signal(false);
  error = signal('');
  cropSegments = signal<Segment[]>([]);

  activityTypes: CropActivityType[] = [
    'irrigation', 'fertilizer', 'pruning', 'spraying', 'weeding',
    'flowering', 'harvest', 'planting', 'mulching', 'soil_testing', 'other',
  ];

  today = new Date();
  segment = '';
  activityType: CropActivityType = 'other';
  date: Date = new Date();
  description = '';
  productUsed = '';
  quantity: number | null = null;
  unit = '';
  area = '';
  duration: number | null = null;
  laborCount: number | null = null;
  cost: number | null = null;
  weather = '';
  temperature: number | null = null;
  note = '';

  async ngOnInit(): Promise<void> {
    const allSegments = await this.segmentService.getAll();
    this.cropSegments.set(allSegments.filter(s => s.segmentType === 'crop'));

    if (this.data?.activity) {
      const a = this.data.activity;
      this.segment = a.segment;
      this.activityType = a.activityType;
      this.date = a.date?.toDate() || new Date();
      this.description = a.description || '';
      this.productUsed = a.productUsed || '';
      this.quantity = a.quantity ?? null;
      this.unit = a.unit || '';
      this.area = a.area || '';
      this.duration = a.duration ?? null;
      this.laborCount = a.laborCount ?? null;
      this.cost = a.cost ?? null;
      this.weather = a.weather || '';
      this.temperature = a.temperature ?? null;
      this.note = a.note || '';
    }
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const selectedSegment = this.cropSegments().find(s => s.id === this.segment);
      const formData: Partial<CropActivity> = {
        segment: this.segment,
        segmentName: selectedSegment?.name || '',
        activityType: this.activityType,
        date: Timestamp.fromDate(this.date),
        description: this.description,
        productUsed: this.productUsed || undefined,
        quantity: this.quantity ?? undefined,
        unit: this.unit || undefined,
        area: this.area || undefined,
        duration: this.duration ?? undefined,
        laborCount: this.laborCount ?? undefined,
        cost: this.cost ?? undefined,
        weather: this.weather || undefined,
        temperature: this.temperature ?? undefined,
        note: this.note || undefined,
      };

      if (this.data?.activity) {
        await this.cropActivityService.update(this.data.activity.id, formData);
      } else {
        await this.cropActivityService.create(formData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
