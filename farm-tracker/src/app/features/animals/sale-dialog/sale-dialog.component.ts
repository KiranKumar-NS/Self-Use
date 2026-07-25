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
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { Animal } from '../../../core/models/animal.model';
import { Buyer } from '../../../core/models/buyer.model';
import { AppUser } from '../../../core/models/user.model';
import { PaymentMethod, IncomePaymentStatus, SaleUnit } from '../../../core/models/transaction.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { normalizeName, nameKey } from '../../../core/utils/name.utils';

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
            <mat-label>Received By</mat-label>
            <mat-select [(ngModel)]="paidBy" (selectionChange)="onPaidByChange()">
              @for (u of users(); track u.uid) {
                <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
              }
              <mat-option value="other">Other (type name)</mat-option>
            </mat-select>
          </mat-form-field>

          @if (paidBy === 'other') {
            <mat-form-field appearance="outline">
              <mat-label>Enter Name</mat-label>
              <input matInput [(ngModel)]="customPaidByName" required placeholder="e.g. Raju"
                     (ngModelChange)="filterNameSuggestions()" (focus)="filterNameSuggestions()"
                     [matAutocomplete]="nameAuto" />
              <mat-autocomplete #nameAuto="matAutocomplete">
                @for (n of nameSuggestions(); track n) {
                  <mat-option [value]="n">{{ n }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>
          }
        </div>

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
      <button mat-flat-button color="primary" [disabled]="saving() || !salePrice || (paidBy === 'other' && !customPaidByName.trim())" (click)="save()">
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
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  buyers = signal<Buyer[]>([]);
  users = signal<AppUser[]>([]);
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
  paidBy = '';                 // uid | 'other'
  customPaidByName = '';
  nameSuggestions = signal<string[]>([]);
  private knownNames: string[] = [];

  async ngOnInit(): Promise<void> {
    try {
      const [buyers, users] = await Promise.all([
        this.buyerService.getAll(),
        this.userService.getAll(),
      ]);
      this.buyers.set(buyers);
      this.users.set(users.filter((u) => u.isActive));
    } catch (err) {
      console.error('Failed to load buyers/users', err);
      this.toast.error('Failed to load data. Check your connection and try again.');
    }

    // Default "Received By" to the logged-in user
    this.paidBy = this.authService.currentUser()?.uid || '';

    // Load known custom names for autocomplete suggestions
    try {
      const recent = await this.transactionService.getAll({}, 200);
      this.knownNames = [...new Set(
        recent.transactions
          .filter(t => t.paidBy === 'other' && t.paidByName)
          .map(t => t.paidByName!)
      )];
    } catch {}

    if (this.data.animal.trackingMode === 'batch') {
      this.countSold.set(this.data.animal.currentCount);
    }
  }

  onBuyerChange(): void {
    if (this.buyerId !== '__new__') this.newBuyerName = '';
  }

  onPaidByChange(): void {
    if (this.paidBy !== 'other') {
      this.customPaidByName = '';
      this.nameSuggestions.set([]);
    } else {
      this.filterNameSuggestions();
    }
  }

  filterNameSuggestions(): void {
    const inputKey = nameKey(this.customPaidByName || '');
    if (!inputKey) {
      this.nameSuggestions.set([...this.knownNames].sort((a, b) => a.localeCompare(b)));
      return;
    }
    const matches = this.knownNames.filter(n => nameKey(n).includes(inputKey));
    matches.sort((a, b) => {
      const aStarts = nameKey(a).startsWith(inputKey) ? 0 : 1;
      const bStarts = nameKey(b).startsWith(inputKey) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    });
    this.nameSuggestions.set(matches);
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

      // Resolve "Received By" (registered user vs. custom name)
      const isCustom = this.paidBy === 'other';
      const paidByUser = isCustom ? null : this.users().find(u => u.uid === this.paidBy);
      const resolvedPaidBy = isCustom ? 'other' : this.paidBy;
      const resolvedPaidByName = isCustom ? normalizeName(this.customPaidByName) : paidByUser?.displayName;

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
        paidBy: resolvedPaidBy,
        paidByName: resolvedPaidByName,
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
