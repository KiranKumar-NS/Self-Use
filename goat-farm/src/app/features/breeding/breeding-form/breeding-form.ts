import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { addDays } from 'date-fns';
import { BreedingService } from '../services/breeding.service';
import { GoatService } from '../../goats/services/goat.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Goat, BreedingStatus } from '../../../core/models';
import { GESTATION_DAYS } from '../../../core/constants/breeds.constant';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-breeding-form',
  imports: [
    FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="BREEDING.NEW_RECORD" icon="favorite" />

    <mat-card>
      <mat-card-content>
        <form (ngSubmit)="onSave()" class="breeding-form">
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'BREEDING.DOE' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.doeId" name="doeId" required>
                @for (doe of does(); track doe.id) {
                  <mat-option [value]="doe.id">{{ doe.tagNumber }} {{ doe.name ? '- ' + doe.name : '' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'BREEDING.BUCK' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.buckId" name="buckId" required>
                @for (buck of bucks(); track buck.id) {
                  <mat-option [value]="buck.id">{{ buck.tagNumber }} {{ buck.name ? '- ' + buck.name : '' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'BREEDING.STATUS' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.status" name="status">
                <mat-option value="heat_detected">Heat Detected</mat-option>
                <mat-option value="mated">Mated</mat-option>
                <mat-option value="confirmed_pregnant">Confirmed Pregnant</mat-option>
                <mat-option value="kidding_due">Kidding Due</mat-option>
                <mat-option value="kidded">Kidded</mat-option>
                <mat-option value="failed">Failed</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'BREEDING.HEAT_DETECTED' | translate }}</mat-label>
              <input matInput [matDatepicker]="heatPicker" [(ngModel)]="form.heatDetectedDate" name="heatDate" required />
              <mat-datepicker-toggle matSuffix [for]="heatPicker" />
              <mat-datepicker #heatPicker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'BREEDING.MATING_DATE' | translate }}</mat-label>
              <input matInput [matDatepicker]="matingPicker" [(ngModel)]="form.matingDate" name="matingDate" (ngModelChange)="onMatingDateChange($event)" />
              <mat-datepicker-toggle matSuffix [for]="matingPicker" />
              <mat-datepicker #matingPicker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'BREEDING.EXPECTED_KIDDING' | translate }}</mat-label>
              <input matInput [matDatepicker]="kiddingPicker" [(ngModel)]="form.expectedKiddingDate" name="kiddingDate" />
              <mat-datepicker-toggle matSuffix [for]="kiddingPicker" />
              <mat-datepicker #kiddingPicker />
            </mat-form-field>

            @if (form.status === 'kidded') {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'BREEDING.LITTER_SIZE' | translate }}</mat-label>
                <input matInput type="number" [(ngModel)]="form.litterSize" name="litterSize" />
              </mat-form-field>
            }
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'GOATS.NOTES' | translate }}</mat-label>
            <textarea matInput [(ngModel)]="form.notes" name="notes" rows="3"></textarea>
          </mat-form-field>

          <div class="form-actions">
            <button mat-button type="button" (click)="router.navigate(['/breeding'])">{{ 'COMMON.CANCEL' | translate }}</button>
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
    .breeding-form { max-width: 800px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
})
export class BreedingForm implements OnInit {
  private readonly breedingService = inject(BreedingService);
  private readonly goatService = inject(GoatService);
  private readonly notify = inject(NotificationService);
  readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  does = signal<Goat[]>([]);
  bucks = signal<Goat[]>([]);
  saving = signal(false);

  form = {
    doeId: '',
    buckId: '',
    status: 'heat_detected' as BreedingStatus,
    heatDetectedDate: new Date(),
    matingDate: null as Date | null,
    expectedKiddingDate: null as Date | null,
    litterSize: 0,
    notes: '',
  };

  async ngOnInit(): Promise<void> {
    const [does, bucks] = await Promise.all([
      this.goatService.getDoes(),
      this.goatService.getBucks(),
    ]);
    this.does.set(does);
    this.bucks.set(bucks);
  }

  onMatingDateChange(date: Date): void {
    if (date) {
      this.form.expectedKiddingDate = addDays(date, GESTATION_DAYS);
    }
  }

  async onSave(): Promise<void> {
    if (!this.form.doeId || !this.form.buckId) return;
    this.saving.set(true);
    try {
      await this.breedingService.addRecord({
        doeId: this.form.doeId,
        buckId: this.form.buckId,
        status: this.form.status,
        heatDetectedDate: Timestamp.fromDate(this.form.heatDetectedDate),
        matingDate: this.form.matingDate ? Timestamp.fromDate(this.form.matingDate) : undefined,
        expectedKiddingDate: this.form.expectedKiddingDate ? Timestamp.fromDate(this.form.expectedKiddingDate) : undefined,
        litterSize: this.form.litterSize || undefined,
        notes: this.form.notes || undefined,
        farmId: '',
        createdBy: '',
      });
      this.notify.success('Breeding record saved!');
      this.router.navigate(['/breeding']);
    } catch (err: unknown) {
      this.notify.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
