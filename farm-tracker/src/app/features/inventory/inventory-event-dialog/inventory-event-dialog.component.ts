import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { InventoryService } from '../../../core/services/inventory.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { InventoryEventType } from '../../../core/models/inventory.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-inventory-event-dialog',
  standalone: true,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatNativeDateModule,
  ],
  template: `
    <h2 mat-dialog-title>Record Inventory Event</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="segment" required>
            @for (seg of segments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Event Type</mat-label>
          <mat-select [(ngModel)]="eventType" required>
            <mat-option value="birth">Birth / Hatched</mat-option>
            <mat-option value="purchase">Purchase</mat-option>
            <mat-option value="sale">Sale</mat-option>
            <mat-option value="death">Death</mat-option>
            <mat-option value="adjustment">Adjustment</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Count</mat-label>
          <input matInput type="number" [(ngModel)]="count" min="1" step="1" required />
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
        {{ saving() ? 'Saving...' : 'Record Event' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .full-width { grid-column: 1 / -1; }
    .error-msg { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
  `],
})
export class InventoryEventDialogComponent implements OnInit {
  dialogRef = inject(MatDialogRef<InventoryEventDialogComponent>);
  private inventoryService = inject(InventoryService);
  private segmentService = inject(SegmentService);

  segments = signal<Segment[]>([]);
  saving = signal(false);
  error = signal('');

  segment = '';
  eventType: InventoryEventType = 'birth';
  count = 1;
  date = new Date();
  note = '';

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const seg = this.segments().find(s => s.id === this.segment);
      await this.inventoryService.recordEvent({
        segment: this.segment,
        segmentName: seg?.name || this.segment,
        eventType: this.eventType,
        count: this.count,
        note: this.note,
        date: this.date,
        month: getMonthString(this.date),
        year: getYear(this.date),
      });
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to record event');
    } finally {
      this.saving.set(false);
    }
  }
}
