import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
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
import { TransactionService } from '../../../core/services/transaction.service';
import { CategoryService } from '../../../core/services/category.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { TagService } from '../../../core/services/tag.service';
import { Segment } from '../../../core/models/segment.model';
import { Animal } from '../../../core/models/animal.model';
import { Buyer } from '../../../core/models/buyer.model';
import { Category } from '../../../core/models/category.model';
import { AppUser } from '../../../core/models/user.model';
import { PaymentMethod, ExpensePaymentStatus, IncomePaymentStatus, SaleUnit } from '../../../core/models/transaction.model';
import { InventoryEvent, InventoryEventType } from '../../../core/models/inventory.model';
import { ANIMAL_EVENT_TYPES } from '../../../core/models/segment.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { normalizeName, nameKey } from '../../../core/utils/name.utils';
import { ToastService } from '../../../core/services/toast.service';

export type InventoryEventDialogMode = 'event' | 'sale' | 'death';

export interface InventoryEventDialogData {
  event?: InventoryEvent;             // if provided, edit mode
  mode?: InventoryEventDialogMode;    // default 'event'
  animal?: Animal;                    // pre-linked + locked (sale/death from animal detail)
  segment?: string;                   // optional preselect
}

@Component({
  selector: 'app-inventory-event-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatAutocompleteModule,
    MatCheckboxModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ dialogTitle() }}</h2>
    <mat-dialog-content>
      @if (lockedAnimal(); as animal) {
        <div class="animal-info">
          {{ eventType() === 'sale' ? 'Selling' : 'Recording death of' }}:
          <strong>{{ animalService.getDisplayName(animal) }}</strong>
          @if (animal.trackingMode === 'batch') {
            <span class="batch-note">({{ animal.currentCount }} available)</span>
          }
        </div>
      }

      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="segment" (selectionChange)="onSegmentChange()" required
            [disabled]="!!lockedAnimal()">
            @for (seg of animalSegments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Event Type</mat-label>
          <mat-select [(ngModel)]="eventType" [disabled]="isTypeLocked()" required>
            @for (et of eventTypeOptions; track et.value) {
              <mat-option [value]="et.value">{{ et.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Count</mat-label>
          <input matInput type="number" [(ngModel)]="count"
            [min]="eventType() === 'adjustment' ? null : 1"
            [max]="countMax()" [disabled]="isCountLocked()" step="1" required />
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

        <!-- Link to Animal (sale/death, unless the animal is preset) -->
        @if ((eventType() === 'sale' || eventType() === 'death') && !lockedAnimal()) {
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

        <!-- Buyer + price (sale only) -->
        @if (eventType() === 'sale') {
          <mat-form-field appearance="outline">
            <mat-label>Buyer (optional)</mat-label>
            <mat-select [(ngModel)]="buyerId" (selectionChange)="onBuyerChange()">
              <mat-option value="">None</mat-option>
              @for (b of buyers(); track b.id) {
                <mat-option [value]="b.id">{{ b.name }}</mat-option>
              }
              <mat-option value="__new__">+ Add New Buyer</mat-option>
            </mat-select>
          </mat-form-field>

          @if (buyerId === '__new__') {
            <mat-form-field appearance="outline">
              <mat-label>New Buyer Name</mat-label>
              <input matInput [(ngModel)]="newBuyerName" required />
            </mat-form-field>
          }

          <mat-form-field appearance="outline">
            <mat-label>Sale Price {{ mode === 'sale' ? '(INR)' : '(optional)' }}</mat-label>
            <input matInput type="number" [(ngModel)]="salePrice" min="0" [required]="mode === 'sale'" />
          </mat-form-field>

          @if (!isEdit()) {
            <div class="full-width animal-record-section">
              <mat-checkbox [(ngModel)]="createIncomeTxn" [disabled]="!salePrice || salePrice <= 0">
                Also record income transaction
                @if (salePrice && salePrice > 0) {
                  (₹{{ salePrice.toLocaleString('en-IN') }})
                } @else {
                  (enter a sale price)
                }
              </mat-checkbox>
            </div>

            @if (createIncomeTxn && salePrice && salePrice > 0) {
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
                         [matAutocomplete]="saleNameAuto" />
                  <mat-autocomplete #saleNameAuto="matAutocomplete">
                    @for (n of nameSuggestions(); track n) {
                      <mat-option [value]="n">{{ n }}</mat-option>
                    }
                  </mat-autocomplete>
                </mat-form-field>
              }

              <mat-form-field appearance="outline">
                <mat-label>Payment</mat-label>
                <mat-select [(ngModel)]="paymentMethod">
                  <mat-option value="cash">Cash</mat-option>
                  <mat-option value="upi">UPI</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Status</mat-label>
                <mat-select [(ngModel)]="incomeStatus">
                  <mat-option value="received">Received</mat-option>
                  <mat-option value="pending">Pending</mat-option>
                </mat-select>
              </mat-form-field>

              @if (incomeStatus === 'pending') {
                <mat-form-field appearance="outline">
                  <mat-label>Expected Payment Date (optional)</mat-label>
                  <input matInput [matDatepicker]="incomeExpectedPicker" [(ngModel)]="expectedPaymentDate" />
                  <mat-datepicker-toggle matIconSuffix [for]="incomeExpectedPicker" />
                  <mat-datepicker #incomeExpectedPicker />
                </mat-form-field>
              }
            }
          }
        }

        <!-- Death details (mortality loss tracking) -->
        @if (eventType() === 'death') {
          <mat-form-field appearance="outline">
            <mat-label>Cause of Death (optional)</mat-label>
            <input matInput [(ngModel)]="deathCause" placeholder="e.g. Disease, Accident" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Estimated Value (optional)</mat-label>
            <input matInput type="number" [(ngModel)]="estimatedValue" min="0"
              placeholder="Estimated market value of lost animal(s)" />
          </mat-form-field>
        }

        <!-- Purchase/birth always creates a batch animal record -->
        @if (!isEdit() && (eventType() === 'purchase' || eventType() === 'birth')) {
          @if (eventType() === 'purchase') {
            <mat-form-field appearance="outline">
              <mat-label>Purchase Price (total)</mat-label>
              <input matInput type="number" [(ngModel)]="purchasePrice" min="0" />
            </mat-form-field>
          }

          <mat-form-field appearance="outline">
            <mat-label>Batch Label</mat-label>
            <input matInput [(ngModel)]="batchLabel" [placeholder]="suggestedBatchLabel()" />
          </mat-form-field>

          @if (eventType() === 'purchase') {
            <div class="full-width animal-record-section">
              <mat-checkbox [(ngModel)]="createPurchaseExpense" [disabled]="!purchasePrice || purchasePrice <= 0">
                Also record as expense transaction
                @if (purchasePrice && purchasePrice > 0) {
                  (₹{{ purchasePrice.toLocaleString('en-IN') }})
                } @else {
                  (enter a purchase price)
                }
              </mat-checkbox>
            </div>

            @if (createPurchaseExpense && purchasePrice && purchasePrice > 0) {
              <mat-form-field appearance="outline">
                <mat-label>Expense Category</mat-label>
                <mat-select [(ngModel)]="expenseCategoryId">
                  @for (cat of expenseCategories(); track cat.id) {
                    <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Payment</mat-label>
                <mat-select [(ngModel)]="paymentMethod">
                  <mat-option value="cash">Cash</mat-option>
                  <mat-option value="upi">UPI</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Status</mat-label>
                <mat-select [(ngModel)]="expenseStatus">
                  <mat-option value="paid">Paid</mat-option>
                  <mat-option value="pending">Pending</mat-option>
                </mat-select>
              </mat-form-field>

              @if (expenseStatus === 'pending') {
                <mat-form-field appearance="outline">
                  <mat-label>Expected Payment Date (optional)</mat-label>
                  <input matInput [matDatepicker]="expectedPicker" [(ngModel)]="expectedPaymentDate" />
                  <mat-datepicker-toggle matIconSuffix [for]="expectedPicker" />
                  <mat-datepicker #expectedPicker />
                </mat-form-field>
              }

              <mat-form-field appearance="outline">
                <mat-label>Paid By</mat-label>
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
        [disabled]="saveDisabled()"
        (click)="save()">
        {{ saving() ? 'Saving...' : saveLabel() }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .animal-info { margin-bottom: 16px; font-size: 0.95rem; }
    .batch-note { color: var(--color-text-secondary); margin-left: 4px; }
    .animal-record-section { display: flex; align-items: center; gap: 12px; margin: 4px 0 8px; }
  `],
})
export class InventoryEventDialogComponent implements OnInit {
  data = inject<InventoryEventDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<InventoryEventDialogComponent>);
  private inventoryService = inject(InventoryService);
  private segmentService = inject(SegmentService);
  animalService = inject(AnimalService);
  private buyerService = inject(BuyerService);
  private transactionService = inject(TransactionService);
  private categoryService = inject(CategoryService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private tagService = inject(TagService);
  private toast = inject(ToastService);

  segments = signal<Segment[]>([]);
  activeAnimals = signal<Animal[]>([]);
  buyers = signal<Buyer[]>([]);
  saving = signal(false);
  error = signal('');

  today = new Date();
  mode: InventoryEventDialogMode = 'event';
  isEdit = signal(false);
  lockedAnimal = signal<Animal | null>(null);
  segment = signal('');
  eventType = signal<InventoryEventType>('birth');
  count = signal(1);
  breed = signal('');
  date = signal(new Date());
  note = signal('');
  linkedAnimalId = '';
  buyerId = '';
  newBuyerName = '';
  salePrice: number | null = null;
  estimatedValue: number | null = null;
  deathCause = '';
  purchasePrice: number | null = null;
  batchLabel = '';
  eventTypeOptions = ANIMAL_EVENT_TYPES;
  private allBreeds = signal<string[]>([]);

  // Income transaction (sale) — opt-out via checkbox, mirrors the purchase expense
  createIncomeTxn = true;
  incomeStatus: IncomePaymentStatus = 'received';

  // Purchase expense (only used when eventType === 'purchase' and price > 0)
  createPurchaseExpense = true;
  expenseCategories = signal<Category[]>([]);
  users = signal<AppUser[]>([]);
  expenseCategoryId = 'other-expense';
  paymentMethod: PaymentMethod = 'cash';
  expenseStatus: ExpensePaymentStatus = 'paid';
  expectedPaymentDate: Date | null = null;
  paidBy = '';                 // uid | 'other'
  customPaidByName = '';
  nameSuggestions = signal<string[]>([]);
  private knownNames: string[] = [];

  async ngOnInit(): Promise<void> {
    this.mode = this.data?.mode || 'event';

    try {
      const [segs, buyers] = await Promise.all([this.segmentService.getAll(), this.buyerService.getAll()]);
      this.segments.set(segs);
      this.buyers.set(buyers);
    } catch (err) {
      console.error('Failed to load data', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load data');
    }

    try {
      const [categories, users] = await Promise.all([
        this.categoryService.getByType('expense'),
        this.userService.getAll(),
      ]);
      this.expenseCategories.set(categories.filter(c => c.isActive !== false));
      this.users.set(users.filter(u => u.isActive));
      // Prefer the dedicated Animal Purchase category when it exists
      this.expenseCategoryId = categories.some(c => c.id === 'animal-purchase') ? 'animal-purchase' : 'other-expense';
    } catch (err) {
      console.error('Failed to load expense form data', err);
    }
    this.paidBy = this.authService.currentUser()?.uid || '';

    try {
      const recent = await this.transactionService.getAll({}, 200);
      this.knownNames = [...new Set(
        recent.transactions.filter(t => t.paidBy === 'other' && t.paidByName).map(t => t.paidByName!),
      )];
    } catch { /* suggestions are best-effort */ }

    // Sale/death preset from animal detail — animal locked in
    if (this.data?.animal && (this.mode === 'sale' || this.mode === 'death')) {
      const animal = this.data.animal;
      this.lockedAnimal.set(animal);
      this.eventType.set(this.mode === 'sale' ? 'sale' : 'death');
      this.segment.set(animal.segment);
      this.linkedAnimalId = animal.id;
      this.breed.set(animal.breed || '');
      this.count.set(animal.trackingMode === 'batch' ? animal.currentCount : 1);
      this.loadBreeds(animal.segment);
    } else if (this.data?.segment) {
      this.segment.set(this.data.segment);
      this.onSegmentChange();
    }

    // Pre-fill if editing
    if (this.data?.event) {
      this.isEdit.set(true);
      const ev = this.data.event;
      this.segment.set(ev.segment);
      this.eventType.set(ev.eventType);
      this.count.set(ev.eventType === 'adjustment' ? ev.count : Math.abs(ev.count));
      this.breed.set(ev.breed || '');
      this.date.set(ev.date.toDate());
      this.note.set(ev.note);
      this.loadBreeds(ev.segment);
    }
  }

  dialogTitle(): string {
    switch (this.mode) {
      case 'sale': return 'Record Sale';
      case 'death': return 'Record Death';
      default: return this.isEdit() ? 'Edit Inventory Event' : 'Record Inventory Event';
    }
  }

  saveLabel(): string {
    if (this.isEdit()) return 'Update';
    switch (this.mode) {
      case 'sale': return 'Record Sale';
      case 'death': return 'Record Death';
      default: return 'Record Event';
    }
  }

  isTypeLocked(): boolean {
    return this.mode === 'sale' || this.mode === 'death';
  }

  isCountLocked(): boolean {
    // Individual animal locked in: exactly one head is sold/dies
    const animal = this.lockedAnimal();
    return !!animal && animal.trackingMode === 'individual';
  }

  countMax(): number | null {
    const animal = this.lockedAnimal();
    return animal ? animal.currentCount : null;
  }

  animalSegments(): Segment[] {
    return this.segments().filter(s => s.segmentType !== 'crop');
  }

  onSegmentChange(): void {
    this.breed.set('');
    this.linkedAnimalId = '';
    if (this.segment()) {
      this.loadBreeds(this.segment());
      this.loadAnimals(this.segment());
    }
  }

  onBuyerChange(): void {
    if (this.buyerId !== '__new__') this.newBuyerName = '';
  }

  private async loadAnimals(segmentId: string): Promise<void> {
    try {
      this.activeAnimals.set(await this.animalService.getActiveBySegment(segmentId));
    } catch (err) {
      console.error('Failed to load animals', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load animals');
    }
  }

  private loadBreeds(segmentId: string): void {
    const seg = this.segments().find(s => s.id === segmentId);
    this.allBreeds.set(seg?.breeds || []);
  }

  suggestedBatchLabel(): string {
    const seg = this.segments().find(s => s.id === this.segment());
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${seg?.name || 'Batch'} ${monthNames[this.date().getMonth()]}-${this.date().getFullYear()}`;
  }

  filteredBreeds(): string[] {
    if (!this.breed()) return this.allBreeds();
    const term = this.breed().toLowerCase();
    return this.allBreeds().filter(b => b.toLowerCase().includes(term));
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

  saveDisabled(): boolean {
    if (this.saving() || !this.segment() || !this.eventType() || !this.count()) return true;
    if (this.isEdit()) return false;
    const et = this.eventType();
    if (this.mode === 'sale' && (!this.salePrice || this.salePrice <= 0)) return true;
    if (et === 'sale' && this.createIncomeTxn && !!this.salePrice && this.salePrice > 0) {
      if (this.paidBy === 'other' && !this.customPaidByName.trim()) return true;
      if (this.buyerId === '__new__' && !this.newBuyerName.trim()) return true;
    }
    if (et === 'purchase' && this.createPurchaseExpense && !!this.purchasePrice && this.purchasePrice > 0
      && this.paidBy === 'other' && !this.customPaidByName.trim()) return true;
    return false;
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const seg = this.segments().find(s => s.id === this.segment());
      const segmentName = seg?.name || this.segment();
      const linkedAnimal = this.lockedAnimal()
        || (this.linkedAnimalId ? this.activeAnimals().find(a => a.id === this.linkedAnimalId) : undefined);
      const linkedAnimalLabel = linkedAnimal ? this.animalService.getDisplayName(linkedAnimal) : '';

      // Resolve buyer (sale only) — may create a new one
      let resolvedBuyerId = '';
      let resolvedBuyerName = '';
      if (this.eventType() === 'sale' && !this.isEdit()) {
        if (this.buyerId === '__new__' && this.newBuyerName.trim()) {
          const name = normalizeName(this.newBuyerName);
          resolvedBuyerId = await this.buyerService.create({ name });
          resolvedBuyerName = name;
        } else if (this.buyerId && this.buyerId !== '__new__') {
          resolvedBuyerId = this.buyerId;
          resolvedBuyerName = this.buyers().find(b => b.id === this.buyerId)?.name || '';
        }
      }

      const autoNote = this.eventType() === 'sale'
        ? `Sold ${linkedAnimalLabel || `${this.count()} ${segmentName}`}${resolvedBuyerName ? ' to ' + resolvedBuyerName : ''}`
        : this.eventType() === 'death' && linkedAnimalLabel
          ? `Death of ${linkedAnimalLabel}`
          : '';

      const formData = {
        segment: this.segment(),
        segmentName,
        eventType: this.eventType(),
        count: this.count(),
        breed: this.breed().trim() || undefined,
        note: this.note() || autoNote,
        date: this.date(),
        month: getMonthString(this.date()),
        year: getYear(this.date()),
        estimatedValue: this.eventType() === 'death' && this.estimatedValue ? this.estimatedValue : undefined,
      };

      if (this.isEdit() && this.data.event) {
        await this.inventoryService.updateEvent(this.data.event.id, this.data.event, formData);
      } else {
        // 1. Income transaction for the sale (opt-out via checkbox).
        //    Buyer stats flow through TransactionService (linkedBuyerId).
        let saleTxnId: string | undefined;
        if (this.eventType() === 'sale' && this.createIncomeTxn && this.salePrice && this.salePrice > 0) {
          const isCustom = this.paidBy === 'other';
          const paidByUser = isCustom ? null : this.users().find(u => u.uid === this.paidBy);
          saleTxnId = await this.transactionService.create({
            type: 'income',
            date: this.date(),
            amount: this.salePrice,
            quantity: this.count(),
            unit: 'head' as SaleUnit,
            ratePerUnit: this.count() > 0 ? Math.round((this.salePrice / this.count()) * 100) / 100 : this.salePrice,
            category: 'animal-sales',
            categoryName: 'Animal Sales',
            segment: this.segment(),
            segmentName,
            description: `Sale of ${linkedAnimalLabel || `${this.count()} ${segmentName}`}${resolvedBuyerName ? ' to ' + resolvedBuyerName : ''}`,
            paymentMethod: this.paymentMethod,
            paymentStatus: this.incomeStatus,
            expectedPaymentDate: this.incomeStatus === 'pending' ? (this.expectedPaymentDate || undefined) : undefined,
            paidBy: isCustom ? 'other' : (this.paidBy || undefined),
            paidByName: isCustom ? normalizeName(this.customPaidByName) : paidByUser?.displayName,
            linkedAnimalIds: linkedAnimal ? [linkedAnimal.id] : undefined,
            linkedAnimalNames: linkedAnimal ? [linkedAnimalLabel] : undefined,
            linkedBuyerId: resolvedBuyerId || undefined,
            linkedBuyerName: resolvedBuyerName || undefined,
            month: getMonthString(this.date()),
            year: getYear(this.date()),
          });
        }

        // 2. Inventory event + stock update
        const eventId = await this.inventoryService.recordEvent(formData);

        // 3. Purchase/birth always creates a batch animal record
        if (this.eventType() === 'purchase' || this.eventType() === 'birth') {
          const animalLabel = this.batchLabel.trim() || this.suggestedBatchLabel();
          const animalId = await this.animalService.create({
            segment: this.segment(),
            segmentName,
            trackingMode: 'batch',
            batchSize: this.count(),
            batchLabel: animalLabel,
            breed: this.breed().trim() || undefined,
            origin: this.eventType() as 'purchase' | 'birth',
            originDate: this.date(),
            purchasePrice: this.eventType() === 'purchase' ? (this.purchasePrice || 0) : undefined,
            originInventoryEventId: eventId,
            note: this.note().trim() || undefined,
          });

          // Record the purchase as an expense transaction (opt-out via checkbox)
          if (this.eventType() === 'purchase' && this.createPurchaseExpense && this.purchasePrice && this.purchasePrice > 0) {
            const isCustom = this.paidBy === 'other';
            const paidByUser = isCustom ? null : this.users().find(u => u.uid === this.paidBy);
            const cat = this.expenseCategories().find(c => c.id === this.expenseCategoryId);
            const txnId = await this.transactionService.create({
              type: 'expense',
              date: this.date(),
              amount: this.purchasePrice,
              quantity: this.count(),
              unit: 'head',
              ratePerUnit: this.count() > 0 ? Math.round((this.purchasePrice / this.count()) * 100) / 100 : this.purchasePrice,
              category: this.expenseCategoryId,
              categoryName: cat?.name || 'Other',
              segment: this.segment(),
              segmentName,
              description: `Purchase of ${animalLabel} — ${this.count()} head`,
              paymentMethod: this.paymentMethod,
              expensePaymentStatus: this.expenseStatus,
              expectedPaymentDate: this.expenseStatus === 'pending' ? (this.expectedPaymentDate || undefined) : undefined,
              paidBy: isCustom ? 'other' : (this.paidBy || undefined),
              paidByName: isCustom ? normalizeName(this.customPaidByName) : paidByUser?.displayName,
              linkedAnimalIds: [animalId],
              linkedAnimalNames: [animalLabel],
              tags: ['animal-purchase'],
              month: getMonthString(this.date()),
              year: getYear(this.date()),
            });
            this.tagService.addTags(['animal-purchase']);
            await this.animalService.setPurchaseTransaction(animalId, txnId);
          }
        }

        // 4. Update linked animal on sale/death
        if (linkedAnimal) {
          if (this.eventType() === 'sale') {
            await this.animalService.recordSale(linkedAnimal.id, {
              salePrice: this.salePrice || 0,
              buyerId: resolvedBuyerId || undefined,
              buyerName: resolvedBuyerName || undefined,
              saleTransactionId: saleTxnId,
              saleInventoryEventId: eventId,
              date: this.date(),
              countSold: this.count(),
            });
          } else if (this.eventType() === 'death') {
            await this.animalService.recordDeath(
              linkedAnimal.id, this.date(), this.note(), this.count(),
              this.deathCause.trim() || undefined, eventId,
            );
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
