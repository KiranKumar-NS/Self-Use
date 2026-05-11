import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../../../core/services/loan.service';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { Loan, Repayment } from '../../../core/models/loan.model';
import { AuditLog } from '../../../core/models/audit-log.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe, RelativeTimePipe, LoadingSpinnerComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatDatepickerModule, MatNativeDateModule, MatProgressBarModule,
  ],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (loan()) {
      <div class="page-header">
        <h1>Loan Detail</h1>
        <div>
          <button mat-stroked-button (click)="edit()">
            <mat-icon>edit</mat-icon> Edit
          </button>
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <mat-card class="detail-card">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Type</label>
            <span class="type-badge" [class]="loan()!.type">{{ loan()!.type }}</span>
          </div>
          <div class="detail-item">
            <label>Date</label>
            <span>{{ loan()!.date.toDate() | date:'dd MMM yyyy' }}</span>
          </div>
          <div class="detail-item">
            <label>Amount</label>
            <span class="amount-large">{{ loan()!.amount | currencyInr }}</span>
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
              <mat-label>Note</mat-label>
              <input matInput [(ngModel)]="repaymentNote" />
            </mat-form-field>
            <button mat-flat-button color="primary" (click)="addRepayment()" [disabled]="savingRepayment()">
              {{ savingRepayment() ? 'Adding...' : 'Add Repayment' }}
            </button>
          </div>
        </mat-card>
      }

      <!-- Repayment History -->
      @if (repayments().length > 0) {
        <h3 class="section-title">Repayment History</h3>
        <mat-card>
          @for (r of repayments(); track r.id) {
            <div class="repayment-entry">
              <div class="repayment-info">
                <strong>{{ r.amount | currencyInr }}</strong>
                <span class="repayment-date">{{ r.date.toDate() | date:'dd MMM yyyy' }}</span>
              </div>
              <div class="repayment-meta">
                {{ r.note }} &middot; by {{ r.recordedByName }}
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
    .detail-card { padding: 1.5rem; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; }
    .detail-item label { display: block; font-size: 0.75rem; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .detail-item span { font-size: 1rem; color: #1e293b; }
    .detail-item.full { grid-column: 1 / -1; }
    .amount-large { font-size: 1.5rem !important; font-weight: 700; color: #4f46e5 !important; }
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
  `],
})
export class LoanDetailComponent implements OnInit {
  private loanService = inject(LoanService);
  private auditLogService = inject(AuditLogService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loan = signal<Loan | null>(null);
  repayments = signal<Repayment[]>([]);
  loading = signal(true);

  repaymentAmount = 0;
  repaymentDate = new Date();
  repaymentNote = '';
  repaymentError = signal('');
  savingRepayment = signal(false);

  private loanId = '';

  async ngOnInit(): Promise<void> {
    this.loanId = this.route.snapshot.params['id'];
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
      await this.loanService.addRepayment(
        this.loanId, this.repaymentAmount, this.repaymentNote, this.repaymentDate
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

  edit(): void { this.router.navigate(['/loans', this.loanId, 'edit']); }
  back(): void { this.router.navigate(['/loans']); }
}
