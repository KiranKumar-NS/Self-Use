import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal, OnInit, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../../../core/services/loan.service';
import { AuthService } from '../../../core/services/auth.service';
import { SegmentService } from '../../../core/services/segment.service';
import { UserService } from '../../../core/services/user.service';
import { Segment } from '../../../core/models/segment.model';
import {
  LoanFormData, LoanCategory, LoanSource, RepaymentType, InterestType,
  InterestFrequency, DeductionType, CollateralType, LoanDocumentType, EMIEntry,
} from '../../../core/models/loan.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { ToastService } from '../../../core/services/toast.service';
import { ErrorMessagePipe } from '../../../shared/pipes/error-message.pipe';

interface DeductionRow {
  type: DeductionType;
  customLabel: string;
  amount: number;
  paidTo: string;
  date: Date;
  paymentReference: string;
  isFinanced: boolean;
  note: string;
}

interface CollateralRow {
  type: CollateralType;
  description: string;
  estimatedValue: number;
  weight: number | null;
  purity: string;
  documentReference: string;
  note: string;
  // Gold-specific
  itemName: string;
  quantity: number;
  grossWeight: number | null;
  netWeight: number | null;
  goldRatePerGram: number | null;
  goldValue: number | null;
}

interface DocRow {
  type: LoanDocumentType;
  customLabel: string;
  referenceNumber: string;
  date: Date | null;
  note: string;
}

@Component({
  selector: 'app-loan-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, DecimalPipe, CurrencyInrPipe, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatRadioModule,
    MatIconModule, MatSlideToggleModule, MatChipsModule, MatTooltipModule, ErrorMessagePipe,
  ],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit' : 'Add' }} {{ loanCategory === 'formal' ? 'Formal Loan' : 'Owe / Lent Entry' }}</h1>
    </div>

    <mat-card class="form-card">
      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <form (ngSubmit)="save()">
        <!-- Loan Category Toggle (only on create) -->
        @if (!isEdit()) {
          <div class="form-row">
            <mat-radio-group [(ngModel)]="loanCategory" name="loanCategory" (ngModelChange)="onCategoryChange()">
              <mat-radio-button value="simple">Simple (Owe / Lent)</mat-radio-button>
              <mat-radio-button value="formal">Formal Loan (Bank / Finance)</mat-radio-button>
            </mat-radio-group>
          </div>
        }

        <!-- Type (both modes) -->
        <div class="form-row">
          <mat-radio-group [(ngModel)]="type" name="type">
            <mat-radio-button value="given">Lent (We gave money)</mat-radio-button>
            <mat-radio-button value="received">Owed (We borrowed money)</mat-radio-button>
          </mat-radio-group>
        </div>

        <!-- ===== SIMPLE LOAN FIELDS ===== -->
        @if (loanCategory === 'simple') {
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Date</mat-label>
              <input matInput [matDatepicker]="picker" [(ngModel)]="date" name="date" required #dateModel="ngModel" />
              <mat-datepicker-toggle matIconSuffix [for]="picker" />
              <mat-datepicker #picker />
              <mat-error>{{ dateModel.errors | errorMessage }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Amount (INR)</mat-label>
              <input matInput type="number" [(ngModel)]="amount" name="amount" required min="1" #amountModel="ngModel" />
              <mat-error>{{ amountModel.errors | errorMessage }}</mat-error>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Person Name</mat-label>
              <input matInput [(ngModel)]="personName" name="personName" required #personNameModel="ngModel" />
              <mat-error>{{ personNameModel.errors | errorMessage }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Segment (optional)</mat-label>
              <mat-select [(ngModel)]="segment" name="segment">
                <mat-option value="">Personal (No segment)</mat-option>
                @for (seg of segments(); track seg.id) {
                  <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Purpose / Reason</mat-label>
            <input matInput [(ngModel)]="purpose" name="purpose" required placeholder="e.g. Personal need, Goat feed" #purposeModel="ngModel" />
            <mat-error>{{ purposeModel.errors | errorMessage }}</mat-error>
          </mat-form-field>
        }

        <!-- ===== FORMAL LOAN FIELDS ===== -->
        @if (loanCategory === 'formal') {
          <!-- Basic Info -->
          <h3 class="section-title">Basic Info
            <mat-icon class="info-icon" matTooltip="Enter the lender details, loan account number, and the total sanctioned amount">info</mat-icon>
          </h3>
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Loan Source</mat-label>
              <mat-select [(ngModel)]="loanSource" name="loanSource" required (ngModelChange)="onSourceChange()" #loanSourceModel="ngModel">
                <mat-option value="bank">Bank</mat-option>
                <mat-option value="finance_company">Finance Company</mat-option>
                <mat-option value="individual">Individual Lender</mat-option>
                <mat-option value="gold_loan">Gold Loan</mat-option>
              </mat-select>
              <mat-error>{{ loanSourceModel.errors | errorMessage }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ loanSource === 'individual' ? 'Lender Name' : 'Source Name' }}</mat-label>
              <input matInput [(ngModel)]="loanSourceName" name="loanSourceName" required placeholder="e.g. SBI, Muthoot Finance" #loanSourceNameModel="ngModel" />
              <mat-error>{{ loanSourceNameModel.errors | errorMessage }}</mat-error>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Account / Loan Number</mat-label>
              <input matInput [(ngModel)]="accountNumber" name="accountNumber" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Lender / Borrower Name</mat-label>
              <input matInput [(ngModel)]="personName" name="formalPersonName" required #formalPersonModel="ngModel" />
              <mat-error>{{ formalPersonModel.errors | errorMessage }}</mat-error>
            </mat-form-field>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Sanctioned Amount (INR)</mat-label>
              <input matInput type="number" [(ngModel)]="sanctionedAmount" name="sanctionedAmount" required min="1"
                (ngModelChange)="recalculate()" #sanctionedModel="ngModel" />
              <mat-icon matSuffix class="info-icon" matTooltip="Total loan amount approved by the lender. e.g. Bank sanctions Rs.5,00,000">info</mat-icon>
              <mat-error>{{ sanctionedModel.errors | errorMessage }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Disbursement Date</mat-label>
              <input matInput [matDatepicker]="disPicker" [(ngModel)]="disbursementDate" name="disbursementDate" required #disbursementModel="ngModel" />
              <mat-datepicker-toggle matIconSuffix [for]="disPicker" />
              <mat-datepicker #disPicker />
              <mat-error>{{ disbursementModel.errors | errorMessage }}</mat-error>
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Purpose / Reason</mat-label>
            <input matInput [(ngModel)]="purpose" name="formalPurpose" required placeholder="e.g. Farm expansion, Working capital" #formalPurposeModel="ngModel" />
            <mat-error>{{ formalPurposeModel.errors | errorMessage }}</mat-error>
          </mat-form-field>

          <!-- Held By -->
          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Loan Amount Held By
              </mat-label>
              <mat-icon matPrefix class="info-icon" matTooltip="Who physically received and manages the loan money? e.g. Ramesh holds the SBI loan funds in his account">info</mat-icon>
              <mat-select [(ngModel)]="heldByUid" name="heldByUid" (ngModelChange)="onHeldByChange()">
                <mat-option value="">Not assigned</mat-option>
                @for (u of activeUsers(); track u.uid) {
                  <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          <!-- Segments (multi-select) -->
          <div class="form-row">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Segments</mat-label>
              <mat-icon matPrefix class="info-icon" matTooltip="Which business areas will use this loan? Select multiple if the loan funds will be used across segments. e.g. Goats + Chickens">info</mat-icon>
              <mat-select [(ngModel)]="selectedSegments" name="selectedSegments" multiple>
                @for (seg of segments(); track seg.id) {
                  <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>

          @if (isFormalEdit()) {
            <div class="computed-info">Financial details are locked after creation. Use the loan detail page to manage deductions, rate changes, collateral, etc.</div>
          }

          <!-- Repayment Structure -->
          @if (!isFormalEdit()) {
          <h3 class="section-title">Repayment Structure
            <mat-icon class="info-icon" matTooltip="EMI: Fixed monthly payment (principal + interest) for banks. Interest Only: Pay only interest periodically, close principal at once — common for local lenders">info</mat-icon>
          </h3>
          <div class="form-row">
            <mat-radio-group [(ngModel)]="repaymentType" name="repaymentType">
              <mat-radio-button value="emi">EMI (Fixed monthly payment)</mat-radio-button>
              <mat-radio-button value="interest_only">Interest Only (Pay interest periodically, close principal at once)</mat-radio-button>
            </mat-radio-group>
          </div>

          <!-- Interest -->
          <h3 class="section-title">Interest
            <mat-icon class="info-icon" matTooltip="Fixed: rate stays same throughout. Floating: rate can change based on RBI/market. Enter rate in your preferred frequency — we auto-convert to annual">info</mat-icon>
          </h3>
          <div class="form-row">
            <mat-radio-group [(ngModel)]="interestType" name="interestType">
              <mat-radio-button value="fixed">Fixed Rate</mat-radio-button>
              <mat-radio-button value="floating">Floating Rate</mat-radio-button>
            </mat-radio-group>
          </div>

          <div class="form-row">
            <mat-form-field appearance="outline">
              <mat-label>Rate Frequency</mat-label>
              <mat-select [(ngModel)]="interestFrequency" name="interestFrequency" (ngModelChange)="recalculate()">
                <mat-option value="annual">Annual (% p.a.)</mat-option>
                <mat-option value="monthly">Monthly (% per month)</mat-option>
                <mat-option value="weekly">Weekly (% per week)</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Interest Rate ({{ frequencyLabel() }})</mat-label>
              <input matInput type="number" [(ngModel)]="interestRateInput" name="interestRateInput" required min="0" step="0.01"
                (ngModelChange)="recalculate()" #rateModel="ngModel" />
              <mat-error>{{ rateModel.errors | errorMessage }}</mat-error>
            </mat-form-field>
          </div>

          @if (interestFrequency() !== 'annual' && interestRateInput > 0) {
            <div class="computed-info">= {{ computedAnnualRate() | number:'1.2-2' }}% p.a.</div>
          }

          <div class="form-row">
            <mat-slide-toggle [(ngModel)]="isSubsidized" name="isSubsidized" (ngModelChange)="recalculate()">
              Government Subsidized
              <mat-icon class="info-icon" matTooltip="e.g. Kisan Credit Card (KCC) at 4% instead of 10%. The government pays the interest difference.">info</mat-icon>
            </mat-slide-toggle>
          </div>

          @if (isSubsidized) {
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Subsidy Details</mat-label>
                <input matInput [(ngModel)]="subsidyDetails" name="subsidyDetails" placeholder="e.g. KCC - 4% interest subvention" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Effective Rate (% p.a.)</mat-label>
                <input matInput type="number" [(ngModel)]="effectiveRate" name="effectiveRate" min="0" step="0.01"
                  (ngModelChange)="recalculate()" />
              </mat-form-field>
            </div>
          }

          <!-- EMI mode fields -->
          @if (repaymentType === 'emi') {
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Tenure (months)</mat-label>
                <input matInput type="number" [(ngModel)]="tenure" name="tenure" required min="1"
                  (ngModelChange)="recalculate()" #tenureModel="ngModel" />
                <mat-error>{{ tenureModel.errors | errorMessage }}</mat-error>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Moratorium (months)</mat-label>
                <input matInput type="number" [(ngModel)]="moratoriumMonths" name="moratoriumMonths" min="0" />
                <mat-icon matSuffix class="info-icon" matTooltip="Grace period before EMIs start. e.g. 3 months moratorium means first EMI is in month 4. Interest accrues during moratorium.">info</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>EMI Amount (auto-calculated)</mat-label>
                <input matInput type="number" [(ngModel)]="emiAmount" name="emiAmount" min="0" step="1" />
              </mat-form-field>
            </div>

            @if (computedEMI() > 0) {
              <div class="computed-info">Calculated EMI: {{ computedEMI() | currencyInr }}</div>
            }

            @if (showEMIPreview()) {
              <div class="emi-preview">
                <h4>EMI Preview (first 6 months)</h4>
                <div class="table-container">
                  <table class="data-table">
                    <tr><th>#</th><th>Due Date</th><th>EMI</th><th>Principal</th><th>Interest</th></tr>
                    @for (entry of emiPreview(); track entry.emiNumber) {
                      <tr>
                        <td>{{ entry.emiNumber }}</td>
                        <td>{{ entry.dueDate | date:'MMM yyyy' }}</td>
                        <td>{{ entry.emiAmount | currencyInr }}</td>
                        <td>{{ entry.principal | currencyInr }}</td>
                        <td>{{ entry.interest | currencyInr }}</td>
                      </tr>
                    }
                  </table>
                </div>
              </div>
            }
          }

          <!-- Interest-only mode fields -->
          @if (repaymentType === 'interest_only') {
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Interest Payment Frequency</mat-label>
                <mat-select [(ngModel)]="interestPaymentFrequency" name="interestPaymentFrequency"
                  (ngModelChange)="recalculate()">
                  <mat-option value="monthly">Monthly</mat-option>
                  <mat-option value="weekly">Weekly</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
            @if (computedInterestPerPeriod() > 0) {
              <div class="computed-info">
                You'll pay {{ computedInterestPerPeriod() | currencyInr }} per {{ interestPaymentFrequency === 'weekly' ? 'week' : 'month' }} as interest.
                Principal {{ sanctionedAmount | currencyInr }} to be paid when ready.
              </div>
            }
          }

          <!-- Deductions -->
          <h3 class="section-title">
            Deductions
            <mat-icon class="info-icon" matTooltip="Charges deducted before you receive the money. Financed = deducted from loan amount. Not financed = you paid separately. e.g. Processing fee Rs.5,000 deducted from Rs.5L loan, you receive Rs.4,95,000">info</mat-icon>
            <button mat-icon-button type="button" (click)="addDeductionRow()"><mat-icon>add_circle</mat-icon></button>
          </h3>
          @for (ded of deductions; track $index) {
            <div class="deduction-row">
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Type</mat-label>
                  <mat-select [(ngModel)]="ded.type" [name]="'dedType' + $index">
                    <mat-option value="documentation_charges">Documentation</mat-option>
                    <mat-option value="processing_fee">Processing Fee</mat-option>
                    <mat-option value="insurance">Insurance</mat-option>
                    <mat-option value="legal_charges">Legal</mat-option>
                    <mat-option value="valuation_charges">Valuation</mat-option>
                    <mat-option value="stamp_duty">Stamp Duty</mat-option>
                    <mat-option value="other">Other</mat-option>
                  </mat-select>
                </mat-form-field>
                @if (ded.type === 'other') {
                  <mat-form-field appearance="outline">
                    <mat-label>Label</mat-label>
                    <input matInput [(ngModel)]="ded.customLabel" [name]="'dedLabel' + $index" />
                  </mat-form-field>
                }
                <mat-form-field appearance="outline">
                  <mat-label>Amount</mat-label>
                  <input matInput type="number" [(ngModel)]="ded.amount" [name]="'dedAmt' + $index" min="0"
                    (ngModelChange)="recalculate()" />
                </mat-form-field>
              </div>
              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Paid To</mat-label>
                  <input matInput [(ngModel)]="ded.paidTo" [name]="'dedPaid' + $index" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Reference</mat-label>
                  <input matInput [(ngModel)]="ded.paymentReference" [name]="'dedRef' + $index" />
                </mat-form-field>
                <mat-slide-toggle [(ngModel)]="ded.isFinanced" [name]="'dedFin' + $index"
                  (ngModelChange)="recalculate()">Financed</mat-slide-toggle>
                <button mat-icon-button type="button" color="warn" (click)="removeDeductionRow($index)">
                  <mat-icon>remove_circle</mat-icon>
                </button>
              </div>
            </div>
          }
          @if (deductions.length > 0) {
            <div class="computed-info highlight">
              Total Deductions: {{ totalDeductionsAmount() | currencyInr }}
              &nbsp;|&nbsp; Net Amount You'll Receive: {{ netDisbursedAmount() | currencyInr }}
            </div>
          }

          <!-- Gold Loan: Rate & LTV (before collateral items) -->
          @if (loanSource === 'gold_loan') {
            <h3 class="section-title">Gold Valuation
              <mat-icon class="info-icon" matTooltip="Enter the gold rate per gram (24K pure gold rate). LTV ratio is set by RBI: up to Rs.2.5L→85%, Rs.2.5L-5L→80%, above Rs.5L→75%. You can override if your lender uses a different ratio.">info</mat-icon>
            </h3>
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Pledge Receipt Number</mat-label>
                <input matInput [(ngModel)]="pledgeReceiptNumber" name="pledgeReceipt" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Gold Rate per Gram (₹)</mat-label>
                <input matInput type="number" [(ngModel)]="globalGoldRate" name="goldRate" min="0"
                  (ngModelChange)="onGlobalGoldRateChange()" />
                <mat-icon matSuffix class="info-icon" matTooltip="Enter today's pure gold (24K) rate per gram. e.g. Rs.14,662. This auto-fills all gold items. You can override per item.">info</mat-icon>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>LTV Ratio</mat-label>
                <mat-select [(ngModel)]="ltvRatio" name="ltvRatio" (ngModelChange)="goldTrigger.update(v => v + 1)">
                  <mat-option [value]="null">Auto (RBI Tier)</mat-option>
                  <mat-option [value]="0.85">85% (up to Rs.2.5L)</mat-option>
                  <mat-option [value]="0.80">80% (Rs.2.5L - 5L)</mat-option>
                  <mat-option [value]="0.75">75% (above Rs.5L)</mat-option>
                </mat-select>
              </mat-form-field>
            </div>
          }

          <!-- Collateral -->
          <h3 class="section-title">
            {{ loanSource === 'gold_loan' ? 'Gold Items' : 'Collateral / Security' }}
            <mat-icon class="info-icon" matTooltip="{{loanSource === 'gold_loan' ? 'List each gold item separately. Enter gross weight, deduct stones/making to get net weight. Gold value is auto-calculated from net weight × purity × rate.' : 'What you pledged against the loan. e.g. Gold chain, Farm land, Fixed Deposit.'}}">info</mat-icon>
            <button mat-icon-button type="button" (click)="addCollateralRow()"><mat-icon>add_circle</mat-icon></button>
          </h3>
          @for (col of collaterals; track $index) {
            <div class="collateral-row">
              @if (loanSource === 'gold_loan' && col.type === 'gold') {
                <!-- Enhanced gold item row -->
                <div class="form-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Item Name</mat-label>
                    <input matInput [(ngModel)]="col.itemName" [name]="'colItem' + $index" placeholder="e.g. Chain, Bangle, Ring" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Qty</mat-label>
                    <input matInput type="number" [(ngModel)]="col.quantity" [name]="'colQty' + $index" min="1" class="qty-input" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Purity</mat-label>
                    <mat-select [(ngModel)]="col.purity" [name]="'colPur' + $index" (ngModelChange)="recalculateGold()">
                      <mat-option value="24K">24K</mat-option>
                      <mat-option value="22K">22K</mat-option>
                      <mat-option value="18K">18K</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <button mat-icon-button type="button" color="warn" (click)="removeCollateralRow($index); recalculateGold()">
                    <mat-icon>remove_circle</mat-icon>
                  </button>
                </div>
                <div class="form-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Gross Weight (g)</mat-label>
                    <input matInput type="number" [(ngModel)]="col.grossWeight" [name]="'colGross' + $index" min="0" step="0.1"
                      (ngModelChange)="recalculateGold()" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Net Weight (g)</mat-label>
                    <input matInput type="number" [(ngModel)]="col.netWeight" [name]="'colNet' + $index" min="0" step="0.1"
                      (ngModelChange)="recalculateGold()" />
                    <mat-icon matSuffix class="info-icon" matTooltip="Weight after deducting stones, clasps, and making. This is what the lender values.">info</mat-icon>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Rate/g (₹)</mat-label>
                    <input matInput type="number" [(ngModel)]="col.goldRatePerGram" [name]="'colRate' + $index" min="0"
                      (ngModelChange)="recalculateGold()" />
                  </mat-form-field>
                </div>
                @if (col.goldValue) {
                  <div class="computed-info">Value: {{ col.goldValue | currencyInr }} ({{ col.netWeight ?? col.grossWeight }}g × {{ col.purity }})</div>
                }
              } @else {
                <!-- Generic collateral row (non-gold or non-gold-loan) -->
                <div class="form-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Type</mat-label>
                    <mat-select [(ngModel)]="col.type" [name]="'colType' + $index">
                      <mat-option value="gold">Gold</mat-option>
                      <mat-option value="property">Property</mat-option>
                      <mat-option value="vehicle">Vehicle</mat-option>
                      <mat-option value="fixed_deposit">Fixed Deposit</mat-option>
                      <mat-option value="other">Other</mat-option>
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Description</mat-label>
                    <input matInput [(ngModel)]="col.description" [name]="'colDesc' + $index" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Estimated Value</mat-label>
                    <input matInput type="number" [(ngModel)]="col.estimatedValue" [name]="'colVal' + $index" min="0" />
                  </mat-form-field>
                </div>
                @if (col.type === 'gold') {
                  <div class="form-row">
                    <mat-form-field appearance="outline">
                      <mat-label>Weight (grams)</mat-label>
                      <input matInput type="number" [(ngModel)]="col.weight" [name]="'colWt' + $index" min="0" step="0.1" />
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Purity</mat-label>
                      <mat-select [(ngModel)]="col.purity" [name]="'colPur' + $index">
                        <mat-option value="24K">24K</mat-option>
                        <mat-option value="22K">22K</mat-option>
                        <mat-option value="18K">18K</mat-option>
                      </mat-select>
                    </mat-form-field>
                  </div>
                }
                <div class="form-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Document Reference</mat-label>
                    <input matInput [(ngModel)]="col.documentReference" [name]="'colRef' + $index" />
                  </mat-form-field>
                  <button mat-icon-button type="button" color="warn" (click)="removeCollateralRow($index)">
                    <mat-icon>remove_circle</mat-icon>
                  </button>
                </div>
              }
            </div>
          }

          <!-- Gold summary -->
          @if (loanSource === 'gold_loan' && totalGoldValue() > 0) {
            <div class="computed-info highlight">
              Total Gold: {{ totalGoldWeight() | number:'1.1-1' }}g
              &nbsp;|&nbsp; Value: {{ totalGoldValue() | currencyInr }}
              &nbsp;|&nbsp; LTV: {{ (effectiveLtv() * 100) | number:'1.0-0' }}%
              &nbsp;|&nbsp; Eligible: {{ eligibleAmount() | currencyInr }}
              @if (sanctionedAmount > eligibleAmount()) {
                <span class="u-text-danger"> (Sanctioned exceeds eligible!)</span>
              }
            </div>
          }

          <!-- Documents -->
          <h3 class="section-title">
            Documents / References
            <mat-icon class="info-icon" matTooltip="Store reference numbers of loan documents. e.g. Sanction letter number, Agreement ID, Insurance policy number, NOC reference">info</mat-icon>
            <button mat-icon-button type="button" (click)="addDocRow()"><mat-icon>add_circle</mat-icon></button>
          </h3>
          @for (d of loanDocs; track $index) {
            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Type</mat-label>
                <mat-select [(ngModel)]="d.type" [name]="'docType' + $index">
                  <mat-option value="sanction_letter">Sanction Letter</mat-option>
                  <mat-option value="agreement">Agreement</mat-option>
                  <mat-option value="insurance_policy">Insurance Policy</mat-option>
                  <mat-option value="noc">NOC</mat-option>
                  <mat-option value="other">Other</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Reference Number</mat-label>
                <input matInput [(ngModel)]="d.referenceNumber" [name]="'docRef' + $index" />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Note</mat-label>
                <input matInput [(ngModel)]="d.note" [name]="'docNote' + $index" />
              </mat-form-field>
              <button mat-icon-button type="button" color="warn" (click)="removeDocRow($index)">
                <mat-icon>remove_circle</mat-icon>
              </button>
            </div>
          }
          } <!-- end @if (!isFormalEdit()) -->
        }

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: var(--color-text); }
    .form-card { max-width: 800px; padding: 1.5rem; margin: 0 auto; }
    .form-row { margin-bottom: 0.5rem; align-items: center; }
    .form-actions { margin-top: 1.5rem; }
    .qty-input { max-width: 80px; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; color: var(--color-text); display: flex; align-items: center; gap: 4px; }
    .computed-info { font-size: 0.875rem; color: var(--color-primary); margin-bottom: 1rem; padding: 8px 12px; background: var(--color-primary-light); border-radius: 6px; }
    .computed-info.highlight { color: var(--color-income); background: var(--color-income-bg); font-weight: 600; }
    .info-icon { font-size: 16px; width: 16px; height: 16px; color: var(--color-text-muted); cursor: help; vertical-align: middle; margin-left: 4px; }
    .field-hint { font-size: 0.7rem; color: var(--color-text-muted); margin-top: -8px; margin-bottom: 8px; padding-left: 4px; }
    .deduction-row, .collateral-row { border-left: 3px solid var(--color-border); padding-left: 12px; margin-bottom: 0.75rem; }
    mat-radio-group { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
    mat-slide-toggle { margin-bottom: 0.5rem; }
    .emi-preview { margin-bottom: 1rem; }
    .emi-preview h4 { margin: 0 0 0.5rem; font-size: 0.875rem; color: var(--color-text-secondary); }
    @media (max-width: 640px) {
      .form-card { padding: 1rem; max-width: 100%; }
      mat-radio-group { flex-direction: column; gap: 0.5rem; }
      .deduction-row, .collateral-row { padding-left: 8px; }
      .deduction-row .form-row, .collateral-row .form-row { gap: 0; }
      mat-slide-toggle { font-size: 0.85rem; }
      .section-title { font-size: 0.9rem; flex-wrap: wrap; }
      .computed-info { font-size: 0.8rem; padding: 6px 10px; }
    }
  `],
})
export class LoanFormComponent implements OnInit, HasUnsavedChanges {
  private loanService = inject(LoanService);
  private authService = inject(AuthService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  isEdit = signal(false);
  isFormalEdit = signal(false);
  error = signal('');
  saving = signal(false);
  private saved = false;
  segments = signal<Segment[]>([]);

  // Common
  type: 'given' | 'received' = 'received';
  personName = '';
  purpose = '';
  segment = '';
  date = new Date();
  amount = 0;
  private editId = '';

  // Category
  loanCategory: LoanCategory = 'simple';

  // Formal loan fields
  loanSource: LoanSource = 'bank';
  loanSourceName = '';
  accountNumber = '';
  sanctionedAmount = 0;
  disbursementDate = new Date();
  selectedSegments: string[] = [];
  heldByUid = '';
  heldByName = '';
  activeUsers = signal<{ uid: string; displayName: string }[]>([]);

  // Gold loan
  globalGoldRate = 0;
  pledgeReceiptNumber = '';
  ltvRatio: number | null = null;
  goldTrigger = signal(0);

  // Repayment
  repaymentType: RepaymentType = 'emi';
  interestType: InterestType = 'fixed';
  // Signal: read by the frequencyLabel computed(), which would never
  // recompute if this stayed a plain field.
  interestFrequency = signal<InterestFrequency>('annual');
  interestRateInput = 0;
  isSubsidized = false;
  subsidyDetails = '';
  effectiveRate = 0;

  // EMI mode
  tenure = 0;
  moratoriumMonths = 0;
  emiAmount: number | null = null;

  // Interest-only mode
  interestPaymentFrequency: InterestFrequency = 'monthly';

  // Dynamic rows
  deductions: DeductionRow[] = [];
  collaterals: CollateralRow[] = [];
  loanDocs: DocRow[] = [];

  // Computed values
  frequencyLabel = computed(() => {
    switch (this.interestFrequency()) {
      case 'monthly': return '% per month';
      case 'weekly': return '% per week';
      default: return '% p.a.';
    }
  });

  computedAnnualRate = signal(0);
  computedEMI = signal(0);
  computedInterestPerPeriod = signal(0);
  showEMIPreview = signal(false);
  emiPreview = signal<EMIEntry[]>([]);
  totalDeductionsAmount = signal(0);
  netDisbursedAmount = signal(0);

  // Gold computed
  totalGoldWeight = computed(() => {
    this.goldTrigger(); // force re-eval
    return this.collaterals.filter(c => c.type === 'gold').reduce((sum, c) => sum + (c.netWeight ?? c.grossWeight ?? 0), 0);
  });
  totalGoldValue = computed(() => {
    this.goldTrigger();
    return this.collaterals.filter(c => c.type === 'gold').reduce((sum, c) => sum + (c.goldValue ?? 0), 0);
  });
  effectiveLtv = computed(() => {
    const tv = this.totalGoldValue();
    if (tv <= 0) return 0;
    return this.ltvRatio ?? this.loanService.rbiLtvRatio(tv);
  });
  eligibleAmount = computed(() => {
    const tv = this.totalGoldValue();
    if (tv <= 0) return 0;
    return Math.round(tv * this.effectiveLtv());
  });

  async ngOnInit(): Promise<void> {
    try {
      await this.loadFormData();
    } catch (err) {
      console.error('Failed to load loan form data', err);
      this.toast.error('Failed to load data. Check your connection and try again.');
    } finally {
      // Form model fields are plain properties populated after awaits; with
      // OnPush we must explicitly mark the view for check once loaded.
      this.cdr.markForCheck();
    }
  }

  private async loadFormData(): Promise<void> {
    const segs = await this.segmentService.getAll();
    const accessible = this.authService.isAdmin()
      ? segs
      : segs.filter((s) => this.authService.assignedSegments().includes(s.id));
    this.segments.set(accessible);

    // Load active users for "Held By" dropdown
    const users = await this.userService.getAll();
    this.activeUsers.set(users.filter(u => u.isActive).map(u => ({ uid: u.uid, displayName: u.displayName })));

    // Check for balance transfer mode
    const transferFrom = this.route.snapshot.queryParams['transferFrom'];
    if (transferFrom) {
      const oldLoan = await this.loanService.getById(transferFrom);
      if (oldLoan) {
        this.loanCategory = 'formal';
        this.type = 'received';
        this.purpose = `Balance transfer from ${oldLoan.loanSourceName ?? oldLoan.personName}`;
      }
    }

    this.editId = this.route.snapshot.params['id'];
    if (this.editId) {
      this.isEdit.set(true);
      const loan = await this.loanService.getById(this.editId);
      if (!loan) { this.router.navigate(['/loans']); return; }

      if (loan.loanCategory === 'formal') {
        this.isFormalEdit.set(true);
        this.loanCategory = 'formal';
        this.personName = loan.personName;
        this.purpose = loan.purpose;
        this.loanSourceName = loan.loanSourceName ?? '';
        this.accountNumber = loan.accountNumber ?? '';
      } else {
        if (loan.repaymentStatus !== 'pending') {
          this.router.navigate(['/loans', this.editId]);
          return;
        }
        this.type = loan.type;
        this.date = loan.date.toDate();
        this.amount = loan.amount;
        this.personName = loan.personName;
        this.segment = loan.segment;
        this.purpose = loan.purpose;
      }
    }
  }

  onCategoryChange(): void {
    if (this.loanCategory === 'formal') {
      this.type = 'received';
      this.repaymentType = (this.loanSource === 'individual' || this.loanSource === 'gold_loan') ? 'interest_only' : 'emi';
      this.interestFrequency.set((this.loanSource === 'individual' || this.loanSource === 'gold_loan') ? 'monthly' : 'annual');
    }
  }

  recalculateGold(): void {
    for (const col of this.collaterals) {
      if (col.type !== 'gold') continue;
      const rate = col.goldRatePerGram ?? this.globalGoldRate;
      const nw = col.netWeight ?? col.grossWeight ?? col.weight ?? 0;
      if (nw > 0 && rate > 0) {
        col.goldValue = this.loanService.computeGoldValue(nw, col.purity, rate);
        col.estimatedValue = col.goldValue;
      } else {
        col.goldValue = null;
      }
    }
    this.goldTrigger.update(v => v + 1);
    this.recalculate();
  }

  onGlobalGoldRateChange(): void {
    for (const col of this.collaterals) {
      if (col.type === 'gold' && !col.goldRatePerGram) {
        col.goldRatePerGram = this.globalGoldRate;
      }
    }
    this.recalculateGold();
  }

  onHeldByChange(): void {
    const user = this.activeUsers().find(u => u.uid === this.heldByUid);
    this.heldByName = user?.displayName ?? '';
  }

  onSourceChange(): void {
    const isLocal = this.loanSource === 'individual' || this.loanSource === 'gold_loan';
    this.repaymentType = isLocal ? 'interest_only' : 'emi';
    this.interestFrequency.set(isLocal ? 'monthly' : 'annual');
    this.recalculate();
  }

  recalculate(): void {
    const annualRate = this.loanService.toAnnualRate(this.interestRateInput, this.interestFrequency());
    this.computedAnnualRate.set(annualRate);

    const rateForCalc = this.isSubsidized && this.effectiveRate > 0 ? this.effectiveRate : annualRate;

    // Total deductions
    const totalDed = this.deductions.reduce((s, d) => s + (d.amount || 0), 0);
    this.totalDeductionsAmount.set(totalDed);
    const financedDed = this.deductions.filter(d => d.isFinanced).reduce((s, d) => s + (d.amount || 0), 0);
    this.netDisbursedAmount.set(this.sanctionedAmount - financedDed);

    // EMI calculation
    if (this.repaymentType === 'emi' && this.sanctionedAmount > 0 && this.tenure > 0) {
      const r = rateForCalc / 100 / 12;
      let emi: number;
      if (r > 0) {
        const rPowN = Math.pow(1 + r, this.tenure);
        emi = Math.round((this.sanctionedAmount * r * rPowN / (rPowN - 1)) * 100) / 100;
      } else {
        emi = Math.round((this.sanctionedAmount / this.tenure) * 100) / 100;
      }
      this.computedEMI.set(emi);
      if (!this.emiAmount) this.emiAmount = emi;

      // Preview
      const schedule = this.loanService.generateEMISchedule(
        this.sanctionedAmount, annualRate, this.tenure,
        this.disbursementDate, this.moratoriumMonths,
        this.isSubsidized ? this.effectiveRate : undefined,
      );
      const previewCount = Math.min(6, schedule.length);
      this.emiPreview.set(schedule.slice(0, previewCount));
      this.showEMIPreview.set(previewCount > 0);
    } else {
      this.computedEMI.set(0);
      this.showEMIPreview.set(false);
    }

    // Interest-only calculation
    if (this.repaymentType === 'interest_only' && this.sanctionedAmount > 0 && this.interestRateInput > 0) {
      const freq = this.interestPaymentFrequency ?? this.interestFrequency();
      const ratePerPeriod = freq === 'weekly'
        ? annualRate / 52 / 100
        : annualRate / 12 / 100;
      this.computedInterestPerPeriod.set(Math.round(this.sanctionedAmount * ratePerPeriod * 100) / 100);
    } else {
      this.computedInterestPerPeriod.set(0);
    }
  }

  // Dynamic row management
  addDeductionRow(): void {
    this.deductions.push({
      type: 'processing_fee', customLabel: '', amount: 0, paidTo: '',
      date: new Date(), paymentReference: '', isFinanced: true, note: '',
    });
  }
  removeDeductionRow(i: number): void { this.deductions.splice(i, 1); this.recalculate(); }

  addCollateralRow(): void {
    this.collaterals.push({
      type: 'gold', description: '', estimatedValue: 0,
      weight: null, purity: '22K', documentReference: '', note: '',
      itemName: '', quantity: 1, grossWeight: null, netWeight: null,
      goldRatePerGram: this.globalGoldRate || null, goldValue: null,
    });
  }
  removeCollateralRow(i: number): void { this.collaterals.splice(i, 1); }

  addDocRow(): void {
    this.loanDocs.push({ type: 'sanction_letter', customLabel: '', referenceNumber: '', date: null, note: '' });
  }
  removeDocRow(i: number): void { this.loanDocs.splice(i, 1); }

  async save(): Promise<void> {
    this.error.set('');
    this.saving.set(true);
    try {
      if (this.loanCategory === 'formal') {
        await this.saveFormalLoan();
      } else {
        await this.saveSimpleLoan();
      }
      this.toast.success(this.isEdit() ? 'Loan updated' : 'Loan created');
      this.saved = true;
      this.router.navigate(['/loans']);
    } catch (err) {
      console.error('Failed to save loan', err);
      const message = err instanceof Error ? err.message : 'Failed to save loan';
      this.error.set(message);
      this.toast.error(message);
    } finally {
      this.saving.set(false);
    }
  }

  private async saveSimpleLoan(): Promise<void> {
    const seg = this.segment ? this.segments().find((s) => s.id === this.segment) : null;
    const data: LoanFormData = {
      date: this.date,
      amount: this.amount,
      type: this.type,
      personName: this.personName,
      purpose: this.purpose,
      segment: this.segment || 'personal',
      segmentName: seg?.name || 'Personal',
      month: getMonthString(this.date),
      year: getYear(this.date),
    };
    if (this.isEdit()) {
      await this.loanService.update(this.editId, data);
    } else {
      await this.loanService.create(data);
    }
  }

  private async saveFormalLoan(): Promise<void> {
    // For edit mode, only update cosmetic fields
    if (this.isEdit()) {
      const seg = this.selectedSegments.length > 0
        ? this.segments().find(s => s.id === this.selectedSegments[0])
        : null;
      await this.loanService.update(this.editId, {
        date: this.disbursementDate,
        amount: this.sanctionedAmount,
        type: this.type,
        personName: this.personName,
        purpose: this.purpose,
        segment: this.selectedSegments[0] || 'personal',
        segmentName: seg?.name || 'Personal',
        month: getMonthString(this.disbursementDate),
        year: getYear(this.disbursementDate),
        loanCategory: 'formal',
        loanSourceName: this.loanSourceName,
        accountNumber: this.accountNumber,
      });
      return;
    }

    // Create
    const annualRate = this.loanService.toAnnualRate(this.interestRateInput, this.interestFrequency());
    const primarySeg = this.selectedSegments[0] || 'personal';
    const primarySegObj = this.segments().find(s => s.id === primarySeg);

    const data: LoanFormData = {
      date: this.disbursementDate,
      amount: this.sanctionedAmount,
      type: this.type,
      personName: this.personName,
      purpose: this.purpose,
      segment: primarySeg,
      segmentName: primarySegObj?.name || 'Personal',
      month: getMonthString(this.disbursementDate),
      year: getYear(this.disbursementDate),
      loanCategory: 'formal',
      loanSource: this.loanSource,
      loanSourceName: this.loanSourceName,
      accountNumber: this.accountNumber,
      sanctionedAmount: this.sanctionedAmount,
      repaymentType: this.repaymentType,
      interestType: this.interestType,
      interestFrequency: this.interestFrequency(),
      interestRateInput: this.interestRateInput,
      interestRate: annualRate,
      tenure: this.repaymentType === 'emi' ? this.tenure : undefined,
      emiAmount: this.repaymentType === 'emi' ? (this.emiAmount ?? undefined) : undefined,
      totalEMIs: this.repaymentType === 'emi' ? this.tenure : undefined,
      moratoriumMonths: this.repaymentType === 'emi' ? this.moratoriumMonths : undefined,
      interestPaymentFrequency: this.repaymentType === 'interest_only' ? this.interestPaymentFrequency : undefined,
      disbursementDate: this.disbursementDate,
      segments: this.selectedSegments.length > 0 ? this.selectedSegments : [primarySeg],
      segmentNames: this.selectedSegments.length > 0
        ? this.selectedSegments.map(id => this.segments().find(s => s.id === id)?.name ?? id)
        : [primarySegObj?.name || 'Personal'],
      deductions: this.deductions.filter(d => d.amount > 0).map(d => ({
        type: d.type,
        customLabel: d.type === 'other' ? d.customLabel : undefined,
        amount: d.amount,
        paidTo: d.paidTo,
        date: d.date,
        paymentReference: d.paymentReference || undefined,
        isFinanced: d.isFinanced,
        note: d.note || undefined,
      })) as any[],
      collaterals: this.collaterals.filter(c => c.description || c.itemName).map(c => ({
        type: c.type,
        description: c.description || c.itemName || '',
        estimatedValue: c.estimatedValue,
        weight: c.type === 'gold' ? (c.weight ?? undefined) : undefined,
        purity: c.type === 'gold' ? c.purity : undefined,
        documentReference: c.documentReference || undefined,
        note: c.note || undefined,
        itemName: c.type === 'gold' ? (c.itemName || undefined) : undefined,
        quantity: c.type === 'gold' ? (c.quantity || undefined) : undefined,
        grossWeight: c.type === 'gold' ? (c.grossWeight ?? undefined) : undefined,
        netWeight: c.type === 'gold' ? (c.netWeight ?? undefined) : undefined,
        goldRatePerGram: c.type === 'gold' ? (c.goldRatePerGram ?? undefined) : undefined,
        goldValue: c.type === 'gold' ? (c.goldValue ?? undefined) : undefined,
      })),
      documents: this.loanDocs.filter(d => d.referenceNumber || d.note).map(d => ({
        type: d.type,
        customLabel: d.type === 'other' ? d.customLabel : undefined,
        referenceNumber: d.referenceNumber || undefined,
        date: d.date instanceof Date ? d.date : undefined,
        note: d.note || undefined,
      })) as any[],
      isSubsidized: this.isSubsidized,
      subsidyDetails: this.isSubsidized ? this.subsidyDetails : undefined,
      effectiveRate: this.isSubsidized ? this.effectiveRate : undefined,
      heldByUid: this.heldByUid || undefined,
      heldByName: this.heldByName || undefined,
      pledgeReceiptNumber: this.loanSource === 'gold_loan' ? (this.pledgeReceiptNumber || undefined) : undefined,
      ltvRatio: this.loanSource === 'gold_loan' ? (this.ltvRatio ?? undefined) : undefined,
      replacesLoanId: this.route.snapshot.queryParams['transferFrom'] || undefined,
      renewedFromLoanId: this.route.snapshot.queryParams['renewFrom'] || undefined,
    };

    // Use balance transfer if replacing an old loan
    if (data.replacesLoanId) {
      await this.loanService.balanceTransfer(data.replacesLoanId, data);
    } else {
      await this.loanService.createFormalLoan(data);
    }
  }

  hasUnsavedChanges(): boolean {
    if (this.saved) return false;
    if (this.isEdit()) return true;
    return this.amount > 0 || this.personName.trim() !== '';
  }

  cancel(): void { this.router.navigate(['/loans']); }
}
