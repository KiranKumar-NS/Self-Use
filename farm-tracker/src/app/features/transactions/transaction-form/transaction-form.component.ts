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
import { TransactionFormData, PaymentMethod } from '../../../core/models/transaction.model';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatRadioModule } from '@angular/material/radio';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatNativeDateModule, MatRadioModule,
    MatIconModule, MatSlideToggleModule, CurrencyInrPipe,
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

        <!-- Paid By -->
        <div class="form-row split-toggle-row">
          <label class="field-label">{{ type === 'expense' ? 'Paid By' : 'Received By' }}</label>
          @if (type === 'expense') {
            <mat-slide-toggle [(ngModel)]="splitPayment" name="splitPayment" (change)="onSplitToggle()">
              Split between multiple people
            </mat-slide-toggle>
          }
        </div>

        @if (!splitPayment) {
          <!-- Single payer -->
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
        } @else {
          <!-- Split payers -->
          <div class="split-payers">
            @for (sp of splitPayers; track sp.uid; let i = $index) {
              <div class="split-row">
                <mat-form-field appearance="outline" class="split-name">
                  <mat-label>Person</mat-label>
                  <mat-select [(ngModel)]="sp.uid" [name]="'sp_uid_' + i" (selectionChange)="onSplitPayerChange(i)">
                    @for (u of users(); track u.uid) {
                      <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline" class="split-amount">
                  <mat-label>Amount</mat-label>
                  <input matInput type="number" [(ngModel)]="sp.amount" [name]="'sp_amt_' + i" min="0" />
                </mat-form-field>
                @if (splitPayers.length > 2) {
                  <button mat-icon-button type="button" (click)="removeSplitPayer(i)"><mat-icon>close</mat-icon></button>
                }
              </div>
            }
            <button mat-button type="button" (click)="addSplitPayer()">
              <mat-icon>add</mat-icon> Add Person
            </button>
            <div class="split-summary" [class.over]="splitTotal() > amount" [class.exact]="splitTotal() === amount">
              Split total: {{ splitTotal() | currencyInr }} / {{ amount | currencyInr }}
              @if (splitTotal() !== amount && amount > 0) {
                <span class="split-diff">({{ splitTotal() > amount ? 'over by' : 'remaining' }}: {{ Math.abs(amount - splitTotal()) | currencyInr }})</span>
              }
            </div>
          </div>
        }

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
    .split-toggle-row {
      align-items: center; justify-content: space-between; margin-bottom: 0.75rem;
    }
    .split-payers {
      background: #f8fafc; border-radius: 8px; padding: 1rem; margin-bottom: 1rem;
    }
    .split-row {
      display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.25rem;
    }
    .split-name { flex: 2; }
    .split-amount { flex: 1; }
    .split-summary {
      padding: 8px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 600;
      background: #fef3c7; color: #92400e; margin-top: 0.5rem;
    }
    .split-summary.exact { background: #f0fdf4; color: #16a34a; }
    .split-summary.over { background: #fef2f2; color: #dc2626; }
    .split-diff { font-weight: 400; margin-left: 4px; }
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

  Math = Math; // expose to template

  type: 'expense' | 'income' = 'expense';
  date = new Date();
  amount = 0;
  segment = '';
  category = '';
  description = '';
  paidBy = '';
  customPaidByName = '';
  paymentMethod: PaymentMethod = 'upi';
  splitPayment = false;
  splitPayers: { uid: string; name: string; amount: number }[] = [];

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
        this.paymentMethod = txn.paymentMethod || 'cash';
        // Pre-fill split payers if editing
        if (txn.payers?.length) {
          this.splitPayment = true;
          this.splitPayers = txn.payers.map(p => ({ uid: p.uid, name: p.name, amount: p.amount }));
        }
        this.onTypeChange();
      }
    }
  }

  onPaidByChange(): void {
    if (this.paidBy !== 'other') {
      this.customPaidByName = '';
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

  onSplitToggle(): void {
    if (this.splitPayment && this.splitPayers.length === 0) {
      // Initialize with 2 payer rows from active users
      const activeUsers = this.users();
      this.splitPayers = activeUsers.slice(0, 2).map(u => ({ uid: u.uid, name: u.displayName, amount: 0 }));
    }
  }

  onSplitPayerChange(index: number): void {
    const uid = this.splitPayers[index].uid;
    const user = this.users().find(u => u.uid === uid);
    if (user) this.splitPayers[index].name = user.displayName;
  }

  addSplitPayer(): void {
    this.splitPayers.push({ uid: '', name: '', amount: 0 });
  }

  removeSplitPayer(index: number): void {
    this.splitPayers.splice(index, 1);
  }

  splitTotal(): number {
    return this.splitPayers.reduce((s, p) => s + (p.amount || 0), 0);
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

      // Build payers array if split payment
      const payers = this.splitPayment
        ? this.splitPayers.filter(p => p.uid && p.amount > 0)
        : undefined;

      if (this.splitPayment && payers?.length) {
        // Validate split total matches amount
        const total = payers.reduce((s, p) => s + p.amount, 0);
        if (total !== this.amount) {
          this.error.set(`Split total (₹${total}) must equal amount (₹${this.amount})`);
          this.saving.set(false);
          return;
        }
      }

      const formData: TransactionFormData = {
        type: this.type,
        date: this.date,
        amount: this.amount,
        category: this.category,
        categoryName: selectedCategory?.name || this.category,
        segment: this.segment,
        segmentName: selectedSegment?.name || this.segment,
        description: this.description,
        paymentMethod: this.paymentMethod,
        paidBy: resolvedPaidBy,
        paidByName: resolvedPaidByName,
        payers,
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
