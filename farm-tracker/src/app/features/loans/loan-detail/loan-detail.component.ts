import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LoanService, LiveEMIEntry } from '../../../core/services/loan.service';
import { UserService } from '../../../core/services/user.service';
import { SegmentService } from '../../../core/services/segment.service';
import { CategoryService } from '../../../core/services/category.service';
import { Loan, Repayment } from '../../../core/models/loan.model';
import { Transaction } from '../../../core/models/transaction.model';
import { AppUser } from '../../../core/models/user.model';
import { Segment } from '../../../core/models/segment.model';
import { Category } from '../../../core/models/category.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { DatePipe, TitleCasePipe } from '@angular/common';

@Component({
  selector: 'app-loan-detail',
  standalone: true,
  imports: [
    FormsModule, DatePipe, TitleCasePipe, RouterLink, CurrencyInrPipe, LoadingSpinnerComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule,
    MatDatepickerModule, MatProgressBarModule, MatSelectModule, MatTabsModule,
  ],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (loan()) {
      <div class="page-header">
        <h1>{{ loan()!.loanCategory === 'formal' ? (loan()!.loanSourceName ?? 'Formal Loan') : (loan()!.type === 'given' ? 'Lent' : 'Owed') }} Detail</h1>
        <div class="header-actions">
          <button mat-stroked-button (click)="edit()"><mat-icon>edit</mat-icon> Edit</button>
          @if (loan()!.repaymentStatus === 'completed' && loan()!.loanCategory !== 'formal') {
            <button mat-stroked-button color="warn" (click)="confirmHardDelete()"><mat-icon>delete_forever</mat-icon> Delete</button>
          }
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <!-- ===== Overview Card ===== -->
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
            <label>Status</label>
            <span class="status-badge" [class]="loan()!.repaymentStatus">{{ loan()!.repaymentStatus }}</span>
          </div>
          <div class="detail-item">
            <label>Person</label>
            <span>{{ loan()!.personName }}</span>
          </div>
          <div class="detail-item">
            <label>Segment</label>
            <span>{{ loan()!.segmentName }}</span>
          </div>

          @if (isFormal()) {
            <div class="detail-item">
              <label>Source</label>
              <span>{{ loan()!.loanSourceName ?? '' }} {{ loan()!.loanSource ? '(' + loan()!.loanSource + ')' : '' }}</span>
            </div>
            @if (loan()!.accountNumber) {
              <div class="detail-item">
                <label>Account #</label>
                <span>{{ loan()!.accountNumber }}</span>
              </div>
            }
            @if (loan()!.heldByName) {
              <div class="detail-item">
                <label>Held By</label>
                <span class="holder-badge">{{ loan()!.heldByName }}</span>
              </div>
            }
            <div class="detail-item">
              <label>Sanctioned</label>
              <span class="amount-total">{{ loan()!.sanctionedAmount | currencyInr }}</span>
            </div>
            <div class="detail-item">
              <label>Net Disbursed</label>
              <span class="amount-total">{{ loan()!.netDisbursedAmount | currencyInr }}</span>
            </div>
            <div class="detail-item">
              <label>Interest Rate</label>
              <span>{{ loan()!.interestRateInput }}% {{ loan()!.interestFrequency === 'monthly' ? '/month' : loan()!.interestFrequency === 'weekly' ? '/week' : 'p.a.' }}
                @if (loan()!.interestFrequency !== 'annual') { ({{ loan()!.interestRate }}% p.a.) }
              </span>
            </div>
            <div class="detail-item">
              <label>{{ loan()!.repaymentType === 'emi' ? 'EMI Amount' : 'Interest/Period' }}</label>
              <span>{{ (loan()!.repaymentType === 'emi' ? loan()!.emiAmount : loan()!.interestAmountPerPeriod) | currencyInr }}</span>
            </div>
            @if (loan()!.isSubsidized) {
              <div class="detail-item">
                <label>Subsidy</label>
                <span class="subsidy-badge">{{ loan()!.subsidyDetails }} ({{ loan()!.effectiveRate }}% eff.)</span>
              </div>
            }
            <div class="detail-item">
              <label>Outstanding</label>
              <span class="amount-large">{{ loan()!.outstandingBalance | currencyInr }}</span>
            </div>
            <div class="detail-item">
              <label>Interest Paid</label>
              <span>{{ loan()!.totalInterestPaid | currencyInr }}</span>
            </div>
            @if ((loan()!.totalPenaltyPaid ?? 0) > 0) {
              <div class="detail-item">
                <label>Penalty Paid</label>
                <span class="amount-penalty">{{ loan()!.totalPenaltyPaid | currencyInr }}</span>
              </div>
            }
            @if (loan()!.replacesLoanId) {
              <div class="detail-item full">
                <label>Balance Transfer</label>
                <span>Replaces previous loan — <a [routerLink]="['/loans', loan()!.replacesLoanId]">View old loan</a></span>
              </div>
            }
            @if (loan()!.replacedByLoanId) {
              <div class="detail-item full">
                <label>Transferred</label>
                <span>This loan was transferred — <a [routerLink]="['/loans', loan()!.replacedByLoanId]">View new loan</a></span>
              </div>
            }
          } @else {
            <div class="detail-item">
              <label>Amount</label>
              <span class="amount-total">{{ loan()!.amount | currencyInr }}</span>
            </div>
            <div class="detail-item">
              <label>Balance</label>
              <span class="amount-large">{{ loan()!.balanceRemaining | currencyInr }}</span>
            </div>
            <div class="detail-item">
              <label>Repaid</label>
              <span class="amount-repaid">{{ loan()!.totalRepaid | currencyInr }}</span>
            </div>
          }

          <div class="detail-item full">
            <label>Purpose</label>
            <span>{{ loan()!.purpose }}</span>
          </div>
        </div>

        <!-- Progress bar -->
        <div class="repayment-progress">
          <div class="progress-info">
            @if (isFormal()) {
              <span>Principal Repaid: {{ loan()!.totalPrincipalPaid | currencyInr }}</span>
              <span>Outstanding: {{ loan()!.outstandingBalance | currencyInr }}</span>
            } @else {
              <span>Repaid: {{ loan()!.totalRepaid | currencyInr }}</span>
              <span>Balance: {{ loan()!.balanceRemaining | currencyInr }}</span>
            }
          </div>
          <mat-progress-bar mode="determinate"
            [value]="isFormal()
              ? ((loan()!.sanctionedAmount ?? 0) > 0 ? ((loan()!.totalPrincipalPaid ?? 0) / (loan()!.sanctionedAmount ?? 1)) * 100 : 0)
              : (loan()!.amount > 0 ? (loan()!.totalRepaid / loan()!.amount) * 100 : 0)" />
        </div>
      </mat-card>

      <!-- ===== FORMAL LOAN SECTIONS ===== -->
      @if (isFormal()) {

        <!-- Deductions -->
        @if ((loan()!.deductions?.length ?? 0) > 0) {
          <h3 class="section-title">Deductions</h3>
          <mat-card>
            @for (d of loan()!.deductions!; track d.id) {
              <div class="list-entry">
                <div class="list-main">
                  <strong>{{ d.type === 'other' ? d.customLabel : formatDeductionType(d.type) }}</strong>
                  <span class="list-amount">{{ d.amount | currencyInr }}</span>
                </div>
                <div class="list-meta">
                  Paid to {{ d.paidTo }} &middot; {{ d.isFinanced ? 'Financed' : 'Paid separately' }}
                  @if (d.paymentReference) { &middot; Ref: {{ d.paymentReference }} }
                </div>
              </div>
            }
            <div class="list-entry total-row">
              <span>Total Deductions: {{ loan()!.totalDeductions | currencyInr }}</span>
              <span>Net Disbursed: {{ loan()!.netDisbursedAmount | currencyInr }}</span>
            </div>
          </mat-card>
        }

        <!-- Collateral -->
        @if ((loan()!.collaterals?.length ?? 0) > 0) {
          <h3 class="section-title">Collateral / Security</h3>
          <mat-card>
            @for (c of loan()!.collaterals!; track c.id) {
              <div class="list-entry">
                <div class="list-main">
                  <strong>{{ c.description }}</strong>
                  <span class="list-amount">{{ c.estimatedValue | currencyInr }}</span>
                </div>
                <div class="list-meta">
                  {{ c.type | titlecase }}
                  @if (c.weight) { &middot; {{ c.weight }}g {{ c.purity }} }
                  @if (c.isReleased) {
                    &middot; <span class="released-badge">Released {{ c.releasedDate?.toDate() | date:'dd MMM yyyy' }}</span>
                  } @else {
                    &middot; <span class="pledged-badge">Pledged</span>
                    @if (loan()!.repaymentStatus === 'completed') {
                      <button mat-button color="primary" (click)="releaseCollateral(c.id)">Release</button>
                    }
                  }
                </div>
              </div>
            }
          </mat-card>
        }

        <!-- Documents -->
        @if ((loan()!.documents?.length ?? 0) > 0) {
          <h3 class="section-title">Documents</h3>
          <mat-card>
            @for (d of loan()!.documents!; track d.id) {
              <div class="list-entry">
                <strong>{{ d.type === 'other' ? d.customLabel : formatDocType(d.type) }}</strong>
                @if (d.referenceNumber) { &middot; {{ d.referenceNumber }} }
                @if (d.note) { &middot; {{ d.note }} }
              </div>
            }
          </mat-card>
        }

        <!-- Rate Change History -->
        @if ((loan()!.rateChanges?.length ?? 0) > 0) {
          <h3 class="section-title">Rate Change History</h3>
          <mat-card>
            @for (rc of loan()!.rateChanges!; track rc.id) {
              <div class="list-entry">
                <div class="list-main">
                  <span>{{ rc.oldRate }}% → {{ rc.newRate }}% p.a.</span>
                  <span class="repayment-date">{{ rc.date.toDate() | date:'dd MMM yyyy' }}</span>
                </div>
                @if (rc.newEMI) { <div class="list-meta">New EMI: {{ rc.newEMI | currencyInr }}</div> }
                @if (rc.note) { <div class="list-meta">{{ rc.note }}</div> }
              </div>
            }
          </mat-card>
        }

        <!-- ===== EMI Schedule (EMI mode) ===== -->
        @if (loan()!.repaymentType === 'emi') {
          <h3 class="section-title">EMI Schedule</h3>
          <mat-card class="emi-card">
            <div class="emi-actions">
              @if (loan()!.repaymentStatus !== 'completed') {
                <button mat-stroked-button (click)="showPartPayment = !showPartPayment">Part-Payment</button>
                <button mat-stroked-button color="warn" (click)="showPreClose = !showPreClose">Pre-Close</button>
                <button mat-stroked-button (click)="balanceTransfer()">Balance Transfer</button>
              }
            </div>
            <div class="emi-table-wrap">
              <table class="emi-table">
                <thead>
                  <tr><th>#</th><th>Due Date</th><th>EMI</th><th>Principal</th><th>Interest</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  @for (e of emiSchedule(); track e.emiNumber + '_' + e.dueDate.getTime()) {
                    <tr [class]="e.status">
                      <td>{{ e.isPartPayment ? 'PP' : (e.emiNumber || '') }}</td>
                      <td>{{ e.dueDate | date:'MMM yyyy' }}</td>
                      <td>{{ e.emiAmount | currencyInr }}</td>
                      <td>{{ e.principal | currencyInr }}</td>
                      <td>{{ e.interest | currencyInr }}</td>
                      <td><span class="emi-status" [class]="e.status">{{ e.isPartPayment ? 'Part-Payment' : e.status }}</span></td>
                      <td>
                        @if (e.status === 'upcoming' || e.status === 'overdue') {
                          <button mat-button color="primary" (click)="recordEMIPayment(e)">Pay</button>
                        }
                        @if (e.status === 'overdue' && !e.isPartPayment) {
                          <button mat-button color="warn" (click)="recordPenalty(e)">Penalty</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-card>
        }

        <!-- ===== Interest Payment (Interest-only mode) ===== -->
        @if (loan()!.repaymentType === 'interest_only') {
          <h3 class="section-title">Interest Payments</h3>
          <mat-card>
            <div class="interest-summary">
              <div>Principal: <strong>{{ loan()!.outstandingBalance | currencyInr }}</strong> (fixed)</div>
              <div>Rate: <strong>{{ loan()!.interestRateInput }}% / {{ loan()!.interestPaymentFrequency }}</strong></div>
              <div>Per Period: <strong>{{ loan()!.interestAmountPerPeriod | currencyInr }}</strong></div>
              <div>Payments Made: <strong>{{ loan()!.totalInterestPaymentsMade ?? 0 }}</strong></div>
              <div>Total Interest Paid: <strong>{{ loan()!.totalInterestPaid | currencyInr }}</strong></div>
            </div>

            @if (loan()!.repaymentStatus !== 'completed') {
              <div class="interest-actions">
                <button mat-flat-button color="primary" (click)="showInterestForm = !showInterestForm">Pay Interest</button>
                <button mat-flat-button color="accent" (click)="showCloseForm = !showCloseForm">Close Loan (Pay Principal)</button>
                <button mat-stroked-button (click)="balanceTransfer()">Balance Transfer</button>
              </div>
            }

            @if (showInterestForm) {
              <div class="inline-form">
                @if (formalError()) { <div class="error-message">{{ formalError() }}</div> }
                <div class="repayment-form">
                  <mat-form-field appearance="outline">
                    <mat-label>Amount</mat-label>
                    <input matInput type="number" [(ngModel)]="interestPayAmount" min="1" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Date</mat-label>
                    <input matInput [matDatepicker]="iPicker" [(ngModel)]="interestPayDate" />
                    <mat-datepicker-toggle matIconSuffix [for]="iPicker" /><mat-datepicker #iPicker />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Reference</mat-label>
                    <input matInput [(ngModel)]="interestPayRef" />
                  </mat-form-field>
                  <button mat-flat-button color="primary" (click)="payInterest()" [disabled]="savingFormal()">
                    {{ savingFormal() ? 'Saving...' : 'Record Payment' }}
                  </button>
                </div>
              </div>
            }

            @if (showCloseForm) {
              <div class="inline-form">
                @if (formalError()) { <div class="error-message">{{ formalError() }}</div> }
                <div class="repayment-form">
                  <mat-form-field appearance="outline">
                    <mat-label>Amount (principal + charges)</mat-label>
                    <input matInput type="number" [(ngModel)]="closePrincipalAmount" min="1" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Date</mat-label>
                    <input matInput [matDatepicker]="cPicker" [(ngModel)]="closePrincipalDate" />
                    <mat-datepicker-toggle matIconSuffix [for]="cPicker" /><mat-datepicker #cPicker />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Reference</mat-label>
                    <input matInput [(ngModel)]="closePrincipalRef" />
                  </mat-form-field>
                  <button mat-flat-button color="accent" (click)="closeWithPrincipal()" [disabled]="savingFormal()">
                    {{ savingFormal() ? 'Closing...' : 'Close Loan' }}
                  </button>
                </div>
              </div>
            }
          </mat-card>
        }

        <!-- Part-Payment Form (EMI mode) -->
        @if (showPartPayment) {
          <h3 class="section-title">Part-Payment</h3>
          <mat-card class="repayment-form-card">
            @if (formalError()) { <div class="error-message">{{ formalError() }}</div> }
            <div class="repayment-form">
              <mat-form-field appearance="outline">
                <mat-label>Amount</mat-label>
                <input matInput type="number" [(ngModel)]="partPayAmount" min="1" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Date</mat-label>
                <input matInput [matDatepicker]="ppPicker" [(ngModel)]="partPayDate" />
                <mat-datepicker-toggle matIconSuffix [for]="ppPicker" /><mat-datepicker #ppPicker />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Reference</mat-label>
                <input matInput [(ngModel)]="partPayRef" />
              </mat-form-field>
              <button mat-flat-button color="primary" (click)="makePartPayment()" [disabled]="savingFormal()">
                {{ savingFormal() ? 'Saving...' : 'Pay' }}
              </button>
            </div>
          </mat-card>
        }

        <!-- Pre-Close Form (EMI mode) -->
        @if (showPreClose) {
          <h3 class="section-title">Pre-Close Loan</h3>
          <mat-card class="repayment-form-card">
            @if (formalError()) { <div class="error-message">{{ formalError() }}</div> }
            <div class="repayment-form">
              <mat-form-field appearance="outline">
                <mat-label>Outstanding Amount</mat-label>
                <input matInput type="number" [(ngModel)]="preCloseAmount" min="1" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Charges</mat-label>
                <input matInput type="number" [(ngModel)]="preCloseCharges" min="0" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Date</mat-label>
                <input matInput [matDatepicker]="pcPicker" [(ngModel)]="preCloseDate" />
                <mat-datepicker-toggle matIconSuffix [for]="pcPicker" /><mat-datepicker #pcPicker />
              </mat-form-field>
              <button mat-flat-button color="warn" (click)="preClose()" [disabled]="savingFormal()">
                {{ savingFormal() ? 'Closing...' : 'Pre-Close' }}
              </button>
            </div>
          </mat-card>
        }

        <!-- Utilization Tracker -->
        <h3 class="section-title">Utilization</h3>
        <mat-card>
          <div class="utilization-bar">
            <span>Used: {{ loan()!.utilizationTotal | currencyInr }}</span>
            <span>Remaining: {{ loan()!.utilizationRemaining | currencyInr }}</span>
            <span>of {{ loan()!.netDisbursedAmount | currencyInr }}</span>
          </div>
          <mat-progress-bar mode="determinate"
            [value]="(loan()!.netDisbursedAmount ?? 0) > 0 ? ((loan()!.utilizationTotal ?? 0) / (loan()!.netDisbursedAmount ?? 1)) * 100 : 0" />

          <mat-tab-group>
            <mat-tab label="Business Use ({{ linkedTransactions().length }})">
              @for (t of linkedTransactions(); track t.id) {
                <div class="list-entry clickable" [routerLink]="['/transactions', t.id]">
                  <div class="list-main">
                    <strong>{{ t.description }}</strong>
                    <span class="list-amount">{{ t.amount | currencyInr }}</span>
                  </div>
                  <div class="list-meta">{{ t.date.toDate() | date:'dd MMM yyyy' }} &middot; {{ t.segmentName }} &middot; {{ t.categoryName }}</div>
                </div>
              }
              @if (linkedTransactions().length === 0) {
                <div class="empty-text">No business utilization yet</div>
              }

              <!-- Add Business Utilization Form -->
              @if (loan()!.repaymentStatus !== 'completed' && (loan()!.utilizationRemaining ?? 0) > 0) {
                <div class="inline-form">
                  @if (utilizationError()) { <div class="error-message">{{ utilizationError() }}</div> }
                  <div class="repayment-form">
                    <mat-form-field appearance="outline">
                      <mat-label>Description</mat-label>
                      <input matInput [(ngModel)]="utilDesc" />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Amount</mat-label>
                      <input matInput type="number" [(ngModel)]="utilAmount" min="1" />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Date</mat-label>
                      <input matInput [matDatepicker]="uPicker" [(ngModel)]="utilDate" />
                      <mat-datepicker-toggle matIconSuffix [for]="uPicker" /><mat-datepicker #uPicker />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Segment</mat-label>
                      <mat-select [(ngModel)]="utilSegment">
                        @for (seg of allSegments(); track seg.id) {
                          <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Category</mat-label>
                      <mat-select [(ngModel)]="utilCategory">
                        @for (cat of expenseCategories(); track cat.id) {
                          <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <button mat-flat-button color="primary" (click)="addUtilization()" [disabled]="savingUtil()">
                      {{ savingUtil() ? 'Adding...' : 'Add' }}
                    </button>
                  </div>
                </div>
              }
            </mat-tab>

            <mat-tab label="Personal ({{ linkedSimpleLoans().length }})">
              @for (sl of linkedSimpleLoans(); track sl.id) {
                <div class="list-entry clickable" [routerLink]="['/loans', sl.id]">
                  <div class="list-main">
                    <strong>{{ sl.personName }}</strong>
                    <span class="list-amount">{{ sl.amount | currencyInr }}</span>
                  </div>
                  <div class="list-meta">
                    Returned: {{ sl.totalRepaid | currencyInr }} &middot;
                    Holding: {{ sl.balanceRemaining | currencyInr }} &middot;
                    {{ sl.repaymentStatus }}
                  </div>
                </div>
              }
              @if (linkedSimpleLoans().length === 0) {
                <div class="empty-text">No personal withdrawals</div>
              }

              <!-- Add Personal Withdrawal Form -->
              @if (loan()!.repaymentStatus !== 'completed' && (loan()!.utilizationRemaining ?? 0) > 0) {
                <div class="inline-form">
                  @if (personalError()) { <div class="error-message">{{ personalError() }}</div> }
                  <div class="repayment-form">
                    <mat-form-field appearance="outline">
                      <mat-label>Person</mat-label>
                      <mat-select [(ngModel)]="personalPersonUid" (ngModelChange)="onPersonalPersonChange()">
                        @for (u of activeUsers(); track u.uid) {
                          <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
                        }
                        <mat-option value="other">Other (outside person)</mat-option>
                      </mat-select>
                    </mat-form-field>
                    @if (personalPersonUid === 'other') {
                      <mat-form-field appearance="outline">
                        <mat-label>Person Name</mat-label>
                        <input matInput [(ngModel)]="personalCustomName" placeholder="e.g. Friend, Family member" />
                      </mat-form-field>
                    }
                    <mat-form-field appearance="outline">
                      <mat-label>Amount</mat-label>
                      <input matInput type="number" [(ngModel)]="personalAmount" min="1" />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Date</mat-label>
                      <input matInput [matDatepicker]="pPicker" [(ngModel)]="personalDate" />
                      <mat-datepicker-toggle matIconSuffix [for]="pPicker" /><mat-datepicker #pPicker />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Note</mat-label>
                      <input matInput [(ngModel)]="personalNote" />
                    </mat-form-field>
                    <button mat-flat-button color="accent" (click)="addPersonalUse()" [disabled]="savingPersonal()">
                      {{ savingPersonal() ? 'Adding...' : 'Add' }}
                    </button>
                  </div>
                </div>
              }
            </mat-tab>
          </mat-tab-group>
        </mat-card>

        <!-- Loan Summary -->
        @if (loan()!.repaymentStatus === 'completed') {
          <h3 class="section-title">Loan Summary</h3>
          <mat-card>
            <div class="detail-grid">
              <div class="detail-item"><label>Sanctioned</label><span>{{ loan()!.sanctionedAmount | currencyInr }}</span></div>
              <div class="detail-item"><label>Deductions</label><span>{{ loan()!.totalDeductions | currencyInr }}</span></div>
              <div class="detail-item"><label>Net Disbursed</label><span>{{ loan()!.netDisbursedAmount | currencyInr }}</span></div>
              <div class="detail-item"><label>Principal Repaid</label><span>{{ loan()!.totalPrincipalPaid | currencyInr }}</span></div>
              <div class="detail-item"><label>Interest Paid</label><span>{{ loan()!.totalInterestPaid | currencyInr }}</span></div>
              <div class="detail-item"><label>Total Repaid</label><span>{{ loan()!.totalRepaid | currencyInr }}</span></div>
              @if ((loan()!.preClosureCharges ?? 0) > 0) {
                <div class="detail-item"><label>Pre-closure Charges</label><span>{{ loan()!.preClosureCharges | currencyInr }}</span></div>
              }
              @if (loan()!.closureReason) {
                <div class="detail-item"><label>Closure</label><span>{{ loan()!.closureReason }} — {{ loan()!.loanClosureDate?.toDate() | date:'dd MMM yyyy' }}</span></div>
              }
            </div>
          </mat-card>
        }
      }

      <!-- ===== SIMPLE LOAN SECTIONS (existing behavior) ===== -->
      @if (!isFormal()) {
        <!-- Add More Amount -->
        <h3 class="section-title">Add More Amount</h3>
        <mat-card class="repayment-form-card">
          @if (addMoreError()) { <div class="error-message">{{ addMoreError() }}</div> }
          <div class="repayment-form">
            <mat-form-field appearance="outline"><mat-label>Additional Amount</mat-label>
              <input matInput type="number" [(ngModel)]="addMoreAmount" min="1" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Date</mat-label>
              <input matInput [matDatepicker]="mPicker" [(ngModel)]="addMoreDate" />
              <mat-datepicker-toggle matIconSuffix [for]="mPicker" /><mat-datepicker #mPicker /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Note</mat-label>
              <input matInput [(ngModel)]="addMoreNote" /></mat-form-field>
            <button mat-flat-button color="accent" (click)="addMore()" [disabled]="savingAddMore()">
              {{ savingAddMore() ? 'Adding...' : 'Add More' }}</button>
          </div>
        </mat-card>

        <!-- Add Repayment -->
        @if (loan()!.repaymentStatus !== 'completed') {
          <h3 class="section-title">Add Repayment</h3>
          <mat-card class="repayment-form-card">
            @if (repaymentError()) { <div class="error-message">{{ repaymentError() }}</div> }
            <div class="repayment-form">
              <mat-form-field appearance="outline"><mat-label>Amount</mat-label>
                <input matInput type="number" [(ngModel)]="repaymentAmount" min="1" [max]="loan()!.balanceRemaining" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Date</mat-label>
                <input matInput [matDatepicker]="rPicker" [(ngModel)]="repaymentDate" />
                <mat-datepicker-toggle matIconSuffix [for]="rPicker" /><mat-datepicker #rPicker /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Paid By</mat-label>
                <mat-select [(ngModel)]="repaymentPaidBy">
                  @for (u of activeUsers(); track u.uid) {
                    <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
                  }</mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Note</mat-label>
                <input matInput [(ngModel)]="repaymentNote" /></mat-form-field>
              <button mat-flat-button color="primary" (click)="addRepayment()" [disabled]="savingRepayment()">
                {{ savingRepayment() ? 'Adding...' : 'Add Repayment' }}</button>
            </div>
          </mat-card>
        }
      }

      <!-- Transaction History (both modes) -->
      @if (repayments().length > 0) {
        <h3 class="section-title">Transaction History</h3>
        <mat-card>
          @for (r of repayments(); track r.id) {
            <div class="repayment-entry" [class.disbursement]="r.amount < 0">
              <div class="repayment-info">
                @if (r.amount < 0) {
                  <strong class="disbursement-amount">+ {{ (-r.amount) | currencyInr }} given</strong>
                } @else if (r.isEMIPayment) {
                  <strong class="repayment-amount">EMI #{{ r.emiNumber }}: {{ r.amount | currencyInr }}</strong>
                  <span class="emi-split">(P: {{ r.principalPortion | currencyInr }} / I: {{ r.interestPortion | currencyInr }})</span>
                } @else if (r.isPartPayment) {
                  <strong class="repayment-amount">Part-payment: {{ r.amount | currencyInr }}</strong>
                } @else if (r.penaltyAmount) {
                  <strong class="amount-penalty">Penalty: {{ r.penaltyAmount | currencyInr }}</strong>
                } @else if (r.isPreClosure) {
                  <strong class="repayment-amount">Closure: {{ r.amount | currencyInr }}</strong>
                } @else {
                  <strong class="repayment-amount">{{ r.amount | currencyInr }} repaid</strong>
                }
                <span class="repayment-date">{{ r.date.toDate() | date:'dd MMM yyyy' }}</span>
              </div>
              <div class="repayment-meta">
                @if (r.paidByName && r.paidByName !== r.recordedByName) { paid by {{ r.paidByName }} &middot; }
                {{ r.note }} &middot; recorded by {{ r.recordedByName }}
                @if (r.paymentReference) { &middot; Ref: {{ r.paymentReference }} }
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
    .amount-penalty { color: #dc2626; font-weight: 600; }
    .type-badge, .status-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    .type-badge.given { background: #fef3c7; color: #d97706; }
    .type-badge.received { background: #dbeafe; color: #2563eb; }
    .status-badge.pending { background: #fef2f2; color: #dc2626; }
    .status-badge.partial { background: #fef3c7; color: #d97706; }
    .status-badge.completed { background: #f0fdf4; color: #16a34a; }
    .subsidy-badge { background: #ecfdf5; color: #059669; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; }
    .pledged-badge { color: #dc2626; font-weight: 600; }
    .holder-badge { background: #ede9fe; color: #7c3aed; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
    .released-badge { color: #16a34a; font-weight: 600; }
    .repayment-progress { margin-top: 1.5rem; }
    .progress-info { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 0.875rem; color: #64748b; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; color: #1e293b; }
    .repayment-form-card { padding: 1rem; }
    .repayment-form { display: flex; gap: 1rem; align-items: flex-start; flex-wrap: wrap; }
    .repayment-form mat-form-field { flex: 1; min-width: 140px; }
    .inline-form { padding: 1rem 0; border-top: 1px solid #f1f5f9; margin-top: 0.5rem; }
    .repayment-entry { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
    .repayment-info { display: flex; justify-content: space-between; align-items: center; }
    .repayment-date { color: #94a3b8; }
    .repayment-meta { font-size: 0.8rem; color: #64748b; margin-top: 4px; }
    .emi-split { font-size: 0.75rem; color: #64748b; margin-left: 8px; }
    .error-message { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    .disbursement { background: #fefce8; }
    .disbursement-amount { color: #d97706; }
    .repayment-amount { color: #16a34a; }
    .list-entry { padding: 10px 16px; border-bottom: 1px solid #f1f5f9; }
    .list-entry.clickable { cursor: pointer; } .list-entry.clickable:hover { background: #f8fafc; }
    .list-main { display: flex; justify-content: space-between; align-items: center; }
    .list-amount { font-weight: 600; color: #1e293b; }
    .list-meta { font-size: 0.8rem; color: #64748b; margin-top: 2px; }
    .total-row { font-weight: 600; background: #f8fafc; display: flex; justify-content: space-between; }
    .empty-text { padding: 1rem; color: #94a3b8; text-align: center; }
    .utilization-bar { display: flex; gap: 1rem; font-size: 0.875rem; color: #64748b; margin-bottom: 8px; }
    .interest-summary { display: flex; flex-wrap: wrap; gap: 1.5rem; padding: 1rem 0; font-size: 0.9rem; }
    .interest-actions, .emi-actions { display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .emi-card { padding: 1rem; }
    .emi-table-wrap { overflow-x: auto; }
    .emi-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
    .emi-table th { background: #f8fafc; padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0; }
    .emi-table td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
    .emi-table tr.paid { background: #f0fdf4; }
    .emi-table tr.overdue { background: #fef2f2; }
    .emi-table tr.moratorium { background: #f5f3ff; }
    .emi-status { padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
    .emi-status.paid { background: #dcfce7; color: #16a34a; }
    .emi-status.upcoming { background: #e0f2fe; color: #0284c7; }
    .emi-status.overdue { background: #fee2e2; color: #dc2626; }
    .emi-status.moratorium { background: #ede9fe; color: #7c3aed; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .detail-grid { grid-template-columns: 1fr 1fr; gap: 1rem; }
      .detail-card { padding: 1rem; }
      .repayment-form { flex-direction: column; gap: 0.5rem; }
      .repayment-form mat-form-field { min-width: 0; flex-basis: 100%; width: 100%; }
      .inline-form { padding: 0.75rem 0; }
      .emi-actions, .interest-actions { flex-direction: column; gap: 0.5rem; }
      .emi-actions button, .interest-actions button { width: 100%; }
      .emi-table { font-size: 0.7rem; }
      .emi-table th, .emi-table td { padding: 4px 4px; }
      .emi-table th:nth-child(4), .emi-table td:nth-child(4),
      .emi-table th:nth-child(5), .emi-table td:nth-child(5) { display: none; }
      .interest-summary { flex-direction: column; gap: 0.75rem; font-size: 0.85rem; }
      .utilization-bar { flex-direction: column; gap: 0.25rem; font-size: 0.8rem; }
      .list-main { flex-direction: column; align-items: flex-start; gap: 2px; }
      .list-entry { padding: 8px 12px; }
    }
    @media (max-width: 480px) {
      .detail-grid { grid-template-columns: 1fr; }
      .header-actions { width: 100%; }
      .header-actions button { flex: 1; }
      .amount-large { font-size: 1.2rem !important; }
    }
  `],
})
export class LoanDetailComponent implements OnInit {
  private loanService = inject(LoanService);
  private userService = inject(UserService);
  private segmentService = inject(SegmentService);
  private categoryService = inject(CategoryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);

  loan = signal<Loan | null>(null);
  repayments = signal<Repayment[]>([]);
  activeUsers = signal<AppUser[]>([]);
  allSegments = signal<Segment[]>([]);
  expenseCategories = signal<Category[]>([]);
  linkedTransactions = signal<Transaction[]>([]);
  linkedSimpleLoans = signal<Loan[]>([]);
  emiSchedule = signal<LiveEMIEntry[]>([]);
  loading = signal(true);

  isFormal = computed(() => this.loan()?.loanCategory === 'formal');

  // Simple loan forms
  repaymentAmount = 0; repaymentDate = new Date(); repaymentNote = ''; repaymentPaidBy = '';
  repaymentError = signal(''); savingRepayment = signal(false);
  addMoreAmount = 0; addMoreDate = new Date(); addMoreNote = '';
  addMoreError = signal(''); savingAddMore = signal(false);

  // Formal loan forms
  formalError = signal(''); savingFormal = signal(false);
  showPartPayment = false; showPreClose = false;
  showInterestForm = false; showCloseForm = false;

  // EMI payment (set when clicking "Pay" on an EMI row)
  emiPayData: LiveEMIEntry | null = null;

  // Part-payment
  partPayAmount = 0; partPayDate = new Date(); partPayRef = '';

  // Pre-close
  preCloseAmount = 0; preCloseCharges = 0; preCloseDate = new Date();

  // Interest-only payment
  interestPayAmount = 0; interestPayDate = new Date(); interestPayRef = '';

  // Close principal
  closePrincipalAmount = 0; closePrincipalDate = new Date(); closePrincipalRef = '';

  // Utilization
  utilDesc = ''; utilAmount = 0; utilDate = new Date(); utilSegment = ''; utilCategory = '';
  utilizationError = signal(''); savingUtil = signal(false);

  // Personal withdrawal
  personalPersonUid = ''; personalCustomName = ''; personalAmount = 0; personalDate = new Date(); personalNote = '';
  personalError = signal(''); savingPersonal = signal(false);

  private loanId = '';

  async ngOnInit(): Promise<void> {
    this.loanId = this.route.snapshot.params['id'];
    const [users, segments, categories] = await Promise.all([
      this.userService.getAll(),
      this.segmentService.getAll(),
      this.categoryService.getByType('expense'),
    ]);
    this.activeUsers.set(users.filter(u => u.isActive));
    this.allSegments.set(segments);
    this.expenseCategories.set(categories);
    this.repaymentPaidBy = this.activeUsers()[0]?.uid || '';
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const loan = await this.loanService.getById(this.loanId);
    this.loan.set(loan);

    const repayments = await this.loanService.getRepayments(this.loanId);
    this.repayments.set(repayments);

    if (loan?.loanCategory === 'formal') {
      const [txns, simpleLoans] = await Promise.all([
        this.loanService.getLinkedTransactions(this.loanId),
        this.loanService.getLinkedSimpleLoans(this.loanId),
      ]);
      this.linkedTransactions.set(txns as Transaction[]);
      this.linkedSimpleLoans.set(simpleLoans);

      if (loan.repaymentType === 'emi') {
        this.emiSchedule.set(this.loanService.buildLiveEMISchedule(loan, repayments));
      }

      // Pre-fill pre-close amount
      this.preCloseAmount = loan.outstandingBalance ?? loan.balanceRemaining;
      this.closePrincipalAmount = loan.outstandingBalance ?? loan.balanceRemaining;
      this.interestPayAmount = loan.interestAmountPerPeriod ?? 0;
    }

    this.loading.set(false);
  }

  // --- Simple loan actions (existing) ---
  async addRepayment(): Promise<void> {
    if (this.repaymentAmount <= 0) { this.repaymentError.set('Amount must be greater than 0'); return; }
    this.repaymentError.set(''); this.savingRepayment.set(true);
    try {
      const payer = this.activeUsers().find(u => u.uid === this.repaymentPaidBy);
      await this.loanService.addRepayment(this.loanId, this.repaymentAmount, this.repaymentNote, this.repaymentDate, this.repaymentPaidBy, payer?.displayName);
      this.repaymentAmount = 0; this.repaymentNote = '';
      await this.loadData();
    } catch (err: any) { this.repaymentError.set(err.message); } finally { this.savingRepayment.set(false); }
  }

  async addMore(): Promise<void> {
    if (this.addMoreAmount <= 0) { this.addMoreError.set('Amount must be greater than 0'); return; }
    this.addMoreError.set(''); this.savingAddMore.set(true);
    try {
      await this.loanService.addMore(this.loanId, this.addMoreAmount, this.addMoreNote, this.addMoreDate);
      this.addMoreAmount = 0; this.addMoreNote = '';
      await this.loadData();
    } catch (err: any) { this.addMoreError.set(err.message); } finally { this.savingAddMore.set(false); }
  }

  // --- Formal loan actions ---
  async recordEMIPayment(emi: LiveEMIEntry): Promise<void> {
    this.formalError.set(''); this.savingFormal.set(true);
    try {
      await this.loanService.addEMIPayment(this.loanId, {
        amount: emi.emiAmount,
        emiNumber: emi.emiNumber,
        principalPortion: emi.principal,
        interestPortion: emi.interest,
        date: new Date(),
      });
      await this.loadData();
    } catch (err: any) { this.formalError.set(err.message); } finally { this.savingFormal.set(false); }
  }

  async recordPenalty(emi: LiveEMIEntry): Promise<void> {
    this.formalError.set(''); this.savingFormal.set(true);
    try {
      const penaltyAmt = Math.round(emi.emiAmount * 0.02 * 100) / 100; // Default 2% penalty
      await this.loanService.addPenaltyPayment(this.loanId, penaltyAmt, emi.emiNumber, new Date());
      await this.loadData();
    } catch (err: any) { this.formalError.set(err.message); } finally { this.savingFormal.set(false); }
  }

  async makePartPayment(): Promise<void> {
    if (this.partPayAmount <= 0) { this.formalError.set('Amount must be greater than 0'); return; }
    this.formalError.set(''); this.savingFormal.set(true);
    try {
      await this.loanService.addPartPayment(this.loanId, this.partPayAmount, this.partPayDate, this.partPayRef);
      this.partPayAmount = 0; this.partPayRef = ''; this.showPartPayment = false;
      await this.loadData();
    } catch (err: any) { this.formalError.set(err.message); } finally { this.savingFormal.set(false); }
  }

  async preClose(): Promise<void> {
    if (this.preCloseAmount <= 0) { this.formalError.set('Amount must be greater than 0'); return; }
    this.formalError.set(''); this.savingFormal.set(true);
    try {
      await this.loanService.preCloseLoan(this.loanId, this.preCloseAmount, this.preCloseCharges, this.preCloseDate);
      this.showPreClose = false;
      await this.loadData();
    } catch (err: any) { this.formalError.set(err.message); } finally { this.savingFormal.set(false); }
  }

  async payInterest(): Promise<void> {
    if (this.interestPayAmount <= 0) { this.formalError.set('Amount must be greater than 0'); return; }
    this.formalError.set(''); this.savingFormal.set(true);
    try {
      await this.loanService.addInterestPayment(this.loanId, this.interestPayAmount, this.interestPayDate, this.interestPayRef);
      this.interestPayRef = ''; this.showInterestForm = false;
      await this.loadData();
    } catch (err: any) { this.formalError.set(err.message); } finally { this.savingFormal.set(false); }
  }

  async closeWithPrincipal(): Promise<void> {
    if (this.closePrincipalAmount <= 0) { this.formalError.set('Amount must be greater than 0'); return; }
    this.formalError.set(''); this.savingFormal.set(true);
    try {
      await this.loanService.closePrincipal(this.loanId, this.closePrincipalAmount, this.closePrincipalDate, this.closePrincipalRef);
      this.showCloseForm = false;
      await this.loadData();
    } catch (err: any) { this.formalError.set(err.message); } finally { this.savingFormal.set(false); }
  }

  async addUtilization(): Promise<void> {
    if (!this.utilDesc || this.utilAmount <= 0) { this.utilizationError.set('Description and amount required'); return; }
    this.utilizationError.set(''); this.savingUtil.set(true);
    try {
      const seg = this.allSegments().find(s => s.id === this.utilSegment);
      const cat = this.expenseCategories().find(c => c.id === this.utilCategory);
      await this.loanService.addBusinessUtilization(this.loanId, {
        description: this.utilDesc, amount: this.utilAmount, date: this.utilDate,
        category: this.utilCategory, categoryName: cat?.name ?? 'Other',
        segment: this.utilSegment || this.loan()!.segment, segmentName: seg?.name ?? this.loan()!.segmentName,
      });
      this.utilDesc = ''; this.utilAmount = 0;
      await this.loadData();
    } catch (err: any) { this.utilizationError.set(err.message); } finally { this.savingUtil.set(false); }
  }

  onPersonalPersonChange(): void {
    if (this.personalPersonUid !== 'other') {
      this.personalCustomName = '';
    }
  }

  async addPersonalUse(): Promise<void> {
    const isOther = this.personalPersonUid === 'other';
    if ((!this.personalPersonUid || (isOther && !this.personalCustomName.trim())) || this.personalAmount <= 0) {
      this.personalError.set('Person and amount required');
      return;
    }
    this.personalError.set(''); this.savingPersonal.set(true);
    try {
      const personName = isOther
        ? this.personalCustomName.trim()
        : (this.activeUsers().find(u => u.uid === this.personalPersonUid)?.displayName ?? '');
      const personUid = isOther ? undefined : this.personalPersonUid;
      await this.loanService.addPersonalUtilization(this.loanId, personName, personUid, this.personalAmount, this.personalNote, this.personalDate);
      this.personalPersonUid = ''; this.personalCustomName = ''; this.personalAmount = 0; this.personalNote = '';
      await this.loadData();
    } catch (err: any) { this.personalError.set(err.message); } finally { this.savingPersonal.set(false); }
  }

  async releaseCollateral(itemId: string): Promise<void> {
    await this.loanService.releaseCollateral(this.loanId, itemId, new Date());
    await this.loadData();
  }

  balanceTransfer(): void {
    this.router.navigate(['/loans', 'new'], { queryParams: { transferFrom: this.loanId } });
  }

  confirmHardDelete(): void {
    const loan = this.loan()!;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Permanently Delete Loan', message: `Delete loan to ${loan.personName} (${loan.amount.toLocaleString('en-IN')})? This cannot be undone.`, confirmText: 'Delete Forever' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (confirmed) => {
      if (confirmed) { await this.loanService.hardDelete(this.loanId); this.router.navigate(['/loans']); }
    });
  }

  edit(): void { this.router.navigate(['/loans', this.loanId, 'edit']); }
  back(): void { this.router.navigate(['/loans']); }

  formatDeductionType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  formatDocType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}
