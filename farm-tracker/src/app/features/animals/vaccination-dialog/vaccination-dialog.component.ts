import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Timestamp } from '@angular/fire/firestore';

import { AnimalService } from '../../../core/services/animal.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { Animal, VaccinationEntry } from '../../../core/models/animal.model';
import { AppUser } from '../../../core/models/user.model';
import { PaymentMethod, ExpensePaymentStatus } from '../../../core/models/transaction.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { normalizeName, nameKey } from '../../../core/utils/name.utils';

export interface VaccinationDialogData {
  animal: Animal;
}

@Component({
  selector: 'app-vaccination-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatAutocompleteModule, MatDatepickerModule,
  ],
  template: `
    <h2 mat-dialog-title>Add Vaccination Record</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Vaccine Name</mat-label>
          <input matInput [(ngModel)]="vaccineName" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="datePicker" [(ngModel)]="date" [max]="today" required />
          <mat-datepicker-toggle matSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Dosage</mat-label>
          <input matInput [(ngModel)]="dosage" placeholder="e.g. 2ml" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Administered By</mat-label>
          <input matInput [(ngModel)]="administeredBy" placeholder="Doctor / Vet name" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Batch Number</mat-label>
          <input matInput [(ngModel)]="batchNumber" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Next Due Date</mat-label>
          <input matInput [matDatepicker]="nextDuePicker" [(ngModel)]="nextDueDate" />
          <mat-datepicker-toggle matSuffix [for]="nextDuePicker" />
          <mat-datepicker #nextDuePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Cost (₹)</mat-label>
          <input matInput type="number" [(ngModel)]="cost" min="0" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Note</mat-label>
          <input matInput [(ngModel)]="note" />
        </mat-form-field>
      </div>

      @if (cost && cost > 0) {
        <div class="pay-note">Recorded as a <strong>Medicine</strong> expense for {{ animalName }} and added to its cost.</div>
        <div class="form-grid">
          <div class="form-row">
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
          </div>

          @if (expenseStatus === 'pending') {
            <mat-form-field appearance="outline">
              <mat-label>Expected Payment Date (optional)</mat-label>
              <input matInput [matDatepicker]="expectedPicker" [(ngModel)]="expectedPaymentDate" />
              <mat-datepicker-toggle matSuffix [for]="expectedPicker" />
              <mat-datepicker #expectedPicker />
            </mat-form-field>
          }

          <div class="form-row">
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
          </div>
        </div>
      }

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary"
              [disabled]="saving() || !vaccineName.trim() || (!!cost && cost > 0 && paidBy === 'other' && !customPaidByName.trim())"
              (click)="save()">
        {{ saving() ? 'Saving...' : 'Add Record' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .pay-note { margin: 4px 0 12px; font-size: 0.85rem; color: var(--color-text-secondary); }
  `],
})
export class VaccinationDialogComponent implements OnInit {
  data = inject<VaccinationDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<VaccinationDialogComponent>);
  private animalService = inject(AnimalService);
  private transactionService = inject(TransactionService);
  private userService = inject(UserService);
  private authService = inject(AuthService);

  saving = signal(false);
  error = signal('');

  today = new Date();
  vaccineName = '';
  date: Date = new Date();
  dosage = '';
  administeredBy = '';
  batchNumber = '';
  nextDueDate: Date | null = null;
  cost: number | null = null;
  note = '';

  // Expense (only used when cost > 0)
  users = signal<AppUser[]>([]);
  paymentMethod: PaymentMethod = 'cash';
  expenseStatus: ExpensePaymentStatus = 'paid';
  expectedPaymentDate: Date | null = null;
  paidBy = '';                 // uid | 'other'
  customPaidByName = '';
  nameSuggestions = signal<string[]>([]);
  private knownNames: string[] = [];

  get animalName(): string {
    return this.animalService.getDisplayName(this.data.animal);
  }

  async ngOnInit(): Promise<void> {
    try {
      this.users.set((await this.userService.getAll()).filter((u) => u.isActive));
    } catch (err) {
      console.error('Failed to load users', err);
    }
    this.paidBy = this.authService.currentUser()?.uid || '';

    try {
      const recent = await this.transactionService.getAll({}, 200);
      this.knownNames = [...new Set(
        recent.transactions
          .filter(t => t.paidBy === 'other' && t.paidByName)
          .map(t => t.paidByName!)
      )];
    } catch {}
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

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const animal = this.data.animal;
      const entry: VaccinationEntry = {
        id: crypto.randomUUID(),
        date: Timestamp.fromDate(this.date),
        vaccineName: this.vaccineName,
        ...(this.dosage ? { dosage: this.dosage } : {}),
        ...(this.administeredBy ? { administeredBy: this.administeredBy } : {}),
        ...(this.batchNumber ? { batchNumber: this.batchNumber } : {}),
        ...(this.nextDueDate ? { nextDueDate: Timestamp.fromDate(this.nextDueDate) } : {}),
        ...(this.cost ? { cost: this.cost } : {}),
        ...(this.note ? { note: this.note } : {}),
      };

      // Create a linked Medicine expense and attribute it to this animal's cost
      if (this.cost && this.cost > 0) {
        const isCustom = this.paidBy === 'other';
        const paidByUser = isCustom ? null : this.users().find(u => u.uid === this.paidBy);
        const resolvedPaidBy = isCustom ? 'other' : this.paidBy;
        const resolvedPaidByName = isCustom ? normalizeName(this.customPaidByName) : paidByUser?.displayName;
        const description = `Vaccination: ${this.vaccineName} — ${this.animalName}`;

        const txnId = await this.transactionService.create({
          type: 'expense',
          date: this.date,
          amount: this.cost,
          category: 'medicine',
          categoryName: 'Medicine',
          segment: animal.segment,
          segmentName: animal.segmentName,
          description,
          paymentMethod: this.paymentMethod,
          expensePaymentStatus: this.expenseStatus,
          expectedPaymentDate: this.expenseStatus === 'pending' ? (this.expectedPaymentDate || undefined) : undefined,
          paidBy: resolvedPaidBy,
          paidByName: resolvedPaidByName,
          linkedAnimalIds: [animal.id],
          linkedAnimalNames: [this.animalName],
          month: getMonthString(this.date),
          year: getYear(this.date),
        });

        await this.animalService.attributeCost(
          [animal.id],
          txnId,
          { category: 'medicine', categoryName: 'Medicine', date: this.date, totalAmount: this.cost, description },
          'equal',
        );

        entry.linkedTransactionId = txnId;
      }

      await this.animalService.addVaccination(animal.id, entry);
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
