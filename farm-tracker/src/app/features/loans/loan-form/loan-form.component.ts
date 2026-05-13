import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LoanService } from '../../../core/services/loan.service';
import { AuthService } from '../../../core/services/auth.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { LoanFormData } from '../../../core/models/loan.model';
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
  selector: 'app-loan-form',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatNativeDateModule, MatRadioModule,
  ],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit' : 'Add' }} Owe / Lent Entry</h1>
    </div>

    <mat-card class="form-card">
      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <form (ngSubmit)="save()">
        <div class="form-row">
          <mat-radio-group [(ngModel)]="type" name="type">
            <mat-radio-button value="given">Lent (We gave money)</mat-radio-button>
            <mat-radio-button value="received">Owed (We borrowed money)</mat-radio-button>
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
            <mat-label>Person Name</mat-label>
            <input matInput [(ngModel)]="personName" name="personName" required />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Segment</mat-label>
            <mat-select [(ngModel)]="segment" name="segment" required>
              @for (seg of segments(); track seg.id) {
                <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Purpose</mat-label>
          <textarea matInput [(ngModel)]="purpose" name="purpose" rows="3" required></textarea>
        </mat-form-field>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Entry' }}
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
    mat-radio-group { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
  `],
})
export class LoanFormComponent implements OnInit {
  private loanService = inject(LoanService);
  private authService = inject(AuthService);
  private segmentService = inject(SegmentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  error = signal('');
  saving = signal(false);
  segments = signal<Segment[]>([]);

  type: 'given' | 'received' = 'given';
  date = new Date();
  amount = 0;
  personName = '';
  segment = '';
  purpose = '';
  private editId = '';

  async ngOnInit(): Promise<void> {
    const segs = await this.segmentService.getAll();
    const accessible = this.authService.isAdmin()
      ? segs
      : segs.filter((s) => this.authService.assignedSegments().includes(s.id));
    this.segments.set(accessible);

    this.editId = this.route.snapshot.params['id'];
    if (this.editId) {
      this.isEdit.set(true);
      const loan = await this.loanService.getById(this.editId);
      if (loan) {
        this.type = loan.type;
        this.date = loan.date.toDate();
        this.amount = loan.amount;
        this.personName = loan.personName;
        this.segment = loan.segment;
        this.purpose = loan.purpose;
      }
    }
  }

  async save(): Promise<void> {
    this.error.set('');
    this.saving.set(true);
    try {
      const seg = this.segments().find((s) => s.id === this.segment);
      const data: LoanFormData = {
        date: this.date,
        amount: this.amount,
        type: this.type,
        personName: this.personName,
        purpose: this.purpose,
        segment: this.segment,
        segmentName: seg?.name || this.segment,
        month: getMonthString(this.date),
        year: getYear(this.date),
      };

      if (this.isEdit()) {
        await this.loanService.update(this.editId, data);
      } else {
        await this.loanService.create(data);
      }
      this.router.navigate(['/loans']);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save loan');
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void { this.router.navigate(['/loans']); }
}
