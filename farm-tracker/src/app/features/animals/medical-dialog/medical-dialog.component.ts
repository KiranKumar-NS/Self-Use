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
import { Animal, MedicalEntry } from '../../../core/models/animal.model';
import { AppUser } from '../../../core/models/user.model';
import { PaymentMethod, ExpensePaymentStatus } from '../../../core/models/transaction.model';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { normalizeName, nameKey } from '../../../core/utils/name.utils';

export interface MedicalDialogData {
  animal: Animal;
}

@Component({
  selector: 'app-medical-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatAutocompleteModule, MatDatepickerModule,
  ],
  template: `
    <h2 mat-dialog-title>Add Medical Record</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline">
          <mat-label>Type</mat-label>
          <mat-select [(ngModel)]="recordType" required>
            <mat-option value="treatment">Treatment</mat-option>
            <mat-option value="checkup">Checkup</mat-option>
            <mat-option value="surgery">Surgery</mat-option>
            <mat-option value="emergency">Emergency</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Date</mat-label>
          <input matInput [matDatepicker]="datePicker" [(ngModel)]="date" [max]="today" required />
          <mat-datepicker-toggle matSuffix [for]="datePicker" />
          <mat-datepicker #datePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Disease / Condition</mat-label>
          <input matInput [(ngModel)]="disease" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Symptoms</mat-label>
          <input matInput [(ngModel)]="symptoms" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Medicine</mat-label>
          <input matInput [(ngModel)]="medicine" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Dosage</mat-label>
          <input matInput [(ngModel)]="dosage" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Doctor / Vet</mat-label>
          <input matInput [(ngModel)]="doctor" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Temperature (°F)</mat-label>
          <input matInput type="number" [(ngModel)]="temperature" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Weight (kg)</mat-label>
          <input matInput type="number" [(ngModel)]="weight" min="0" />
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
              [disabled]="saving() || !recordType || (!!cost && cost > 0 && paidBy === 'other' && !customPaidByName.trim())"
              (click)="save()">
        {{ saving() ? 'Saving...' : 'Add Record' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .pay-note { margin: 4px 0 12px; font-size: 0.85rem; color: var(--color-text-secondary); }
  `],
})
export class MedicalDialogComponent implements OnInit {
  data = inject<MedicalDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<MedicalDialogComponent>);
  private animalService = inject(AnimalService);
  private transactionService = inject(TransactionService);
  private userService = inject(UserService);
  private authService = inject(AuthService);

  saving = signal(false);
  error = signal('');

  today = new Date();
  recordType: 'treatment' | 'checkup' | 'surgery' | 'emergency' = 'treatment';
  date: Date = new Date();
  disease = '';
  symptoms = '';
  medicine = '';
  dosage = '';
  doctor = '';
  temperature: number | null = null;
  weight: number | null = null;
  cost: number | null = null;
  note = '';

  // Expense (only used when cost > 0)
  users = signal<AppUser[]>([]);
  paymentMethod: PaymentMethod = 'cash';
  expenseStatus: ExpensePaymentStatus = 'paid';
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
      const entry: MedicalEntry = {
        id: crypto.randomUUID(),
        date: Timestamp.fromDate(this.date),
        type: this.recordType,
        ...(this.disease ? { disease: this.disease } : {}),
        ...(this.symptoms ? { symptoms: this.symptoms } : {}),
        ...(this.medicine ? { medicine: this.medicine } : {}),
        ...(this.dosage ? { dosage: this.dosage } : {}),
        ...(this.doctor ? { doctor: this.doctor } : {}),
        ...(this.temperature ? { temperature: this.temperature } : {}),
        ...(this.weight ? { weight: this.weight } : {}),
        ...(this.cost ? { cost: this.cost } : {}),
        ...(this.note ? { note: this.note } : {}),
      };

      // Create a linked Medicine expense and attribute it to this animal's cost
      if (this.cost && this.cost > 0) {
        const isCustom = this.paidBy === 'other';
        const paidByUser = isCustom ? null : this.users().find(u => u.uid === this.paidBy);
        const resolvedPaidBy = isCustom ? 'other' : this.paidBy;
        const resolvedPaidByName = isCustom ? normalizeName(this.customPaidByName) : paidByUser?.displayName;
        const label = this.disease || this.medicine || this.recordType;
        const description = `Medical (${this.recordType}): ${label} — ${this.animalName}`;

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

      await this.animalService.addMedicalRecord(animal.id, entry);
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
