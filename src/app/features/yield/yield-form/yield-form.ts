import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Timestamp } from 'firebase/firestore';
import { YieldService } from '../services/yield.service';
import { GoatService } from '../../goats/services/goat.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Goat } from '../../../core/models';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-yield-form',
  imports: [
    FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="YIELD.LOG_MILK" icon="water_drop" />

    <mat-card>
      <mat-card-content>
        <form (ngSubmit)="onSave()" class="yield-form">
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Goat</mat-label>
              <mat-select [(ngModel)]="form.goatId" name="goatId" required>
                @for (goat of does(); track goat.id) {
                  <mat-option [value]="goat.id">{{ goat.tagNumber }} {{ goat.name ? '- ' + goat.name : '' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'YIELD.DATE' | translate }}</mat-label>
              <input matInput [matDatepicker]="datePicker" [(ngModel)]="form.date" name="date" required />
              <mat-datepicker-toggle matSuffix [for]="datePicker" />
              <mat-datepicker #datePicker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'YIELD.MORNING' | translate }}</mat-label>
              <input matInput type="number" step="0.1" [(ngModel)]="form.morning" name="morning" (ngModelChange)="calcTotal()" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'YIELD.EVENING' | translate }}</mat-label>
              <input matInput type="number" step="0.1" [(ngModel)]="form.evening" name="evening" (ngModelChange)="calcTotal()" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'YIELD.TOTAL' | translate }}</mat-label>
              <input matInput type="number" [ngModel]="form.total" name="total" readonly />
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'GOATS.NOTES' | translate }}</mat-label>
            <textarea matInput [(ngModel)]="form.notes" name="notes" rows="2"></textarea>
          </mat-form-field>

          <div class="form-actions">
            <button mat-button type="button" (click)="router.navigate(['/yield'])">{{ 'COMMON.CANCEL' | translate }}</button>
            <button mat-raised-button color="primary" type="submit" [disabled]="saving()">
              @if (saving()) { <mat-spinner diameter="20"></mat-spinner> }
              @else { {{ 'COMMON.SAVE' | translate }} }
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .yield-form { max-width: 800px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0 16px; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
})
export class YieldFormComponent implements OnInit {
  private readonly yieldService = inject(YieldService);
  private readonly goatService = inject(GoatService);
  private readonly notify = inject(NotificationService);
  readonly router = inject(Router);

  does = signal<Goat[]>([]);
  saving = signal(false);

  form = { goatId: '', date: new Date(), morning: 0, evening: 0, total: 0, notes: '' };

  async ngOnInit(): Promise<void> {
    const does = await this.goatService.getDoes();
    this.does.set(does);
  }

  calcTotal(): void {
    this.form.total = (this.form.morning || 0) + (this.form.evening || 0);
  }

  async onSave(): Promise<void> {
    if (!this.form.goatId) return;
    this.saving.set(true);
    try {
      await this.yieldService.addMilkYield({
        goatId: this.form.goatId,
        dateRecorded: Timestamp.fromDate(this.form.date),
        morningYieldLiters: this.form.morning,
        eveningYieldLiters: this.form.evening,
        totalYieldLiters: this.form.total,
        notes: this.form.notes || undefined,
        farmId: '',
        createdBy: '',
      });
      this.notify.success('Milk yield recorded!');
      this.router.navigate(['/yield']);
    } catch (err: unknown) {
      this.notify.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
