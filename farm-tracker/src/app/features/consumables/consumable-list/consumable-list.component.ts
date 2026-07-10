import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryItemService } from '../../../core/services/inventory-item.service';
import { InventoryItem, ConsumableCategory } from '../../../core/models/inventory-item.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConsumableFormDialogComponent } from '../consumable-form-dialog/consumable-form-dialog.component';
import { StockMovementDialogComponent } from '../stock-movement-dialog/stock-movement-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { safeLoad } from '../../../core/utils/async.utils';
import { ToastService } from '../../../core/services/toast.service';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';

const CATEGORY_LABELS: Record<ConsumableCategory, string> = {
  feed: 'Feed',
  medicine: 'Medicine',
  fertilizer: 'Fertilizer',
  seeds: 'Seeds',
  fuel: 'Fuel',
  diesel: 'Diesel',
  packaging: 'Packaging',
  tools: 'Tools',
  other: 'Other',
};

@Component({
  selector: 'app-consumable-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatInputModule, MatFormFieldModule, MatProgressBarModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Consumable Inventory</h1>
        <p class="subtitle">Track stock levels and movements</p>
      </div>
      <button mat-flat-button color="primary" (click)="addItem()">
        <mat-icon>add</mat-icon> <span class="btn-label">Add Item</span>
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (items().length === 0) {
      <app-empty-state icon="📦" title="No consumables yet" message="Add your first inventory item to start tracking stock." actionLabel="Add Item" (actionClick)="addItem()" />
    } @else {
      <!-- Search -->
      <mat-card class="filter-card">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Search</mat-label>
          <input matInput [(ngModel)]="searchTerm" placeholder="Item name, category..." />
          @if (searchTerm) {
            <button matSuffix mat-icon-button (click)="searchTerm = ''"><mat-icon>close</mat-icon></button>
          }
        </mat-form-field>
      </mat-card>

      <div class="card-grid">
        @for (item of filteredItems(); track item.id) {
          <mat-card class="item-card" [class.low-stock]="isLowStock(item)">
            <div class="card-header">
              <div class="card-title">{{ item.name }}</div>
              <span class="category-badge">{{ categoryLabel(item.category) }}</span>
            </div>

            <div class="stock-info">
              <div class="stock-row">
                <span class="stock-label">Current Stock</span>
                <span class="stock-value" [class.low]="isLowStock(item)">{{ item.currentStock }} {{ item.unit }}</span>
              </div>
              @if (item.minimumStock != null) {
                <div class="stock-row">
                  <span class="stock-label">Min Stock</span>
                  <span class="stock-value min">{{ item.minimumStock }} {{ item.unit }}</span>
                </div>
                <mat-progress-bar
                  [mode]="'determinate'"
                  [value]="stockPercent(item)"
                  [color]="isLowStock(item) ? 'warn' : 'primary'"
                  class="stock-bar">
                </mat-progress-bar>
              }
            </div>

            <div class="card-actions">
              <button mat-stroked-button color="primary" (click)="openMovement(item, 'purchase')">
                <mat-icon>add_shopping_cart</mat-icon> Purchase
              </button>
              <button mat-stroked-button (click)="openMovement(item, 'used')">
                <mat-icon>remove_circle_outline</mat-icon> Use
              </button>
              <button mat-stroked-button color="warn" (click)="openMovement(item, 'wastage')">
                <mat-icon>delete_sweep</mat-icon> Wastage
              </button>
            </div>

            <div class="card-footer">
              <button mat-icon-button (click)="editItem(item)" title="Edit"><mat-icon>edit</mat-icon></button>
              <button mat-icon-button color="warn" (click)="confirmDelete(item)" title="Delete"><mat-icon>delete</mat-icon></button>
            </div>
          </mat-card>
        }
      </div>
    }
  `,
  styles: [`
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .item-card {
      padding: 16px;
      border-left: 4px solid var(--color-primary);
      transition: border-color 0.2s;
    }
    .item-card.low-stock {
      border-left-color: var(--color-danger, #e53935);
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
    }
    .category-badge {
      background: var(--color-primary-bg, #e3f2fd);
      color: var(--color-primary);
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .stock-info {
      margin-bottom: 12px;
    }
    .stock-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
    }
    .stock-label {
      font-size: 0.85rem;
      color: var(--color-text-secondary, #666);
    }
    .stock-value {
      font-weight: 700;
      font-size: 1rem;
    }
    .stock-value.low {
      color: var(--color-danger, #e53935);
    }
    .stock-value.min {
      font-weight: 500;
      font-size: 0.85rem;
      color: var(--color-text-secondary, #666);
    }
    .stock-bar {
      margin-top: 6px;
      border-radius: 4px;
    }
    .card-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin: 12px 0 8px;
    }
    .card-actions button {
      font-size: 0.8rem;
      padding: 0 8px;
      height: 32px;
    }
    .card-actions mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 2px;
    }
    .card-footer {
      display: flex;
      justify-content: flex-end;
      gap: 4px;
      border-top: 1px solid var(--color-border, #eee);
      padding-top: 8px;
    }
    @media (max-width: 480px) {
      .card-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class ConsumableListComponent implements OnInit {
  private inventoryService = inject(InventoryItemService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  items = signal<InventoryItem[]>([]);
  loading = signal(true);
  searchTerm = '';

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    await safeLoad(this.loading, async () => {
      this.items.set(await this.inventoryService.getAll());
    }, this.toast);
  }

  filteredItems(): InventoryItem[] {
    const term = this.searchTerm.toLowerCase().trim();
    if (!term) return this.items();
    return this.items().filter(i =>
      i.name.toLowerCase().includes(term) ||
      i.category.toLowerCase().includes(term)
    );
  }

  isLowStock(item: InventoryItem): boolean {
    return item.minimumStock != null && item.currentStock <= item.minimumStock;
  }

  stockPercent(item: InventoryItem): number {
    if (!item.minimumStock || item.minimumStock === 0) return 100;
    // Show percentage relative to a "healthy" level of 2x minimum stock
    const target = item.minimumStock * 2;
    return Math.min(100, Math.round((item.currentStock / target) * 100));
  }

  categoryLabel(category: ConsumableCategory): string {
    return CATEGORY_LABELS[category] || category;
  }

  addItem(): void {
    const ref = this.dialog.open(ConsumableFormDialogComponent, { width: '90vw', maxWidth: '500px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.toast.success('Item added');
        await this.loadData();
      }
    });
  }

  editItem(item: InventoryItem): void {
    const ref = this.dialog.open(ConsumableFormDialogComponent, { width: '90vw', maxWidth: '500px', data: { item } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.toast.success('Item updated');
        await this.loadData();
      }
    });
  }

  openMovement(item: InventoryItem, type: 'purchase' | 'used' | 'wastage'): void {
    const ref = this.dialog.open(StockMovementDialogComponent, { width: '90vw', maxWidth: '450px', data: { item, type } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        const labels = { purchase: 'Purchase recorded', used: 'Usage recorded', wastage: 'Wastage recorded' };
        this.toast.success(labels[type]);
        await this.loadData();
      }
    });
  }

  async confirmDelete(item: InventoryItem): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Item', message: `Delete "${item.name}"?`, confirmText: 'Delete' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          await this.inventoryService.softDelete(item.id);
          this.toast.success('Item deleted');
        } catch (err) {
          console.error('Failed to delete item', err);
          this.toast.error(err instanceof Error ? err.message : 'Failed to delete item');
        }
        await this.loadData();
      }
    });
  }
}
