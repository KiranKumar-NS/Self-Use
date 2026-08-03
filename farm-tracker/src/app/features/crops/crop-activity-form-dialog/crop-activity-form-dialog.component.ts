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

import { CropActivityService, CropExpenseMeta } from '../../../core/services/crop-activity.service';
import { CropActivity, CropActivityType } from '../../../core/models/crop-activity.model';
import { PaymentMethod, ExpensePaymentStatus } from '../../../core/models/transaction.model';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { CategoryService } from '../../../core/services/category.service';
import { Category } from '../../../core/models/category.model';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { AppUser } from '../../../core/models/user.model';
import { Timestamp } from '@angular/fire/firestore';
import { ToastService } from '../../../core/services/toast.service';
import { normalizeName, nameKey } from '../../../core/utils/name.utils';

export interface CropActivityFormDialogData {
  activity?: CropActivity;
}

@Component({
  selector: 'app-crop-activity-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatAutocompleteModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>{{ data.activity ? 'Edit' : 'Add' }} Crop Activity</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="segment" required>
            @for (seg of cropSegments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Activity Type</mat-label>
          <mat-select [(ngModel)]="activityType" required>
            @for (type of activityTypes; track type) {
              <mat-option [value]="type">{{ formatType(type) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="date" [max]="today" required />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Description</mat-label>
          <input matInput [(ngModel)]="description" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Product Used</mat-label>
          <input matInput [(ngModel)]="productUsed" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Quantity</mat-label>
          <input matInput type="number" [(ngModel)]="quantity" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Unit</mat-label>
          <input matInput [(ngModel)]="unit" placeholder="kg, litres, bags..." />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Area</mat-label>
          <input matInput [(ngModel)]="area" placeholder="e.g. 2 acres" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Duration (hours)</mat-label>
          <input matInput type="number" [(ngModel)]="duration" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Labor Count</mat-label>
          <input matInput type="number" [(ngModel)]="laborCount" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Cost</mat-label>
          <input matInput type="number" [(ngModel)]="cost" min="0" />
        </mat-form-field>

        @if (cost() && cost()! > 0) {
          <div class="full-width skip-expense-row">
            <mat-checkbox [(ngModel)]="skipExpense">
              Already purchased — don't create an expense (e.g. applied from bulk stock)
            </mat-checkbox>
          </div>
        }

        @if (cost() && cost()! > 0 && !skipExpense) {
          <mat-form-field appearance="outline">
            <mat-label>Cost Category</mat-label>
            <mat-select [(ngModel)]="expenseCategory">
              @for (c of expenseCategories(); track c.id) {
                <mat-option [value]="c.id">{{ c.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

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

          <mat-form-field appearance="outline">
            <mat-label>Payment Method</mat-label>
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
              <mat-label>Expected Payment Date</mat-label>
              <input matInput [matDatepicker]="payPicker" [(ngModel)]="expectedPaymentDate" />
              <mat-datepicker-toggle matIconSuffix [for]="payPicker" />
              <mat-datepicker #payPicker />
            </mat-form-field>
          }
        }

        <mat-form-field appearance="outline">
          <mat-label>Weather</mat-label>
          <input matInput [(ngModel)]="weather" placeholder="Sunny, Rainy..." />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Temperature (°C)</mat-label>
          <input matInput type="number" [(ngModel)]="temperature" />
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
      <button mat-flat-button color="primary"
              [disabled]="saving() || !segment() || !activityType() || (!!cost() && cost()! > 0 && !skipExpense && paidBy === 'other' && !customPaidByName.trim())"
              (click)="save()">
        {{ saving() ? 'Saving...' : (data.activity ? 'Update' : 'Add Activity') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [],
})
export class CropActivityFormDialogComponent implements OnInit {
  data = inject<CropActivityFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<CropActivityFormDialogComponent>);
  private cropActivityService = inject(CropActivityService);
  private segmentService = inject(SegmentService);
  private categoryService = inject(CategoryService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private transactionService = inject(TransactionService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  cropSegments = signal<Segment[]>([]);

  // Expense details (only used when cost > 0 and expense not skipped)
  users = signal<AppUser[]>([]);
  expenseCategories = signal<Category[]>([]);
  expenseCategory = 'other-expense';
  paymentMethod: PaymentMethod = 'cash';
  expenseStatus: ExpensePaymentStatus = 'paid';
  expectedPaymentDate: Date | null = null;
  skipExpense = false;         // "already purchased / from stock — don't create an expense"
  paidBy = '';                 // uid | 'other'
  customPaidByName = '';
  nameSuggestions = signal<string[]>([]);
  private knownNames: string[] = [];

  activityTypes: CropActivityType[] = [
    'irrigation', 'fertilizer', 'pruning', 'spraying', 'weeding',
    'flowering', 'harvest', 'planting', 'mulching', 'soil_testing', 'other',
  ];

  today = new Date();
  segment = signal('');
  activityType = signal<CropActivityType>('other');
  date = signal<Date>(new Date());
  description = signal('');
  productUsed = signal('');
  quantity = signal<number | null>(null);
  unit = signal('');
  area = signal('');
  duration = signal<number | null>(null);
  laborCount = signal<number | null>(null);
  cost = signal<number | null>(null);
  weather = signal('');
  temperature = signal<number | null>(null);
  note = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const allSegments = await this.segmentService.getAll();
      this.cropSegments.set(allSegments.filter(s => s.segmentType === 'crop'));
    } catch (err) {
      console.error('Failed to load segments', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load segments');
    }

    try {
      this.users.set((await this.userService.getAll()).filter(u => u.isActive));
    } catch (err) {
      console.error('Failed to load users', err);
    }
    try {
      this.expenseCategories.set(await this.categoryService.getByType('expense'));
    } catch (err) {
      console.error('Failed to load categories', err);
    }
    this.paidBy = this.authService.currentUser()?.uid || '';
    this.expenseCategory = this.defaultCategoryFor(this.activityType(), this.laborCount());

    try {
      const recent = await this.transactionService.getAll({}, 200);
      this.knownNames = [...new Set(
        recent.transactions.filter(t => t.paidBy === 'other' && t.paidByName).map(t => t.paidByName!),
      )];
    } catch { /* suggestions are best-effort */ }

    if (this.data?.activity) {
      const a = this.data.activity;
      this.segment.set(a.segment);
      this.activityType.set(a.activityType);
      this.date.set(a.date?.toDate() || new Date());
      this.description.set(a.description || '');
      this.productUsed.set(a.productUsed || '');
      this.quantity.set(a.quantity ?? null);
      this.unit.set(a.unit || '');
      this.area.set(a.area || '');
      this.duration.set(a.duration ?? null);
      this.laborCount.set(a.laborCount ?? null);
      this.cost.set(a.cost ?? null);
      this.weather.set(a.weather || '');
      this.temperature.set(a.temperature ?? null);
      this.note.set(a.note || '');
      this.skipExpense = a.expenseSkipped ?? false;

      // Prefill expense details from the linked expense so they aren't reset on edit.
      if (a.linkedTransactionId) {
        try {
          const txn = await this.transactionService.getById(a.linkedTransactionId);
          if (txn) {
            this.paymentMethod = txn.paymentMethod || 'cash';
            this.expenseStatus = txn.expensePaymentStatus || 'paid';
            if (txn.category) this.expenseCategory = txn.category;
            this.expectedPaymentDate = txn.expectedPaymentDate?.toDate() || null;
            if (txn.paidBy === 'other') {
              this.paidBy = 'other';
              this.customPaidByName = txn.paidByName || '';
            } else if (txn.paidBy) {
              this.paidBy = txn.paidBy;
            }
          }
        } catch (err) {
          console.error('Failed to load linked expense', err);
        }
      }
    }
  }

  /** Preselect a sensible expense category for a fresh activity (user can still change it). */
  private defaultCategoryFor(type: CropActivityType, laborCount: number | null): string {
    const has = (id: string) => this.expenseCategories().some(c => c.id === id);
    if (laborCount && laborCount > 0 && has('labor')) return 'labor';
    if (type === 'fertilizer' && has('fertilizer')) return 'fertilizer';
    if (type === 'spraying' && has('medicine')) return 'medicine';
    if (type === 'planting' && has('seeds')) return 'seeds';
    return 'other-expense';
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

  private resolveExpenseMeta(): CropExpenseMeta {
    const isCustom = this.paidBy === 'other';
    const paidByUser = isCustom ? null : this.users().find(u => u.uid === this.paidBy);
    const cat = this.expenseCategories().find(c => c.id === this.expenseCategory);
    return {
      paidBy: isCustom ? 'other' : this.paidBy,
      paidByName: isCustom ? normalizeName(this.customPaidByName) : (paidByUser?.displayName || ''),
      paymentMethod: this.paymentMethod,
      expensePaymentStatus: this.expenseStatus,
      category: this.expenseCategory,
      categoryName: cat?.name,
      expectedPaymentDate: this.expenseStatus === 'pending' ? (this.expectedPaymentDate || undefined) : undefined,
    };
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const selectedSegment = this.cropSegments().find(s => s.id === this.segment());
      const formData: Partial<CropActivity> = {
        segment: this.segment(),
        segmentName: selectedSegment?.name || '',
        activityType: this.activityType(),
        date: Timestamp.fromDate(this.date()),
        description: this.description(),
        productUsed: this.productUsed() || undefined,
        quantity: this.quantity() ?? undefined,
        unit: this.unit() || undefined,
        area: this.area() || undefined,
        duration: this.duration() ?? undefined,
        laborCount: this.laborCount() ?? undefined,
        cost: this.cost() ?? undefined,
        weather: this.weather() || undefined,
        temperature: this.temperature() ?? undefined,
        note: this.note() || undefined,
      };

      const hasCost = (this.cost() ?? 0) > 0;
      const skip = hasCost && this.skipExpense;
      const expenseMeta = hasCost && !skip ? this.resolveExpenseMeta() : undefined;

      if (this.data?.activity) {
        await this.cropActivityService.update(this.data.activity.id, formData, expenseMeta, skip);
      } else {
        await this.cropActivityService.create(formData, expenseMeta, skip);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
