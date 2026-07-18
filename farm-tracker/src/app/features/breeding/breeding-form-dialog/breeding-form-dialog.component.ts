import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Timestamp } from '@angular/fire/firestore';

import { BreedingService } from '../../../core/services/breeding.service';
import { BreedingRecord, BreedingStatus } from '../../../core/models/breeding.model';
import { AnimalService } from '../../../core/services/animal.service';
import { SegmentService } from '../../../core/services/segment.service';
import { ToastService } from '../../../core/services/toast.service';
import { Animal } from '../../../core/models/animal.model';
import { Segment } from '../../../core/models/segment.model';

export interface BreedingFormDialogData {
  record?: BreedingRecord;
}

@Component({
  selector: 'app-breeding-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule],
  template: `
    <h2 mat-dialog-title>{{ data.record ? 'Edit' : 'Record' }} Breeding</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="selectedSegment" (selectionChange)="onSegmentChange()" required>
            @for (seg of segments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [(ngModel)]="status">
            <mat-option value="mated">Mated</mat-option>
            <mat-option value="confirmed_pregnant">Confirmed Pregnant</mat-option>
            <mat-option value="delivered">Delivered</mat-option>
            <mat-option value="failed">Failed</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Dam (Female)</mat-label>
          <mat-select [(ngModel)]="damId" (selectionChange)="onDamChange()" required>
            @for (a of femaleAnimals(); track a.id) {
              <mat-option [value]="a.id">{{ animalService.getDisplayName(a) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Sire (Male)</mat-label>
          <mat-select [(ngModel)]="sireId" (selectionChange)="onSireChange()">
            <mat-option value="">Unknown / External</mat-option>
            @for (a of maleAnimals(); track a.id) {
              <mat-option [value]="a.id">{{ animalService.getDisplayName(a) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Mating Date</mat-label>
          <input matInput [matDatepicker]="matingPicker" [(ngModel)]="matingDate" [max]="today" required />
          <mat-datepicker-toggle matSuffix [for]="matingPicker" />
          <mat-datepicker #matingPicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Method</mat-label>
          <mat-select [(ngModel)]="matingMethod">
            <mat-option value="natural">Natural</mat-option>
            <mat-option value="artificial">Artificial</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Expected Delivery Date</mat-label>
          <input matInput [matDatepicker]="expectedPicker" [(ngModel)]="expectedDeliveryDate" />
          <mat-datepicker-toggle matSuffix [for]="expectedPicker" />
          <mat-datepicker #expectedPicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Gestation Days</mat-label>
          <input matInput type="number" [(ngModel)]="gestationDays" min="1" />
        </mat-form-field>

        @if (status() === 'delivered') {
          <mat-form-field appearance="outline">
            <mat-label>Actual Delivery Date</mat-label>
            <input matInput [matDatepicker]="actualPicker" [(ngModel)]="actualDeliveryDate" [max]="today" />
            <mat-datepicker-toggle matSuffix [for]="actualPicker" />
            <mat-datepicker #actualPicker />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Offspring Count</mat-label>
            <input matInput type="number" [(ngModel)]="offspringCount" min="0" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Male Offspring</mat-label>
            <input matInput type="number" [(ngModel)]="offspringMale" min="0" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Female Offspring</mat-label>
            <input matInput type="number" [(ngModel)]="offspringFemale" min="0" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Complications</mat-label>
            <input matInput [(ngModel)]="complications" />
          </mat-form-field>
        }

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
      <button mat-flat-button color="primary" [disabled]="saving() || !damId() || !selectedSegment()" (click)="save()">
        {{ saving() ? 'Saving...' : (data.record ? 'Update' : 'Record') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [],
})
export class BreedingFormDialogComponent implements OnInit {
  data = inject<BreedingFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<BreedingFormDialogComponent>);
  private breedingService = inject(BreedingService);
  animalService = inject(AnimalService);
  private segmentService = inject(SegmentService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  segments = signal<Segment[]>([]);
  animals = signal<Animal[]>([]);

  today = new Date();
  selectedSegment = signal('');
  status = signal<BreedingStatus>('mated');
  damId = signal('');
  sireId = signal('');
  matingDate = signal<Date>(new Date());
  matingMethod = signal<'natural' | 'artificial'>('natural');
  expectedDeliveryDate = signal<Date | null>(null);
  gestationDays = signal<number | null>(null);
  actualDeliveryDate = signal<Date | null>(null);
  offspringCount = signal<number | null>(null);
  offspringMale = signal<number | null>(null);
  offspringFemale = signal<number | null>(null);
  complications = signal('');
  note = signal('');

  private damName = '';
  private sireName = '';
  private segmentName = '';

  async ngOnInit(): Promise<void> {
    try {
      const segs = await this.segmentService.getAll();
      this.segments.set(segs.filter(s => s.segmentType === 'animal'));
    } catch (err) {
      console.error('Failed to load segments', err);
      this.toast.error('Failed to load segments. Check your connection and try again.');
    }

    if (this.data?.record) {
      const r = this.data.record;
      this.selectedSegment.set(r.segment);
      this.segmentName = r.segmentName;
      this.status.set(r.status);
      this.damId.set(r.damId);
      this.damName = r.damName;
      this.sireId.set(r.sireId || '');
      this.sireName = r.sireName || '';
      this.matingDate.set(r.matingDate.toDate());
      this.matingMethod.set(r.matingMethod || 'natural');
      this.expectedDeliveryDate.set(r.expectedDeliveryDate?.toDate() || null);
      this.gestationDays.set(r.gestationDays || null);
      this.actualDeliveryDate.set(r.actualDeliveryDate?.toDate() || null);
      this.offspringCount.set(r.offspringCount || null);
      this.offspringMale.set(r.offspringMale || null);
      this.offspringFemale.set(r.offspringFemale || null);
      this.complications.set(r.complications || '');
      this.note.set(r.note || '');
      await this.loadAnimals();
    }
  }

  async onSegmentChange(): Promise<void> {
    const seg = this.segments().find(s => s.id === this.selectedSegment());
    this.segmentName = seg?.name || '';
    await this.loadAnimals();
  }

  private async loadAnimals(): Promise<void> {
    if (!this.selectedSegment()) return;
    try {
      this.animals.set(await this.animalService.getActiveBySegment(this.selectedSegment()));
    } catch (err) {
      console.error('Failed to load animals', err);
      this.toast.error('Failed to load animals. Check your connection and try again.');
    }
  }

  femaleAnimals(): Animal[] {
    return this.animals().filter(a => a.gender === 'female' || a.gender === 'unknown');
  }

  maleAnimals(): Animal[] {
    return this.animals().filter(a => a.gender === 'male' || a.gender === 'unknown');
  }

  onDamChange(): void {
    const a = this.animals().find(an => an.id === this.damId());
    this.damName = a ? this.animalService.getDisplayName(a) : '';
  }

  onSireChange(): void {
    const a = this.animals().find(an => an.id === this.sireId());
    this.sireName = a ? this.animalService.getDisplayName(a) : '';
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const recordData: Partial<BreedingRecord> = {
        segment: this.selectedSegment(),
        segmentName: this.segmentName,
        damId: this.damId(),
        damName: this.damName,
        status: this.status(),
        matingDate: Timestamp.fromDate(this.matingDate()),
        matingMethod: this.matingMethod(),
        note: this.note(),
      };

      if (this.sireId()) {
        recordData.sireId = this.sireId();
        recordData.sireName = this.sireName;
      }
      const expectedDeliveryDate = this.expectedDeliveryDate();
      if (expectedDeliveryDate) recordData.expectedDeliveryDate = Timestamp.fromDate(expectedDeliveryDate);
      if (this.gestationDays()) recordData.gestationDays = this.gestationDays()!;
      if (this.status() === 'delivered') {
        const actualDeliveryDate = this.actualDeliveryDate();
        if (actualDeliveryDate) recordData.actualDeliveryDate = Timestamp.fromDate(actualDeliveryDate);
        if (this.offspringCount() != null) recordData.offspringCount = this.offspringCount()!;
        if (this.offspringMale() != null) recordData.offspringMale = this.offspringMale()!;
        if (this.offspringFemale() != null) recordData.offspringFemale = this.offspringFemale()!;
        if (this.complications()) recordData.complications = this.complications();
      }

      if (this.data?.record) {
        await this.breedingService.update(this.data.record.id, recordData);
      } else {
        await this.breedingService.create(recordData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
