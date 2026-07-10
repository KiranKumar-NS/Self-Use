import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import { HarvestService } from '../../../core/services/harvest.service';
import { Harvest } from '../../../core/models/harvest.model';
import { BuyerService } from '../../../core/services/buyer.service';
import { Buyer } from '../../../core/models/buyer.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { ToastService } from '../../../core/services/toast.service';

export interface HarvestSaleDialogData {
  harvest: Harvest;
}

@Component({
  selector: 'app-harvest-sale-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, CurrencyInrPipe],
  template: `
    <h2 mat-dialog-title>Record Sale</h2>
    <mat-dialog-content>
      <p class="sale-info">Selling from <strong>{{ data.harvest.cropName }}</strong> &mdash; {{ data.harvest.remainingQuantity }} {{ data.harvest.unit }} available</p>

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Quantity ({{ data.harvest.unit }})</mat-label>
          <input matInput type="number" [(ngModel)]="quantity" required [max]="data.harvest.remainingQuantity" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Rate per {{ data.harvest.unit }}</mat-label>
          <input matInput type="number" [(ngModel)]="ratePerUnit" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Buyer</mat-label>
          <mat-select [(ngModel)]="buyerId" (selectionChange)="onBuyerChange()">
            <mat-option value="">None</mat-option>
            @for (buyer of buyers(); track buyer.id) {
              <mat-option [value]="buyer.id">{{ buyer.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Note</mat-label>
          <input matInput [(ngModel)]="note" />
        </mat-form-field>
      </div>

      @if (quantity && ratePerUnit) {
        <div class="total-amount">
          Total: <strong>{{ calculatedTotal() | currencyInr }}</strong>
        </div>
      }

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !quantity || !ratePerUnit || quantity > data.harvest.remainingQuantity" (click)="save()">
        {{ saving() ? 'Saving...' : 'Record Sale' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .sale-info { margin-bottom: 16px; color: var(--color-text-secondary); }
    .total-amount { background: var(--color-income-bg, #e8f5e9); color: var(--color-income, #2e7d32); padding: 12px 16px; border-radius: 8px; font-size: 1.1rem; text-align: center; margin-top: 8px; }
    .error-msg { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
    @media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } }
  `],
})
export class HarvestSaleDialogComponent implements OnInit {
  data = inject<HarvestSaleDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<HarvestSaleDialogComponent>);
  private harvestService = inject(HarvestService);
  private buyerService = inject(BuyerService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  buyers = signal<Buyer[]>([]);

  quantity: number | null = null;
  ratePerUnit: number | null = null;
  buyerId = '';
  buyerName = '';
  note = '';

  async ngOnInit(): Promise<void> {
    try {
      this.buyers.set(await this.buyerService.getAll());
    } catch (err) {
      console.error('Failed to load buyers', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load buyers');
    }
  }

  onBuyerChange(): void {
    const buyer = this.buyers().find(b => b.id === this.buyerId);
    this.buyerName = buyer?.name || '';
  }

  calculatedTotal(): number {
    return (this.quantity || 0) * (this.ratePerUnit || 0);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      await this.harvestService.recordSale(this.data.harvest.id, {
        quantity: this.quantity!,
        unit: this.data.harvest.unit,
        ratePerUnit: this.ratePerUnit!,
        buyerId: this.buyerId || undefined,
        buyerName: this.buyerName || undefined,
        note: this.note || undefined,
      });
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to record sale');
    } finally {
      this.saving.set(false);
    }
  }
}
