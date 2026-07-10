import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { InventoryItemService } from '../../../core/services/inventory-item.service';
import { InventoryItem } from '../../../core/models/inventory-item.model';
import { SupplierService } from '../../../core/services/supplier.service';
import { Supplier } from '../../../core/models/supplier.model';
import { ToastService } from '../../../core/services/toast.service';

export interface StockMovementDialogData {
  item: InventoryItem;
  type: 'purchase' | 'used' | 'wastage';
}

@Component({
  selector: 'app-stock-movement-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ titleLabel }}</h2>
    <mat-dialog-content>
      <div class="item-info">
        <span class="item-name">{{ data.item.name }}</span>
        <span class="current-stock">Current: {{ data.item.currentStock }} {{ data.item.unit }}</span>
      </div>

      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Quantity ({{ data.item.unit }})</mat-label>
          <input matInput type="number" [(ngModel)]="quantity" min="0.01" step="any" required />
        </mat-form-field>

        @if (data.type === 'purchase') {
          <mat-form-field appearance="outline">
            <mat-label>Unit Cost</mat-label>
            <input matInput type="number" [(ngModel)]="unitCost" min="0" step="any" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Supplier</mat-label>
            <mat-select [(ngModel)]="selectedSupplierId">
              <mat-option [value]="''">-- None --</mat-option>
              @for (s of suppliers(); track s.id) {
                <mat-option [value]="s.id">{{ s.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Note</mat-label>
            <input matInput [(ngModel)]="note" />
          </mat-form-field>
        }

        @if (data.type === 'used') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Note</mat-label>
            <input matInput [(ngModel)]="note" />
          </mat-form-field>
        }

        @if (data.type === 'wastage') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Reason</mat-label>
            <input matInput [(ngModel)]="reason" />
          </mat-form-field>
        }
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !quantity || quantity <= 0" (click)="save()">
        {{ saving() ? 'Saving...' : 'Record' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .item-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--color-primary-bg, #e3f2fd);
      padding: 10px 14px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .item-name { font-weight: 600; font-size: 1rem; }
    .current-stock { font-size: 0.85rem; color: var(--color-text-secondary, #666); }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .full-width { grid-column: 1 / -1; }
    .error-msg { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
    @media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } }
  `],
})
export class StockMovementDialogComponent implements OnInit {
  data = inject<StockMovementDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<StockMovementDialogComponent>);
  private inventoryService = inject(InventoryItemService);
  private supplierService = inject(SupplierService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  suppliers = signal<Supplier[]>([]);

  quantity: number | null = null;
  unitCost: number | null = null;
  selectedSupplierId = '';
  note = '';
  reason = '';

  get titleLabel(): string {
    const labels = { purchase: 'Record Purchase', used: 'Record Usage', wastage: 'Record Wastage' };
    return labels[this.data.type];
  }

  async ngOnInit(): Promise<void> {
    if (this.data.type === 'purchase') {
      try {
        this.suppliers.set(await this.supplierService.getAll());
      } catch (err) {
        console.error('Failed to load suppliers', err);
        this.toast.error(err instanceof Error ? err.message : 'Failed to load suppliers');
      }
    }
  }

  async save(): Promise<void> {
    if (!this.quantity || this.quantity <= 0) return;

    this.saving.set(true);
    this.error.set('');
    try {
      const itemId = this.data.item.id;

      if (this.data.type === 'purchase') {
        const supplier = this.selectedSupplierId
          ? this.suppliers().find(s => s.id === this.selectedSupplierId)
          : null;
        await this.inventoryService.recordPurchase(
          itemId,
          this.quantity,
          this.unitCost || 0,
          supplier?.id,
          supplier?.name,
          this.note || undefined
        );
      } else if (this.data.type === 'used') {
        await this.inventoryService.recordUsage(itemId, this.quantity, this.note || undefined);
      } else if (this.data.type === 'wastage') {
        await this.inventoryService.recordWastage(itemId, this.quantity, this.reason || undefined);
      }

      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to record');
    } finally {
      this.saving.set(false);
    }
  }
}
