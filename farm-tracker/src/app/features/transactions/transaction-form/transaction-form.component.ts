import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../../core/services/transaction.service';
import { AuthService } from '../../../core/services/auth.service';
import { CategoryService } from '../../../core/services/category.service';
import { SegmentService } from '../../../core/services/segment.service';
import { UserService } from '../../../core/services/user.service';
import { Category } from '../../../core/models/category.model';
import { Segment } from '../../../core/models/segment.model';
import { AppUser } from '../../../core/models/user.model';
import { TransactionFormData, PaymentMethod, IncomePaymentStatus, SaleUnit } from '../../../core/models/transaction.model';

import { MatIconModule } from '@angular/material/icon';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { MatRadioModule } from '@angular/material/radio';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatRadioModule,
    MatIconModule,
  ],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit' : 'Add' }} Transaction</h1>
    </div>

    <mat-card class="form-card">
      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <form (ngSubmit)="save()">
        <div class="form-row">
          <mat-radio-group [(ngModel)]="type" name="type" (change)="onTypeChange()">
            <mat-radio-button value="expense">Expense</mat-radio-button>
            <mat-radio-button value="income">Income</mat-radio-button>
          </mat-radio-group>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input matInput [matDatepicker]="picker" [(ngModel)]="date" name="date" required />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Amount (INR)</mat-label>
            <input matInput type="number" [(ngModel)]="amount" name="amount" required min="1" />
          </mat-form-field>
        </div>

        <!-- Quantity / Unit / Rate -->
        <div class="form-row qty-row">
          <mat-form-field appearance="outline">
            <mat-label>Quantity (optional)</mat-label>
            <input matInput type="number" [(ngModel)]="quantity" name="quantity" min="0" step="0.1" (ngModelChange)="onQtyRateChange()" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Unit</mat-label>
            <mat-select [(ngModel)]="unit" name="unit">
              <mat-option value="">-</mat-option>
              <mat-option value="kg">Kg</mat-option>
              <mat-option value="head">Head</mat-option>
              <mat-option value="dozen">Dozen</mat-option>
              <mat-option value="litre">Litre</mat-option>
              <mat-option value="pieces">Pieces</mat-option>
              <mat-option value="bag">Bag</mat-option>
              <mat-option value="bundle">Bundle</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Rate/Unit (₹)</mat-label>
            <input matInput type="number" [(ngModel)]="ratePerUnit" name="ratePerUnit" min="0" step="0.5" (ngModelChange)="onQtyRateChange()" />
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Segment</mat-label>
            <mat-select [(ngModel)]="segment" name="segment" required>
              @for (seg of filteredSegments(); track seg.id) {
                <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Category</mat-label>
            <mat-select [(ngModel)]="category" name="category" required>
              @for (cat of filteredCategories(); track cat.id) {
                <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <!-- Payment Method -->
        <div class="form-row">
          <div class="payment-method-group">
            <label class="field-label">Payment Method</label>
            <mat-radio-group [(ngModel)]="paymentMethod" name="paymentMethod">
              <mat-radio-button value="cash">Cash</mat-radio-button>
              <mat-radio-button value="upi">UPI</mat-radio-button>
            </mat-radio-group>
          </div>
        </div>

        <!-- Payment Status (income only) -->
        @if (type === 'income') {
          <div class="form-row">
            <div class="payment-method-group">
              <label class="field-label">Payment Status</label>
              <mat-radio-group [(ngModel)]="paymentStatus" name="paymentStatus">
                <mat-radio-button value="received">Received</mat-radio-button>
                <mat-radio-button value="pending">Pending</mat-radio-button>
              </mat-radio-group>
            </div>
          </div>
        }

        <!-- Paid By -->
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ type === 'expense' ? 'Paid By' : 'Received By' }}</mat-label>
            <mat-select [(ngModel)]="paidBy" name="paidBy" (selectionChange)="onPaidByChange()">
              @for (u of users(); track u.uid) {
                <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
              }
              <mat-option value="other">Other (type name)</mat-option>
            </mat-select>
          </mat-form-field>

          @if (paidBy === 'other') {
            <mat-form-field appearance="outline">
              <mat-label>Enter Name</mat-label>
              <input matInput [(ngModel)]="customPaidByName" name="customPaidByName" required placeholder="e.g. Raju" />
            </mat-form-field>
          }
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea matInput [(ngModel)]="description" name="description" rows="3"></textarea>
        </mat-form-field>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Transaction' }}
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .form-card { max-width: 700px; padding: 1.5rem; }
    .form-row { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
    .form-row mat-form-field { flex: 1; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .error-message { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    mat-radio-group { display: flex; gap: 1rem; }
    .payment-method-group {
      display: flex; flex-direction: column; gap: 6px; margin-bottom: 0.5rem;
    }
    .field-label {
      font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600;
    }
    @media (max-width: 640px) {
      .form-row { flex-direction: column; gap: 0.5rem; }
      .qty-row { flex-direction: row; flex-wrap: wrap; }
      .qty-row mat-form-field:nth-child(1) { flex: 2; min-width: 0; }
      .qty-row mat-form-field:nth-child(2) { flex: 1; min-width: 80px; }
      .qty-row mat-form-field:nth-child(3) { flex: 2; min-width: 0; }
      .form-card { padding: 1rem; }
    }
  `],
})
export class TransactionFormComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private authService = inject(AuthService);
  private categoryService = inject(CategoryService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  error = signal('');
  saving = signal(false);

  type: 'expense' | 'income' = 'expense';
  date = new Date();
  amount = 0;
  quantity: number | null = null;
  unit: SaleUnit | '' = '';
  ratePerUnit: number | null = null;
  segment = '';
  category = '';
  description = '';
  paidBy = '';
  customPaidByName = '';
  paymentMethod: PaymentMethod = 'upi';
  paymentStatus: IncomePaymentStatus = 'received';

  allCategories = signal<Category[]>([]);
  allSegments = signal<Segment[]>([]);
  users = signal<AppUser[]>([]);
  filteredCategories = signal<Category[]>([]);
  filteredSegments = signal<Segment[]>([]);

  private editId = '';

  async ngOnInit(): Promise<void> {
    const [categories, segments, users] = await Promise.all([
      this.categoryService.getAll(),
      this.segmentService.getAll(),
      this.userService.getAll(),
    ]);

    this.allCategories.set(categories);
    this.allSegments.set(segments);
    this.users.set(users.filter((u) => u.isActive));
    this.paidBy = this.authService.currentUser()?.uid || '';

    // Filter segments by user access
    const accessibleSegments = this.authService.isAdmin()
      ? segments
      : segments.filter((s) => this.authService.assignedSegments().includes(s.id));
    this.filteredSegments.set(accessibleSegments);
    this.onTypeChange();

    // Check if editing
    this.editId = this.route.snapshot.params['id'];
    if (this.editId) {
      this.isEdit.set(true);
      const txn = await this.transactionService.getById(this.editId);
      if (txn) {
        this.type = txn.type;
        this.date = txn.date.toDate();
        this.amount = txn.amount;
        this.segment = txn.segment;
        this.category = txn.category;
        this.description = txn.description;
        // Check if paidBy is a registered user or custom name
        const isRegisteredUser = this.users().some((u) => u.uid === txn.paidBy);
        if (isRegisteredUser) {
          this.paidBy = txn.paidBy || '';
        } else {
          this.paidBy = 'other';
          this.customPaidByName = txn.paidByName || '';
        }
        this.quantity = txn.quantity || null;
        this.unit = txn.unit || '';
        this.ratePerUnit = txn.ratePerUnit || null;
        this.paymentMethod = txn.paymentMethod || 'cash';
        this.paymentStatus = txn.paymentStatus || 'received';
        this.onTypeChange();
      }
    }
  }

  onPaidByChange(): void {
    if (this.paidBy !== 'other') {
      this.customPaidByName = '';
    }
  }

  onQtyRateChange(): void {
    if (this.quantity && this.ratePerUnit) {
      this.amount = Math.round(this.quantity * this.ratePerUnit * 100) / 100;
    }
  }

  onTypeChange(): void {
    this.filteredCategories.set(
      this.allCategories().filter((c) => c.type === this.type)
    );
    // Default to UPI for expense, cash for income
    if (!this.isEdit()) {
      this.paymentMethod = this.type === 'expense' ? 'upi' : 'cash';
    }
  }

  async save(): Promise<void> {
    this.error.set('');
    this.saving.set(true);

    try {
      const selectedSegment = this.allSegments().find((s) => s.id === this.segment);
      const selectedCategory = this.filteredCategories().find((c) => c.id === this.category);
      // Resolve paid by - either registered user or custom name
      const isCustom = this.paidBy === 'other';
      const paidByUser = isCustom ? null : this.users().find((u) => u.uid === this.paidBy);
      const resolvedPaidBy = isCustom ? 'other' : this.paidBy;
      const resolvedPaidByName = isCustom ? this.customPaidByName : paidByUser?.displayName;

      const formData: TransactionFormData = {
        type: this.type,
        date: this.date,
        amount: this.amount,
        quantity: this.quantity || undefined,
        unit: this.unit || undefined,
        ratePerUnit: this.ratePerUnit || undefined,
        category: this.category,
        categoryName: selectedCategory?.name || this.category,
        segment: this.segment,
        segmentName: selectedSegment?.name || this.segment,
        description: this.description,
        paymentMethod: this.paymentMethod,
        paymentStatus: this.type === 'income' ? this.paymentStatus : undefined,
        paidBy: resolvedPaidBy,
        paidByName: resolvedPaidByName,
        month: getMonthString(this.date),
        year: getYear(this.date),
      };

      if (this.isEdit()) {
        await this.transactionService.update(this.editId, formData);
      } else {
        await this.transactionService.create(formData);
      }
      this.router.navigate(['/transactions']);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save transaction');
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/transactions']);
  }
}
