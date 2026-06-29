import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../../../core/services/loan.service';
import { UserService } from '../../../core/services/user.service';
import { Loan, Repayment } from '../../../core/models/loan.model';
import { AppUser } from '../../../core/models/user.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe, LoadingSpinnerComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatDatepickerModule, MatNativeDateModule, MatProgressBarModule, MatSelectModule,
  ],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (loan()) {
      <div class="page-header">
        <h1>{{ loan()!.type === 'given' ? 'Lent' : 'Owed' }} Detail</h1>
        <div class="header-actions">
          @if (loan()!.repaymentStatus === 'pending') {
            <button mat-stroked-button (click)="edit()">
              <mat-icon>edit</mat-icon> Edit
            </button>
          }
          @if (loan()!.repaymentStatus === 'completed') {
            <button mat-stroked-button color="warn" (click)="confirmHardDelete()">
              <mat-icon>delete_forever</mat-icon> Delete
            </button>
          }
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <mat-card class="detail-card">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Type</label>
            <span class="type-badge" [class]="loan()!.type">{{ loan()!.type === 'given' ? 'Lent' : 'Owed' }}</span>
          </div>
          <div class="detail-item">
            <label>Date</label>
            <span>{{ loan()!.date.toDate() | date:'dd MMM yyyy' }}</span>
          </div>
          <div class="detail-item">
            <label>Total Given</label>
            <span class="amount-total">{{ loan()!.amount | currencyInr }}</span>
          </div>
          <div class="detail-item">
            <label>Balance Due</label>
            <span class="amount-large">{{ loan()!.balanceRemaining | currencyInr }}</span>
          </div>
          <div class="detail-item">
            <label>Repaid</label>
            <span class="amount-repaid">{{ loan()!.totalRepaid | currencyInr }}</span>
          </div>
          <div class="detail-item">
            <label>Person</label>
            <span>{{ loan()!.personName }}</span>
          </div>
          <div class="detail-item">
            <label>Segment</label>
            <span>{{ loan()!.segmentName }}</span>
          </div>
          <div class="detail-item">
            <label>Status</label>
            <span class="status-badge" [class]="loan()!.repaymentStatus">{{ loan()!.repaymentStatus }}</span>
          </div>
          <div class="detail-item full">
            <label>Purpose</label>
            <span>{{ loan()!.purpose }}</span>
          </div>
        </div>

        <div class="repayment-progress">
          <div class="progress-info">
            <span>Repaid: {{ loan()!.totalRepaid | currencyInr }}</span>
            <span>Balance: {{ loan()!.balanceRemaining | currencyInr }}</span>
          </div>
          <mat-progress-bar mode="determinate"
            [value]="(loan()!.totalRepaid / loan()!.amount) * 100" />
        </div>
      </mat-card>

      <!-- Add More Amount (always visible — reopens completed loans) -->
      <h3 class="section-title">Add More Amount</h3>
      <mat-card class="repayment-form-card">
        @if (addMoreError()) {
          <div class="error-message">{{ addMoreError() }}</div>
        }
        <div class="repayment-form">
          <mat-form-field appearance="outline">
            <mat-label>Additional Amount</mat-label>
            <input matInput type="number" [(ngModel)]="addMoreAmount" min="1" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input matInput [matDatepicker]="mPicker" [(ngModel)]="addMoreDate" />
            <mat-datepicker-toggle matIconSuffix [for]="mPicker" />
            <mat-datepicker #mPicker />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Note</mat-label>
            <input matInput [(ngModel)]="addMoreNote" />
          </mat-form-field>
          <button mat-flat-button color="accent" (click)="addMore()" [disabled]="savingAddMore()">
            {{ savingAddMore() ? 'Adding...' : 'Add More' }}
          </button>
        </div>
      </mat-card>

      <!-- Add Repayment -->
      @if (loan()!.repaymentStatus !== 'completed') {
        <h3 class="section-title">Add Repayment</h3>
        <mat-card class="repayment-form-card">
          @if (repaymentError()) {
            <div class="error-message">{{ repaymentError() }}</div>
          }
          <div class="repayment-form">
            <mat-form-field appearance="outline">
              <mat-label>Amount</mat-label>
              <input matInput type="number" [(ngModel)]="repaymentAmount" min="1" [max]="loan()!.balanceRemaining" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Date</mat-label>
              <input matInput [matDatepicker]="rPicker" [(ngModel)]="repaymentDate" />
              <mat-datepicker-toggle matIconSuffix [for]="rPicker" />
              <mat-datepicker #rPicker />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Paid By</mat-label>
              <mat-select [(ngModel)]="repaymentPaidBy">
                @for (u of activeUsers(); track u.uid) {
                  <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Note</mat-label>
              <input matInput [(ngModel)]="repaymentNote" />
            </mat-form-field>
            <button mat-flat-button color="primary" (click)="addRepayment()" [disabled]="savingRepayment()">
              {{ savingRepayment() ? 'Adding...' : 'Add Repayment' }}
            </button>
          </div>
        </mat-card>
      }

      <!-- Transaction History (Repayments + Disbursements) -->
      @if (repayments().length > 0) {
        <h3 class="section-title">Transaction History</h3>
        <mat-card>
          @for (r of repayments(); track r.id) {
            <div class="repayment-entry" [class.disbursement]="r.amount < 0">
              <div class="repayment-info">
                @if (r.amount < 0) {
                  <strong class="disbursement-amount">+ {{ (-r.amount) | currencyInr }} given</strong>
                } @else {
                  <strong class="repayment-amount">{{ r.amount | currencyInr }} repaid</strong>
                }
                <span class="repayment-date">{{ r.date.toDate() | date:'dd MMM yyyy' }}</span>
              </div>
              <div class="repayment-meta">
                @if (r.paidByName && r.paidByName !== r.recordedByName) {
                  paid by {{ r.paidByName }} &middot;
                }
                {{ r.note }} &middot; recorded by {{ r.recordedByName }}
              </div>
            </div>
          }
        </mat-card>
      }
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; }
    .header-actions { display: flex; gap: 4px; flex-wrap: wrap; }
    .detail-card { padding: 1.5rem; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; }
    .detail-item label { display: block; font-size: 0.75rem; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .detail-item span { font-size: 1rem; color: #1e293b; }
    .detail-item.full { grid-column: 1 / -1; }
    .amount-total { font-size: 1.1rem !important; font-weight: 600; color: #64748b !important; }
    .amount-large { font-size: 1.5rem !important; font-weight: 700; color: #dc2626 !important; }
    .amount-repaid { font-size: 1.1rem !important; font-weight: 600; color: #16a34a !important; }
    .type-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .type-badge.given { background: #fef3c7; color: #d97706; }
    .type-badge.received { background: #dbeafe; color: #2563eb; }
    .status-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .status-badge.pending { background: #fef2f2; color: #dc2626; }
    .status-badge.partial { background: #fef3c7; color: #d97706; }
    .status-badge.completed { background: #f0fdf4; color: #16a34a; }
    .repayment-progress { margin-top: 1.5rem; }
    .progress-info { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.875rem; color: #64748b; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; color: #1e293b; }
    .repayment-form-card { padding: 1rem; }
    .repayment-form { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
    .repayment-form mat-form-field { flex: 1; min-width: 150px; }
    .repayment-entry { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
    .repayment-info { display: flex; justify-content: space-between; }
    .repayment-date { color: #94a3b8; }
    .repayment-meta { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    .error-message { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    .disbursement { background: #fefce8; }
    .disbursement-amount { color: #d97706; }
    .repayment-amount { color: #16a34a; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .detail-grid { grid-template-columns: 1fr 1fr; gap: 1rem; }
      .detail-card { padding: 1rem; }
      .repayment-form mat-form-field { min-width: 0; flex-basis: 100%; }
    }
    @media (max-width: 480px) {
      .detail-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class LoanDetailComponent implements OnInit {
  private loanService = inject(LoanService);
  private userService = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  loan = signal<Loan | null>(null);
  repayments = signal<Repayment[]>([]);
  activeUsers = signal<AppUser[]>([]);
  loading = signal(true);

  repaymentAmount = 0;
  repaymentDate = new Date();
  repaymentNote = '';
  repaymentPaidBy = '';
  repaymentError = signal('');
  savingRepayment = signal(false);

  addMoreAmount = 0;
  addMoreDate = new Date();
  addMoreNote = '';
  addMoreError = signal('');
  savingAddMore = signal(false);

  private loanId = '';

  async ngOnInit(): Promise<void> {
    this.loanId = this.route.snapshot.params['id'];
    const users = await this.userService.getAll();
    this.activeUsers.set(users.filter(u => u.isActive));
    // Default paid by to current user
    const currentUid = this.activeUsers().find(u => u.uid)?.uid || '';
    this.repaymentPaidBy = currentUid;
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const [loan, repayments] = await Promise.all([
      this.loanService.getById(this.loanId),
      this.loanService.getRepayments(this.loanId),
    ]);
    this.loan.set(loan);
    this.repayments.set(repayments);
    this.loading.set(false);
  }

  async addRepayment(): Promise<void> {
    if (this.repaymentAmount <= 0) {
      this.repaymentError.set('Amount must be greater than 0');
      return;
    }
    this.repaymentError.set('');
    this.savingRepayment.set(true);
    try {
      const payer = this.activeUsers().find(u => u.uid === this.repaymentPaidBy);
      await this.loanService.addRepayment(
        this.loanId, this.repaymentAmount, this.repaymentNote, this.repaymentDate,
        this.repaymentPaidBy, payer?.displayName
      );
      this.repaymentAmount = 0;
      this.repaymentNote = '';
      await this.loadData();
    } catch (err: any) {
      this.repaymentError.set(err.message || 'Failed to add repayment');
    } finally {
      this.savingRepayment.set(false);
    }
  }

  async addMore(): Promise<void> {
    if (this.addMoreAmount <= 0) {
      this.addMoreError.set('Amount must be greater than 0');
      return;
    }
    this.addMoreError.set('');
    this.savingAddMore.set(true);
    try {
      await this.loanService.addMore(
        this.loanId, this.addMoreAmount, this.addMoreNote, this.addMoreDate
      );
      this.addMoreAmount = 0;
      this.addMoreNote = '';
      await this.loadData();
    } catch (err: any) {
      this.addMoreError.set(err.message || 'Failed to add amount');
    } finally {
      this.savingAddMore.set(false);
    }
  }

  confirmHardDelete(): void {
    const loan = this.loan()!;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Permanently Delete Loan',
        message: `This will permanently delete the loan to ${loan.personName} (${loan.amount.toLocaleString('en-IN')}). This cannot be undone.`,
        confirmText: 'Delete Forever',
      } as ConfirmDialogData,
    });

    ref.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) {
        await this.loanService.hardDelete(this.loanId);
        this.router.navigate(['/loans']);
      }
    });
  }

  edit(): void { this.router.navigate(['/loans', this.loanId, 'edit']); }
  back(): void { this.router.navigate(['/loans']); }
}
