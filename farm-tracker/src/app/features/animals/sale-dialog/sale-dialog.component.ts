import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatIconModule } from '@angular/material/icon';

import { AnimalService } from '../../../core/services/animal.service';
import { BuyerService } from '../../../core/services/buyer.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { SegmentService } from '../../../core/services/segment.service';
import { ToastService } from '../../../core/services/toast.service';
import { Animal } from '../../../core/models/animal.model';
import { Buyer } from '../../../core/models/buyer.model';
import { PaymentMethod, IncomePaymentStatus, SaleUnit } from '../../../core/models/transaction.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { normalizeName } from '../../../core/utils/name.utils';

export interface SaleDialogData {
  animal: Animal;
}

@Component({
  selector: 'app-sale-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatAutocompleteModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>Record Sale</h2>
    <mat-dialog-content>
      <div class="animal-info">
        Selling: <strong>{{ data.animal.name || data.animal.tag || data.animal.batchLabel || data.animal.segmentName }}</strong>
        @if (data.animal.trackingMode === 'batch') {
          <span class="batch-note">({{ data.animal.currentCount }} available)</span>
        }
      </div>

      <div class="form-grid">
        @if (data.animal.trackingMode === 'batch') {
          <mat-form-field appearance="outline">
            <mat-label>Count to sell</mat-label>
            <input matInput type="number" [(ngModel)]="countSold" [max]="data.animal.currentCount" min="1" required />
          </mat-form-field>
        }

        <mat-form-field appearance="outline">
          <mat-label>Sale Price (INR)</mat-label>
          <input matInput type="number" [(ngModel)]="salePrice" min="0" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="saleDate" [max]="today" />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Buyer</mat-label>
          <mat-select [(ngModel)]="buyerId" (selectionChange)="onBuyerChange()">
            <mat-option value="">No buyer</mat-option>
            @for (b of buyers(); track b.id) {
              <mat-option [value]="b.id">{{ b.name }}</mat-option>
            }
            <mat-option value="__new__">+ Add New Buyer</mat-option>
          </mat-select>
        </mat-form-field>

        @if (buyerId === '__new__') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>New Buyer Name</mat-label>
            <input matInput [(ngModel)]="newBuyerName" required />
          </mat-form-field>
        }

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Payment</mat-label>
            <mat-select [(ngModel)]="paymentMethod">
              <mat-option value="cash">Cash</mat-option>
              <mat-option value="upi">UPI</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Status</mat-label>
            <mat-select [(ngModel)]="paymentStatus">
              <mat-option value="received">Received</mat-option>
              <mat-option value="pending">Pending</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !salePrice" (click)="save()">
        {{ saving() ? 'Saving...' : 'Record Sale' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .animal-info { margin-bottom: 16px; font-size: 0.95rem; }
    .batch-note { color: var(--color-text-secondary); margin-left: 4px; }
  `],
})
export class SaleDialogComponent implements OnInit {
  data = inject<SaleDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<SaleDialogComponent>);
  private animalService = inject(AnimalService);
  private buyerService = inject(BuyerService);
  private transactionService = inject(TransactionService);
  private inventoryService = inject(InventoryService);
  private segmentService = inject(SegmentService);
  private toast = inject(ToastService);

  buyers = signal<Buyer[]>([]);
  saving = signal(false);
  error = signal('');

  today = new Date();
  salePrice = 0;
  saleDate = new Date();
  countSold = signal(1);
  buyerId = '';
  newBuyerName = '';
  paymentMethod: PaymentMethod = 'cash';
  paymentStatus: IncomePaymentStatus = 'received';

  async ngOnInit(): Promise<void> {
    try {
      this.buyers.set(await this.buyerService.getAll());
    } catch (err) {
      console.error('Failed to load buyers', err);
      this.toast.error('Failed to load buyers. Check your connection and try again.');
    }
    if (this.data.animal.trackingMode === 'batch') {
      this.countSold.set(this.data.animal.currentCount);
    }
  }

  onBuyerChange(): void {
    if (this.buyerId !== '__new__') this.newBuyerName = '';
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');

    try {
      const animal = this.data.animal;
      let resolvedBuyerId = this.buyerId;
      let resolvedBuyerName = '';

      // Create new buyer if needed
      if (this.buyerId === '__new__' && this.newBuyerName.trim()) {
        const name = normalizeName(this.newBuyerName);
        resolvedBuyerId = await this.buyerService.create({ name });
        resolvedBuyerName = name;
      } else if (this.buyerId && this.buyerId !== '__new__') {
        const buyer = this.buyers().find(b => b.id === this.buyerId);
        resolvedBuyerName = buyer?.name || '';
      }

      // 1. Create income transaction
      const txnId = await this.transactionService.create({
        type: 'income',
        date: this.saleDate,
        amount: this.salePrice,
        quantity: this.countSold(),
        unit: 'head' as SaleUnit,
        ratePerUnit: this.countSold() > 0 ? Math.round((this.salePrice / this.countSold()) * 100) / 100 : this.salePrice,
        category: 'animal-sales',
        categoryName: 'Animal Sales',
        segment: animal.segment,
        segmentName: animal.segmentName,
        description: `Sale of ${this.animalService.getDisplayName(animal)}${resolvedBuyerName ? ' to ' + resolvedBuyerName : ''}`,
        paymentMethod: this.paymentMethod,
        paymentStatus: this.paymentStatus,
        paidBy: undefined,
        paidByName: undefined,
        linkedAnimalIds: [animal.id],
        linkedAnimalNames: [this.animalService.getDisplayName(animal)],
        linkedBuyerId: resolvedBuyerId || undefined,
        linkedBuyerName: resolvedBuyerName || undefined,
        month: getMonthString(this.saleDate),
        year: getYear(this.saleDate),
      });

      // 2. Create inventory sale event
      const eventId = await this.inventoryService.recordEvent({
        segment: animal.segment,
        segmentName: animal.segmentName,
        eventType: 'sale',
        count: this.countSold(),
        breed: animal.breed,
        note: `Sold ${this.animalService.getDisplayName(animal)}${resolvedBuyerName ? ' to ' + resolvedBuyerName : ''}`,
        date: this.saleDate,
        month: getMonthString(this.saleDate),
        year: getYear(this.saleDate),
      });

      // 3. Update animal record
      await this.animalService.recordSale(animal.id, {
        salePrice: this.salePrice,
        buyerId: resolvedBuyerId || undefined,
        buyerName: resolvedBuyerName || undefined,
        saleTransactionId: txnId,
        saleInventoryEventId: eventId,
        date: this.saleDate,
        countSold: this.countSold(),
      });

      // Buyer stats are updated by TransactionService.create (linkedBuyerId)

      this.segmentService.clearCache();
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to record sale');
    } finally {
      this.saving.set(false);
    }
  }
}
