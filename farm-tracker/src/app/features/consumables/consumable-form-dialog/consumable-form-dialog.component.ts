import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { Timestamp } from '@angular/fire/firestore';
import { InventoryItemService } from '../../../core/services/inventory-item.service';
import { InventoryItem, ConsumableCategory } from '../../../core/models/inventory-item.model';
import { SegmentService } from '../../../core/services/segment.service';
import { AuthService } from '../../../core/services/auth.service';
import { Segment } from '../../../core/models/segment.model';
import { ToastService } from '../../../core/services/toast.service';

export interface ConsumableFormDialogData {
  item?: InventoryItem;
}

const CATEGORY_OPTIONS: { value: ConsumableCategory; label: string }[] = [
  { value: 'feed', label: 'Feed' },
  { value: 'medicine', label: 'Medicine' },
  { value: 'fertilizer', label: 'Fertilizer' },
  { value: 'seeds', label: 'Seeds' },
  { value: 'fuel', label: 'Fuel' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'tools', label: 'Tools' },
  { value: 'other', label: 'Other' },
];

@Component({
  selector: 'app-consumable-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.item ? 'Edit' : 'Add' }} Consumable Item</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput [(ngModel)]="name" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <mat-select [(ngModel)]="category">
            @for (opt of categoryOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Unit</mat-label>
          <input matInput [(ngModel)]="unit" placeholder="kg, liters, bags..." />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Minimum Stock</mat-label>
          <input matInput type="number" [(ngModel)]="minimumStock" min="0" />
        </mat-form-field>

        @if (!data.item) {
          <mat-form-field appearance="outline">
            <mat-label>Opening Stock</mat-label>
            <input matInput type="number" [(ngModel)]="openingStock" min="0" />
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Segments</mat-label>
          <mat-select [(ngModel)]="selectedSegments" multiple>
            @for (seg of segments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
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
      <button mat-flat-button color="primary" [disabled]="saving() || !name().trim()" (click)="save()">
        {{ saving() ? 'Saving...' : (data.item ? 'Update' : 'Add Item') }}
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
export class ConsumableFormDialogComponent implements OnInit {
  data = inject<ConsumableFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ConsumableFormDialogComponent>);
  private inventoryService = inject(InventoryItemService);
  private segmentService = inject(SegmentService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  segments = signal<Segment[]>([]);

  categoryOptions = CATEGORY_OPTIONS;

  name = signal('');
  category = signal<ConsumableCategory>('other');
  unit = signal('kg');
  minimumStock = signal<number | null>(null);
  openingStock: number | null = null;
  selectedSegments = signal<string[]>([]);
  note = signal('');

  async ngOnInit(): Promise<void> {
    try {
      this.segments.set(await this.segmentService.getAll());
    } catch (err) {
      console.error('Failed to load segments', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load segments');
    }

    if (this.data?.item) {
      this.name.set(this.data.item.name);
      this.category.set(this.data.item.category);
      this.unit.set(this.data.item.unit);
      this.minimumStock.set(this.data.item.minimumStock ?? null);
      this.selectedSegments.set(this.data.item.segments || []);
      this.note.set(this.data.item.note || '');
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const allSegments = this.segments();
      const segmentNames = this.selectedSegments().map(id => {
        const seg = allSegments.find(s => s.id === id);
        return seg ? seg.name : id;
      });

      const formData: Partial<InventoryItem> = {
        name: this.name(),
        category: this.category(),
        unit: this.unit(),
        minimumStock: this.minimumStock() ?? undefined,
        segments: this.selectedSegments(),
        segmentNames,
        note: this.note(),
      };

      if (this.data?.item) {
        await this.inventoryService.update(this.data.item.id, formData);
      } else {
        // Create with opening stock
        formData.currentStock = this.openingStock && this.openingStock > 0 ? this.openingStock : 0;
        const itemId = await this.inventoryService.create(formData);

        // Add opening movement if stock > 0
        if (this.openingStock && this.openingStock > 0) {
          const item = await this.inventoryService.getById(itemId);
          if (item) {
            await this.inventoryService.update(itemId, {
              movements: [{
                id: crypto.randomUUID(),
                date: Timestamp.now(),
                type: 'opening' as const,
                quantity: this.openingStock,
                note: 'Opening stock',
                recordedBy: item.createdBy,
                recordedByName: item.createdByName,
              }],
            });
          }
        }
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
