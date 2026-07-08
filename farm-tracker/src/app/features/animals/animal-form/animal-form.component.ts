import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AnimalService } from '../../../core/services/animal.service';
import { SegmentService } from '../../../core/services/segment.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { Segment } from '../../../core/models/segment.model';
import { TrackingMode } from '../../../core/models/animal.model';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { getMonthString, getYear } from '../../../core/utils/date.utils';

@Component({
  selector: 'app-animal-form',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatRadioModule,
    MatIconModule, MatAutocompleteModule,
  ],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit' : 'Register' }} Animal</h1>
    </div>

    <mat-card class="form-card">
      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <form (ngSubmit)="save()">
        <!-- Segment -->
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Segment</mat-label>
            <mat-select [(ngModel)]="segment" name="segment" required (selectionChange)="onSegmentChange()">
              @for (seg of animalSegments(); track seg.id) {
                <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
              }
            </mat-select>
            <mat-error>Required</mat-error>
          </mat-form-field>
        </div>

        <!-- Tracking Mode -->
        <div class="form-row">
          <div class="radio-group">
            <label class="field-label">Tracking Mode</label>
            <mat-radio-group [(ngModel)]="trackingMode" name="trackingMode">
              <mat-radio-button value="individual">Individual</mat-radio-button>
              <mat-radio-button value="batch">Batch</mat-radio-button>
            </mat-radio-group>
          </div>
        </div>

        <!-- Individual fields -->
        @if (trackingMode === 'individual') {
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Tag / ID</mat-label>
              <input matInput [(ngModel)]="tag" name="tag" placeholder="e.g. G-001" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Name</mat-label>
              <input matInput [(ngModel)]="name" name="name" placeholder="e.g. Brownie" />
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Gender</mat-label>
              <mat-select [(ngModel)]="gender" name="gender">
                <mat-option value="">-</mat-option>
                <mat-option value="male">Male</mat-option>
                <mat-option value="female">Female</mat-option>
                <mat-option value="unknown">Unknown</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Breed</mat-label>
              <input matInput [(ngModel)]="breed" name="breed" [matAutocomplete]="breedAuto" />
              <mat-autocomplete #breedAuto="matAutocomplete">
                @for (b of filteredBreeds(); track b) {
                  <mat-option [value]="b">{{ b }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          </div>
        }

        <!-- Batch fields -->
        @if (trackingMode === 'batch') {
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Batch Label</mat-label>
              <input matInput [(ngModel)]="batchLabel" name="batchLabel" placeholder="e.g. Batch Mar-2026" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Batch Size (count)</mat-label>
              <input matInput type="number" [(ngModel)]="batchSize" name="batchSize" min="1" required />
              <mat-error>Required</mat-error>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Breed</mat-label>
              <input matInput [(ngModel)]="breed" name="breed" [matAutocomplete]="breedAuto2" />
              <mat-autocomplete #breedAuto2="matAutocomplete">
                @for (b of filteredBreeds(); track b) {
                  <mat-option [value]="b">{{ b }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          </div>
        }

        <!-- Origin -->
        <div class="form-row">
          <div class="radio-group">
            <label class="field-label">Origin</label>
            <mat-radio-group [(ngModel)]="origin" name="origin">
              <mat-radio-button value="birth">Born on farm</mat-radio-button>
              <mat-radio-button value="purchase">Purchased</mat-radio-button>
            </mat-radio-group>
          </div>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ origin === 'birth' ? 'Birth Date' : 'Purchase Date' }}</mat-label>
            <input matInput [matDatepicker]="picker" [(ngModel)]="originDate" name="originDate" required />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
            <mat-error>Required</mat-error>
          </mat-form-field>

          @if (origin === 'purchase') {
            <mat-form-field appearance="outline">
              <mat-label>Purchase Price (INR)</mat-label>
              <input matInput type="number" [(ngModel)]="purchasePrice" name="purchasePrice" min="0" />
            </mat-form-field>
          }
        </div>

        <!-- Note -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Note</mat-label>
          <textarea matInput [(ngModel)]="note" name="note" rows="2"></textarea>
        </mat-form-field>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving...' : (isEdit() ? 'Update' : 'Register') }}
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: var(--color-text); }
    .form-card { max-width: 700px; padding: 1.5rem; margin: 0 auto; }
    .form-row { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
    .form-row mat-form-field { flex: 1; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .error-message { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    .radio-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 0.5rem; }
    .field-label { font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600; }
    mat-radio-group { display: flex; gap: 1rem; }
    @media (max-width: 640px) {
      .form-row { flex-direction: column; gap: 0.5rem; }
      .form-card { padding: 1rem; }
    }
  `],
})
export class AnimalFormComponent implements OnInit {
  private animalService = inject(AnimalService);
  private segmentService = inject(SegmentService);
  private inventoryService = inject(InventoryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  error = signal('');
  saving = signal(false);

  allSegments = signal<Segment[]>([]);

  segment = '';
  trackingMode: TrackingMode = 'individual';
  tag = '';
  name = '';
  breed = '';
  gender: '' | 'male' | 'female' | 'unknown' = '';
  batchLabel = '';
  batchSize = 1;
  origin: 'birth' | 'purchase' = 'purchase';
  originDate = new Date();
  purchasePrice: number | null = null;
  note = '';

  private editId = '';
  private allBreeds: string[] = [];

  async ngOnInit(): Promise<void> {
    this.allSegments.set(await this.segmentService.getAll());

    this.editId = this.route.snapshot.params['id'];
    if (this.editId) {
      this.isEdit.set(true);
      const animal = await this.animalService.getById(this.editId);
      if (animal) {
        this.segment = animal.segment;
        this.trackingMode = animal.trackingMode;
        this.tag = animal.tag || '';
        this.name = animal.name || '';
        this.breed = animal.breed || '';
        this.gender = animal.gender || '';
        this.batchLabel = animal.batchLabel || '';
        this.batchSize = animal.batchSize;
        this.origin = animal.origin;
        this.originDate = animal.originDate.toDate();
        this.purchasePrice = animal.purchasePrice || null;
        this.note = animal.note || '';
        this.loadBreeds(animal.segment);
      }
    }
  }

  animalSegments(): Segment[] {
    return this.allSegments().filter(s => s.segmentType !== 'crop');
  }

  onSegmentChange(): void {
    this.breed = '';
    if (this.segment) {
      this.loadBreeds(this.segment);
      // Auto-set tracking mode based on segment
      const seg = this.allSegments().find(s => s.id === this.segment);
      if (seg?.id === 'goats') this.trackingMode = 'individual';
      else if (seg?.id === 'chickens') this.trackingMode = 'batch';
    }
  }

  private loadBreeds(segmentId: string): void {
    const seg = this.allSegments().find(s => s.id === segmentId);
    this.allBreeds = seg?.breeds || [];
  }

  filteredBreeds(): string[] {
    if (!this.breed) return this.allBreeds;
    const term = this.breed.toLowerCase();
    return this.allBreeds.filter(b => b.toLowerCase().includes(term));
  }

  async save(): Promise<void> {
    this.error.set('');
    this.saving.set(true);

    try {
      const seg = this.allSegments().find(s => s.id === this.segment);

      const formData = {
        segment: this.segment,
        segmentName: seg?.name || this.segment,
        trackingMode: this.trackingMode,
        tag: this.tag.trim() || undefined,
        name: this.name.trim() || undefined,
        breed: this.breed.trim() || undefined,
        gender: this.gender || undefined,
        batchLabel: this.batchLabel.trim() || undefined,
        batchSize: this.trackingMode === 'batch' ? this.batchSize : 1,
        origin: this.origin,
        originDate: this.originDate,
        purchasePrice: this.origin === 'purchase' ? (this.purchasePrice || 0) : 0,
        note: this.note.trim() || undefined,
      };

      if (this.isEdit()) {
        await this.animalService.update(this.editId, formData);
      } else {
        const animalId = await this.animalService.create(formData);

        // Create inventory event to keep stock counts in sync
        const count = this.trackingMode === 'batch' ? this.batchSize : 1;
        await this.inventoryService.recordEvent({
          segment: this.segment,
          segmentName: seg?.name || this.segment,
          eventType: this.origin === 'purchase' ? 'purchase' : 'birth',
          count,
          breed: this.breed.trim() || undefined,
          note: `Registered: ${this.name.trim() || this.tag.trim() || this.batchLabel.trim() || formData.segmentName}`,
          date: this.originDate,
          month: getMonthString(this.originDate),
          year: getYear(this.originDate),
        });
      }
      this.router.navigate(['/stock']);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/stock']);
  }
}
