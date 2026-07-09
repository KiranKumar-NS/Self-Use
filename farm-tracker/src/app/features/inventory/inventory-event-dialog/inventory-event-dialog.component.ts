import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { InventoryService } from '../../../core/services/inventory.service';
import { SegmentService } from '../../../core/services/segment.service';
import { AnimalService } from '../../../core/services/animal.service';
import { BuyerService } from '../../../core/services/buyer.service';
import { Segment } from '../../../core/models/segment.model';
import { Animal } from '../../../core/models/animal.model';
import { Buyer } from '../../../core/models/buyer.model';
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
    MatInputModule, MatSelectModule, MatDatepickerModule, MatAutocompleteModule, MatCheckboxModule,
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
          <input matInput [matDatepicker]="picker" [(ngModel)]="date" [max]="today" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Note</mat-label>
          <input matInput [(ngModel)]="note" />
        </mat-form-field>

        <!-- Link to Animal (sale/death) -->
        @if (eventType === 'sale' || eventType === 'death') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Link to Animal (optional)</mat-label>
            <mat-select [(ngModel)]="linkedAnimalId">
              <mat-option value="">None</mat-option>
              @for (animal of activeAnimals(); track animal.id) {
                <mat-option [value]="animal.id">{{ animalService.getDisplayName(animal) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <!-- Buyer (sale only) -->
        @if (eventType === 'sale') {
          <mat-form-field appearance="outline">
            <mat-label>Buyer (optional)</mat-label>
            <mat-select [(ngModel)]="buyerId">
              <mat-option value="">None</mat-option>
              @for (b of buyers(); track b.id) {
                <mat-option [value]="b.id">{{ b.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Sale Price (optional)</mat-label>
            <input matInput type="number" [(ngModel)]="salePrice" min="0" />
          </mat-form-field>
        }

        <!-- Estimated value (death only - for mortality loss tracking) -->
        @if (eventType === 'death') {
          <mat-form-field appearance="outline">
            <mat-label>Estimated Value (optional)</mat-label>
            <input matInput type="number" [(ngModel)]="estimatedValue" min="0"
              placeholder="Estimated market value of lost animal(s)" />
          </mat-form-field>
        }

        <!-- Auto-create animal record (purchase/birth only, not edit mode) -->
        @if (!isEdit && (eventType === 'purchase' || eventType === 'birth')) {
          <div class="full-width animal-record-section">
            <mat-checkbox [(ngModel)]="createAnimalRecord">
              Also create animal record
            </mat-checkbox>
            <span class="hint">{{ count > 1 ? 'Creates a batch record' : 'Creates an individual record' }}</span>
          </div>

          @if (createAnimalRecord) {
            @if (eventType === 'purchase') {
              <mat-form-field appearance="outline">
                <mat-label>Purchase Price (total)</mat-label>
                <input matInput type="number" [(ngModel)]="purchasePrice" min="0" />
              </mat-form-field>
            }

            @if (count > 1) {
              <mat-form-field appearance="outline">
                <mat-label>Batch Label</mat-label>
                <input matInput [(ngModel)]="batchLabel" [placeholder]="suggestedBatchLabel()" />
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline">
                <mat-label>Tag / ID (optional)</mat-label>
                <input matInput [(ngModel)]="animalTag" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Name (optional)</mat-label>
                <input matInput [(ngModel)]="animalName" />
              </mat-form-field>
            }
          }
        }
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
    .error-msg { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
    .animal-record-section { display: flex; align-items: center; gap: 12px; margin: 4px 0 8px; }
    .animal-record-section .hint { font-size: 0.75rem; color: var(--color-text-muted); }
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
  animalService = inject(AnimalService);
  private buyerService = inject(BuyerService);

  segments = signal<Segment[]>([]);
  activeAnimals = signal<Animal[]>([]);
  buyers = signal<Buyer[]>([]);
  saving = signal(false);
  error = signal('');

  today = new Date();
  isEdit = false;
  segment = '';
  eventType: InventoryEventType = 'birth';
  count = 1;
  breed = '';
  date = new Date();
  note = '';
  linkedAnimalId = '';
  buyerId = '';
  salePrice: number | null = null;
  estimatedValue: number | null = null;
  createAnimalRecord = true;
  purchasePrice: number | null = null;
  batchLabel = '';
  animalTag = '';
  animalName = '';
  eventTypeOptions = ANIMAL_EVENT_TYPES;
  private allBreeds: string[] = [];

  async ngOnInit(): Promise<void> {
    const [segs, buyers] = await Promise.all([this.segmentService.getAll(), this.buyerService.getAll()]);
    this.segments.set(segs);
    this.buyers.set(buyers);

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
    this.linkedAnimalId = '';
    if (this.segment) {
      this.loadBreeds(this.segment);
      this.loadAnimals(this.segment);
    }
  }

  private async loadAnimals(segmentId: string): Promise<void> {
    this.activeAnimals.set(await this.animalService.getActiveBySegment(segmentId));
  }

  private loadBreeds(segmentId: string): void {
    const seg = this.segments().find(s => s.id === segmentId);
    this.allBreeds = seg?.breeds || [];
  }

  suggestedBatchLabel(): string {
    const seg = this.segments().find(s => s.id === this.segment);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${seg?.name || 'Batch'} ${monthNames[this.date.getMonth()]}-${this.date.getFullYear()}`;
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
        estimatedValue: this.eventType === 'death' && this.estimatedValue ? this.estimatedValue : undefined,
      };

      if (this.isEdit && this.data.event) {
        await this.inventoryService.updateEvent(this.data.event.id, this.data.event, formData);
      } else {
        const eventId = await this.inventoryService.recordEvent(formData);

        // Auto-create animal record for purchase/birth
        if (this.createAnimalRecord && (this.eventType === 'purchase' || this.eventType === 'birth')) {
          const seg = this.segments().find(s => s.id === this.segment);
          const isBatch = this.count > 1;
          await this.animalService.create({
            segment: this.segment,
            segmentName: seg?.name || this.segment,
            trackingMode: isBatch ? 'batch' : 'individual',
            batchSize: this.count,
            batchLabel: isBatch ? (this.batchLabel.trim() || this.suggestedBatchLabel()) : undefined,
            tag: !isBatch ? this.animalTag.trim() || undefined : undefined,
            name: !isBatch ? this.animalName.trim() || undefined : undefined,
            breed: this.breed.trim() || undefined,
            origin: this.eventType as 'purchase' | 'birth',
            originDate: this.date,
            purchasePrice: this.eventType === 'purchase' ? (this.purchasePrice || 0) : undefined,
            originInventoryEventId: eventId,
          });
        }

        // Update linked animal on sale/death
        if (this.linkedAnimalId) {
          if (this.eventType === 'sale') {
            const buyer = this.buyerId ? this.buyers().find(b => b.id === this.buyerId) : null;
            await this.animalService.recordSale(this.linkedAnimalId, {
              salePrice: this.salePrice || 0,
              buyerId: this.buyerId || undefined,
              buyerName: buyer?.name || undefined,
              saleInventoryEventId: eventId,
              date: this.date,
              countSold: this.count,
            });
            if (this.buyerId && this.salePrice) {
              await this.buyerService.updateStats(this.buyerId, this.salePrice, this.count, this.date, this.segment);
            }
          } else if (this.eventType === 'death') {
            await this.animalService.recordDeath(this.linkedAnimalId, this.date, this.note, this.count);
          }
        }
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save event');
    } finally {
      this.saving.set(false);
    }
  }
}
