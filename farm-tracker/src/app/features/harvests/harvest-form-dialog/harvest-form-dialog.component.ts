import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

import { HarvestService, HarvestExpenseMeta } from '../../../core/services/harvest.service';
import { Harvest } from '../../../core/models/harvest.model';
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
import { TagService } from '../../../core/services/tag.service';
import { normalizeName, nameKey } from '../../../core/utils/name.utils';

export interface HarvestFormDialogData {
  harvest?: Harvest;
}

@Component({
  selector: 'app-harvest-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule, MatAutocompleteModule],
  template: `
    <h2 mat-dialog-title>{{ data.harvest ? 'Edit' : 'Record' }} Harvest</h2>
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
          <mat-label>Crop Name</mat-label>
          <input matInput [(ngModel)]="cropName" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Variety</mat-label>
          <input matInput [(ngModel)]="variety" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Harvest Date</mat-label>
          <input matInput [matDatepicker]="picker" [(ngModel)]="harvestDate" [max]="today" required />
          <mat-datepicker-toggle matIconSuffix [for]="picker" />
          <mat-datepicker #picker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Total Quantity</mat-label>
          <input matInput type="number" [(ngModel)]="totalQuantity" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Unit</mat-label>
          <mat-select [(ngModel)]="unit">
            <mat-option value="kg">kg</mat-option>
            <mat-option value="dozen">dozen</mat-option>
            <mat-option value="pieces">pieces</mat-option>
            <mat-option value="bag">bag</mat-option>
            <mat-option value="bundle">bundle</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Grade</mat-label>
          <input matInput [(ngModel)]="grade" placeholder="A, B, Premium..." />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Storage Location</mat-label>
          <input matInput [(ngModel)]="storageLocation" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Harvest Cost</mat-label>
          <input matInput type="number" [(ngModel)]="harvestCost" min="0" />
          <mat-hint>Creates a linked expense transaction for this harvest.</mat-hint>
        </mat-form-field>

        @if (harvestCost() && harvestCost()! > 0) {
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
              [disabled]="saving() || !segment() || !cropName().trim() || !totalQuantity() || (!!harvestCost() && harvestCost()! > 0 && paidBy === 'other' && !customPaidByName.trim())"
              (click)="save()">
        {{ saving() ? 'Saving...' : (data.harvest ? 'Update' : 'Record Harvest') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [],
})
export class HarvestFormDialogComponent implements OnInit {
  data = inject<HarvestFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<HarvestFormDialogComponent>);
  private harvestService = inject(HarvestService);
  private segmentService = inject(SegmentService);
  private categoryService = inject(CategoryService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private transactionService = inject(TransactionService);
  private tagService = inject(TagService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  cropSegments = signal<Segment[]>([]);

  // Expense details (only used when harvestCost > 0)
  users = signal<AppUser[]>([]);
  expenseCategories = signal<Category[]>([]);
  expenseCategory = 'other-expense';
  paymentMethod: PaymentMethod = 'cash';
  expenseStatus: ExpensePaymentStatus = 'paid';
  expectedPaymentDate: Date | null = null;
  paidBy = '';                 // uid | 'other'
  customPaidByName = '';
  nameSuggestions = signal<string[]>([]);
  private knownNames: string[] = [];

  today = new Date();
  segment = signal('');
  cropName = signal('');
  variety = signal('');
  harvestDate = signal<Date>(new Date());
  totalQuantity = signal<number | null>(null);
  unit = signal('kg');
  grade = signal('');
  storageLocation = signal('');
  harvestCost = signal<number | null>(null);
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

    try {
      const recent = await this.transactionService.getAll({}, 200);
      this.knownNames = [...new Set(
        recent.transactions.filter(t => t.paidBy === 'other' && t.paidByName).map(t => t.paidByName!),
      )];
    } catch { /* suggestions are best-effort */ }

    if (this.data?.harvest) {
      const h = this.data.harvest;
      this.segment.set(h.segment);
      this.cropName.set(h.cropName);
      this.variety.set(h.variety || '');
      this.harvestDate.set(h.harvestDate?.toDate() || new Date());
      this.totalQuantity.set(h.totalQuantity);
      this.unit.set(h.unit || 'kg');
      this.grade.set(h.grade || '');
      this.storageLocation.set(h.storageLocation || '');
      this.harvestCost.set(h.harvestCost ?? null);
      this.note.set(h.note || '');

      // Prefill "who paid" from the linked expense so it isn't reset on edit.
      if (h.harvestCostTransactionId) {
        try {
          const txn = await this.transactionService.getById(h.harvestCostTransactionId);
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

  private resolveExpenseMeta(): HarvestExpenseMeta {
    const isCustom = this.paidBy === 'other';
    const paidByUser = isCustom ? null : this.users().find(u => u.uid === this.paidBy);
    const cat = this.expenseCategories().find(c => c.id === this.expenseCategory);
    return {
      paidBy: isCustom ? 'other' : this.paidBy,
      paidByName: isCustom ? normalizeName(this.customPaidByName) : (paidByUser?.displayName || ''),
      paymentMethod: this.paymentMethod,
      expensePaymentStatus: this.expenseStatus,
      category: this.expenseCategory,
      categoryName: cat?.name || 'Other',
      expectedPaymentDate: this.expenseStatus === 'pending' ? (this.expectedPaymentDate || undefined) : undefined,
    };
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const selectedSegment = this.cropSegments().find(s => s.id === this.segment());
      const formData: Partial<Harvest> = {
        segment: this.segment(),
        segmentName: selectedSegment?.name || '',
        cropName: this.cropName(),
        variety: this.variety() || undefined,
        harvestDate: Timestamp.fromDate(this.harvestDate()),
        totalQuantity: this.totalQuantity() || 0,
        unit: this.unit(),
        grade: this.grade() || undefined,
        storageLocation: this.storageLocation() || undefined,
        harvestCost: this.harvestCost() ?? undefined,
        note: this.note() || undefined,
      };

      const expenseMeta = (this.harvestCost() ?? 0) > 0 ? this.resolveExpenseMeta() : undefined;

      if (this.data?.harvest) {
        await this.harvestService.updateDetails(this.data.harvest.id, formData, expenseMeta);
      } else {
        await this.harvestService.create(formData, expenseMeta);
      }
      if (expenseMeta) this.tagService.addTags(['harvest-cost']);
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
