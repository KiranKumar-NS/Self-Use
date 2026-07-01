import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

import { InventoryService } from '../../../core/services/inventory.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { InventoryEvent, InventoryEventType } from '../../../core/models/inventory.model';
import { ANIMAL_EVENT_TYPES } from '../../../core/models/segment.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';

export interface InventoryEventDialogData {
  event?: InventoryEvent; // if provided, edit mode
}

@Component({
  selector: 'app-inventory-event-dialog',
  standalone: true,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatAutocompleteModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Edit' : 'Record' }} Inventory Event</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="segment" (selectionChange)="onSegmentChange()" required>
            @for (seg of animalSegments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Event Type</mat-label>
          <mat-select [(ngModel)]="eventType" required>
            @for (et of eventTypeOptions; track et.value) {
              <mat-option [value]="et.value">{{ et.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Count</mat-label>
          <input matInput type="number" [(ngModel)]="count" [min]="eventType === 'adjustment' ? null : 1" step="1" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Breed (optional)</mat-label>
          <input matInput [(ngModel)]="breed" [matAutocomplete]="breedAuto"
            placeholder="e.g. Jamunapari, Boer" />
          <mat-autocomplete #breedAuto="matAutocomplete">
            @for (b of filteredBreeds(); track b) {
              <mat-option [value]="b">{{ b }}</mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="date" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
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
      <button mat-flat-button color="primary"
        [disabled]="saving() || !segment || !eventType || !count"
        (click)="save()">
        {{ saving() ? 'Saving...' : (isEdit ? 'Update' : 'Record Event') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .full-width { grid-column: 1 / -1; }
    .error-msg { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
    @media (max-width: 480px) {
      .form-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class InventoryEventDialogComponent implements OnInit {
  data = inject<InventoryEventDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<InventoryEventDialogComponent>);
  private inventoryService = inject(InventoryService);
  private segmentService = inject(SegmentService);

  segments = signal<Segment[]>([]);
  saving = signal(false);
  error = signal('');

  isEdit = false;
  segment = '';
  eventType: InventoryEventType = 'birth';
  count = 1;
  breed = '';
  date = new Date();
  note = '';
  eventTypeOptions = ANIMAL_EVENT_TYPES;
  private allBreeds: string[] = [];

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());

    // Pre-fill if editing
    if (this.data?.event) {
      this.isEdit = true;
      const ev = this.data.event;
      this.segment = ev.segment;
      this.eventType = ev.eventType;
      this.count = ev.eventType === 'adjustment' ? ev.count : Math.abs(ev.count);
      this.breed = ev.breed || '';
      this.date = ev.date.toDate();
      this.note = ev.note;
      this.loadBreeds(ev.segment);
    }
  }

  animalSegments(): Segment[] {
    return this.segments().filter(s => s.segmentType !== 'crop');
  }

  onSegmentChange(): void {
    this.breed = '';
    if (this.segment) this.loadBreeds(this.segment);
  }

  private loadBreeds(segmentId: string): void {
    const seg = this.segments().find(s => s.id === segmentId);
    this.allBreeds = seg?.breeds || [];
  }

  filteredBreeds(): string[] {
    if (!this.breed) return this.allBreeds;
    const term = this.breed.toLowerCase();
    return this.allBreeds.filter(b => b.toLowerCase().includes(term));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const seg = this.segments().find(s => s.id === this.segment);
      const formData = {
        segment: this.segment,
        segmentName: seg?.name || this.segment,
        eventType: this.eventType,
        count: this.count,
        breed: this.breed.trim() || undefined,
        note: this.note,
        date: this.date,
        month: getMonthString(this.date),
        year: getYear(this.date),
      };

      if (this.isEdit && this.data.event) {
        await this.inventoryService.updateEvent(this.data.event.id, this.data.event, formData);
      } else {
        await this.inventoryService.recordEvent(formData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save event');
    } finally {
      this.saving.set(false);
    }
  }
}
