import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';

import { InventoryItemService } from '../../../core/services/inventory-item.service';
import { InventoryItem } from '../../../core/models/inventory-item.model';
import { SupplierService } from '../../../core/services/supplier.service';
import { Supplier } from '../../../core/models/supplier.model';
import { TransactionService } from '../../../core/services/transaction.service';
import { SegmentService } from '../../../core/services/segment.service';
import { CategoryService } from '../../../core/services/category.service';
import { TagService } from '../../../core/services/tag.service';
import { Segment } from '../../../core/models/segment.model';
import { Category } from '../../../core/models/category.model';
import { SaleUnit } from '../../../core/models/transaction.model';
import { ToastService } from '../../../core/services/toast.service';
import { getMonthString, getYear } from '../../../core/utils/date.utils';

export interface StockMovementDialogData {
  item: InventoryItem;
  type: 'purchase' | 'used' | 'wastage';
}

const SALE_UNITS: string[] = ['kg', 'head', 'dozen', 'litre', 'pieces', 'bag', 'bundle'];

@Component({
  selector: 'app-stock-movement-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatCheckboxModule, MatRadioModule,
  ],
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

          <div class="full-width expense-section">
            <mat-checkbox [(ngModel)]="createExpense" [disabled]="totalCost <= 0">
              Also record as expense transaction
              @if (totalCost > 0) {
                (₹{{ totalCost.toLocaleString('en-IN') }})
              } @else {
                (enter a unit cost)
              }
            </mat-checkbox>

            @if (createExpense && totalCost > 0) {
              <div class="expense-fields">
                <mat-form-field appearance="outline">
                  <mat-label>Segment</mat-label>
                  <mat-select [(ngModel)]="expenseSegmentId" required>
                    @for (seg of segments(); track seg.id) {
                      <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Category</mat-label>
                  <mat-select [(ngModel)]="expenseCategoryId" required>
                    @for (cat of expenseCategories(); track cat.id) {
                      <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-radio-group [(ngModel)]="expensePaymentStatus" class="pay-status">
                  <mat-radio-button value="paid">Paid</mat-radio-button>
                  <mat-radio-button value="pending">Pending (Credit)</mat-radio-button>
                </mat-radio-group>
              </div>
            }
          </div>
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
    .expense-section {
      border-top: 1px solid var(--color-border, #e0e0e0);
      padding-top: 12px;
      margin-bottom: 8px;
    }
    .expense-fields {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 16px;
      margin-top: 12px;
    }
    .pay-status { grid-column: 1 / -1; display: flex; gap: 16px; margin-bottom: 8px; }
    @media (max-width: 480px) { .expense-fields { grid-template-columns: 1fr; } }
  `],
})
export class StockMovementDialogComponent implements OnInit {
  data = inject<StockMovementDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<StockMovementDialogComponent>);
  private inventoryService = inject(InventoryItemService);
  private supplierService = inject(SupplierService);
  private transactionService = inject(TransactionService);
  private segmentService = inject(SegmentService);
  private categoryService = inject(CategoryService);
  private tagService = inject(TagService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  suppliers = signal<Supplier[]>([]);
  segments = signal<Segment[]>([]);
  expenseCategories = signal<Category[]>([]);

  quantity: number | null = null;
  unitCost: number | null = null;
  selectedSupplierId = '';
  note = '';
  reason = '';

  createExpense = true;
  expenseSegmentId = '';
  expenseCategoryId = '';
  expensePaymentStatus: 'paid' | 'pending' = 'paid';

  get titleLabel(): string {
    const labels = { purchase: 'Record Purchase', used: 'Record Usage', wastage: 'Record Wastage' };
    return labels[this.data.type];
  }

  get totalCost(): number {
    return (this.quantity || 0) * (this.unitCost || 0);
  }

  async ngOnInit(): Promise<void> {
    if (this.data.type === 'purchase') {
      try {
        const [suppliers, segments, categories] = await Promise.all([
          this.supplierService.getAll(),
          this.segmentService.getAll(),
          this.categoryService.getAll(),
        ]);
        this.suppliers.set(suppliers);
        this.segments.set(segments.filter(s => s.isActive));
        this.expenseCategories.set(categories.filter(c => c.type === 'expense' && c.isActive !== false));

        // Sensible defaults: the item's first segment, and a category matching
        // the consumable category (e.g. feed → Feed) when one exists
        this.expenseSegmentId = this.data.item.segments?.[0] || '';
        const match = this.expenseCategories().find(
          c => c.id === this.data.item.category || c.name.toLowerCase() === this.data.item.category
        );
        this.expenseCategoryId = match?.id || '';
      } catch (err) {
        console.error('Failed to load purchase form data', err);
        this.toast.error(err instanceof Error ? err.message : 'Failed to load form data');
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

        let linkedTransactionId: string | undefined;
        if (this.createExpense && this.totalCost > 0) {
          if (!this.expenseSegmentId || !this.expenseCategoryId) {
            this.error.set('Choose a segment and category for the expense transaction');
            this.saving.set(false);
            return;
          }
          const seg = this.segments().find(s => s.id === this.expenseSegmentId);
          const cat = this.expenseCategories().find(c => c.id === this.expenseCategoryId);
          const now = new Date();
          linkedTransactionId = await this.transactionService.create({
            type: 'expense',
            date: now,
            amount: this.totalCost,
            quantity: this.quantity,
            unit: SALE_UNITS.includes(this.data.item.unit) ? this.data.item.unit as SaleUnit : undefined,
            ratePerUnit: this.unitCost || undefined,
            category: this.expenseCategoryId,
            categoryName: cat?.name || this.expenseCategoryId,
            segment: this.expenseSegmentId,
            segmentName: seg?.name || this.expenseSegmentId,
            description: `${this.data.item.name} purchase — ${this.quantity} ${this.data.item.unit}`
              + (supplier ? ` from ${supplier.name}` : '')
              + (this.note ? ` · ${this.note}` : ''),
            paymentMethod: 'upi',
            expensePaymentStatus: this.expensePaymentStatus,
            linkedSupplierId: supplier?.id,
            linkedSupplierName: supplier?.name,
            tags: ['consumable-purchase'],
            month: getMonthString(now),
            year: getYear(now),
          });
          this.tagService.addTags(['consumable-purchase']);
        }

        await this.inventoryService.recordPurchase(
          itemId,
          this.quantity,
          this.unitCost || 0,
          supplier?.id,
          supplier?.name,
          this.note || undefined,
          linkedTransactionId
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
