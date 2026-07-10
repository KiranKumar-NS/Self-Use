import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { Timestamp } from '@angular/fire/firestore';

import { ScheduleService } from '../../../core/services/schedule.service';
import { Schedule, RepeatFrequency } from '../../../core/models/schedule.model';
import { TransactionType, PaymentMethod } from '../../../core/models/transaction.model';
import { CategoryService } from '../../../core/services/category.service';
import { SegmentService } from '../../../core/services/segment.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { Category } from '../../../core/models/category.model';
import { Segment } from '../../../core/models/segment.model';
import { ToastService } from '../../../core/services/toast.service';

export interface RecurringSetupDialogData {
  schedule?: Schedule;
}

@Component({
  selector: 'app-recurring-setup-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatRadioModule, MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.schedule ? 'Edit' : 'Create' }} Recurring Transaction</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Title</mat-label>
          <input matInput [(ngModel)]="title" placeholder="e.g. Monthly labor salary" required />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <input matInput [(ngModel)]="description" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Frequency</mat-label>
          <mat-select [(ngModel)]="frequency">
            <mat-option value="daily">Daily</mat-option>
            <mat-option value="weekly">Weekly</mat-option>
            <mat-option value="biweekly">Biweekly</mat-option>
            <mat-option value="monthly">Monthly</mat-option>
            <mat-option value="quarterly">Quarterly</mat-option>
            <mat-option value="yearly">Yearly</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Start Date</mat-label>
          <input matInput [matDatepicker]="startPicker" [(ngModel)]="startDate" />
          <mat-datepicker-toggle matSuffix [for]="startPicker" />
          <mat-datepicker #startPicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>End Date (optional)</mat-label>
          <input matInput [matDatepicker]="endPicker" [(ngModel)]="endDate" />
          <mat-datepicker-toggle matSuffix [for]="endPicker" />
          <mat-datepicker #endPicker />
        </mat-form-field>

        <div class="section-label full-width">Transaction Details</div>

        <div class="form-row full-width">
          <mat-radio-group [(ngModel)]="txnType">
            <mat-radio-button value="expense">Expense</mat-radio-button>
            <mat-radio-button value="income">Income</mat-radio-button>
          </mat-radio-group>
        </div>

        <mat-form-field appearance="outline">
          <mat-label>Amount (₹)</mat-label>
          <input matInput type="number" [(ngModel)]="amount" min="1" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Category</mat-label>
          <mat-select [(ngModel)]="selectedCategory" (selectionChange)="onCategoryChange()">
            @for (cat of filteredCategories(); track cat.id) {
              <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="selectedSegment" (selectionChange)="onSegmentChange()">
            @for (seg of segments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Payment Method</mat-label>
          <mat-select [(ngModel)]="paymentMethod">
            <mat-option value="cash">Cash</mat-option>
            <mat-option value="upi">UPI</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Paid By</mat-label>
          <mat-select [(ngModel)]="paidBy" (selectionChange)="onPaidByChange()">
            @for (user of users(); track user.uid) {
              <mat-option [value]="user.uid">{{ user.displayName }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <input matInput [(ngModel)]="txnDescription" placeholder="e.g. Monthly labor payment" />
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !isValid()" (click)="save()">
        {{ saving() ? 'Saving...' : (data.schedule ? 'Update' : 'Create') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .full-width { grid-column: 1 / -1; }
    .section-label { font-weight: 600; font-size: var(--font-sm); color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin: 8px 0 4px; }
    .form-row { display: flex; gap: 16px; align-items: center; margin-bottom: 12px; }
    .error-msg { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
    @media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } }
  `],
})
export class RecurringSetupDialogComponent implements OnInit {
  data = inject<RecurringSetupDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<RecurringSetupDialogComponent>);
  private scheduleService = inject(ScheduleService);
  private categoryService = inject(CategoryService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  categories = signal<Category[]>([]);
  segments = signal<Segment[]>([]);
  users = signal<{ uid: string; displayName: string }[]>([]);

  // Schedule fields
  title = signal('');
  description = signal('');
  frequency = signal<RepeatFrequency>('monthly');
  startDate = signal<Date>(new Date());
  endDate = signal<Date | null>(null);

  // Transaction template fields
  txnType = signal<TransactionType>('expense');
  amount = signal(0);
  selectedCategory = signal('');
  selectedSegment = signal('');
  paymentMethod = signal<PaymentMethod>('upi');
  paidBy = signal('');
  txnDescription = signal('');

  // Resolved names
  private categoryName = '';
  private segmentName = '';
  private paidByName = '';

  async ngOnInit(): Promise<void> {
    try {
      const [cats, segs, allUsers] = await Promise.all([
        this.categoryService.getAll(),
        this.segmentService.getAll(),
        this.userService.getAll(),
      ]);
      this.categories.set(cats);
      this.segments.set(segs);
      this.users.set(allUsers.map(u => ({ uid: u.uid, displayName: u.displayName })));
    } catch (err) {
      console.error('Failed to load data', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load data');
    }

    const currentUser = this.authService.currentUser();
    if (currentUser) this.paidBy.set(currentUser.uid);

    if (this.data?.schedule) {
      const s = this.data.schedule;
      this.title.set(s.title);
      this.description.set(s.description);
      this.frequency.set(s.frequency);
      this.startDate.set(s.startDate.toDate());
      this.endDate.set(s.endDate?.toDate() || null);

      if (s.transactionTemplate) {
        this.txnType.set(s.transactionTemplate.type);
        this.amount.set(s.transactionTemplate.amount);
        this.selectedCategory.set(s.transactionTemplate.category);
        this.selectedSegment.set(s.transactionTemplate.segment);
        this.paymentMethod.set(s.transactionTemplate.paymentMethod);
        this.paidBy.set(s.transactionTemplate.paidBy || this.paidBy());
        this.txnDescription.set(s.transactionTemplate.description);
        this.categoryName = s.transactionTemplate.categoryName;
        this.segmentName = s.transactionTemplate.segmentName;
        this.paidByName = s.transactionTemplate.paidByName || '';
      }
    }
  }

  filteredCategories(): Category[] {
    return this.categories().filter(c => c.type === this.txnType() && c.isActive);
  }

  onCategoryChange(): void {
    const cat = this.categories().find(c => c.id === this.selectedCategory());
    this.categoryName = cat?.name || '';
  }

  onSegmentChange(): void {
    const seg = this.segments().find(s => s.id === this.selectedSegment());
    this.segmentName = seg?.name || '';
  }

  onPaidByChange(): void {
    const user = this.users().find(u => u.uid === this.paidBy());
    this.paidByName = user?.displayName || '';
  }

  isValid(): boolean {
    return !!(this.title().trim() && this.amount() > 0 && this.selectedCategory() && this.selectedSegment());
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const scheduleData: Partial<Schedule> = {
        type: 'recurring_transaction',
        title: this.title(),
        description: this.description(),
        frequency: this.frequency(),
        startDate: Timestamp.fromDate(this.startDate()),
        nextDueDate: Timestamp.fromDate(this.startDate()),
        transactionTemplate: {
          type: this.txnType(),
          amount: this.amount(),
          category: this.selectedCategory(),
          categoryName: this.categoryName,
          segment: this.selectedSegment(),
          segmentName: this.segmentName,
          description: this.txnDescription(),
          paymentMethod: this.paymentMethod(),
          paidBy: this.paidBy(),
          paidByName: this.paidByName,
        },
      };
      const endDate = this.endDate();
      if (endDate) {
        scheduleData.endDate = Timestamp.fromDate(endDate);
      }

      if (this.data?.schedule) {
        await this.scheduleService.update(this.data.schedule.id, scheduleData);
      } else {
        await this.scheduleService.create(scheduleData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
