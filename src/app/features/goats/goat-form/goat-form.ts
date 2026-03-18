import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Timestamp } from 'firebase/firestore';
import { GoatService } from '../services/goat.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { GOAT_BREEDS } from '../../../core/constants/breeds.constant';
import { Goat, GoatBreed, GoatGender, GoatStatus, HealthStatus } from '../../../core/models';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-goat-form',
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    PageHeader,
    TranslateModule,
  ],
  template: `
    <app-page-header [titleKey]="isEdit() ? 'GOATS.EDIT' : 'GOATS.REGISTER'" icon="pets" />

    <mat-card>
      <mat-card-content>
        <form (ngSubmit)="onSave()" class="goat-form">
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.TAG_NUMBER' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.tagNumber" name="tagNumber" required />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.NAME' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.name" name="name" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.BREED' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.breed" name="breed" required
                     [matAutocomplete]="breedAuto" placeholder="Type or select breed" />
              <mat-autocomplete #breedAuto="matAutocomplete">
                @for (breed of breeds; track breed.value) {
                  <mat-option [value]="breed.value">{{ breed.labelEn }}</mat-option>
                }
              </mat-autocomplete>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.GENDER' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.gender" name="gender" required>
                <mat-option value="male">{{ 'GOATS.MALE' | translate }}</mat-option>
                <mat-option value="female">{{ 'GOATS.FEMALE' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.DATE_OF_BIRTH' | translate }}</mat-label>
              <input matInput [matDatepicker]="dobPicker" [(ngModel)]="form.dateOfBirth" name="dateOfBirth" required />
              <mat-datepicker-toggle matSuffix [for]="dobPicker" />
              <mat-datepicker #dobPicker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.WEIGHT' | translate }}</mat-label>
              <input matInput type="number" [(ngModel)]="form.weight" name="weight" required />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.STATUS' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.status" name="status">
                <mat-option value="active">{{ 'GOATS.ACTIVE' | translate }}</mat-option>
                <mat-option value="sold">{{ 'GOATS.SOLD' | translate }}</mat-option>
                <mat-option value="deceased">{{ 'GOATS.DECEASED' | translate }}</mat-option>
                <mat-option value="dead">{{ 'GOATS.DEAD' | translate }}</mat-option>
                <mat-option value="quarantined">{{ 'GOATS.QUARANTINED' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.HEALTH' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.healthStatus" name="healthStatus">
                <mat-option value="healthy">{{ 'GOATS.HEALTHY' | translate }}</mat-option>
                <mat-option value="sick">{{ 'GOATS.SICK' | translate }}</mat-option>
                <mat-option value="under_treatment">{{ 'GOATS.UNDER_TREATMENT' | translate }}</mat-option>
                <mat-option value="recovering">{{ 'GOATS.RECOVERING' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.ACQUISITION' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.acquisitionType" name="acquisitionType">
                <mat-option value="born_on_farm">{{ 'GOATS.BORN_ON_FARM' | translate }}</mat-option>
                <mat-option value="purchased">{{ 'GOATS.PURCHASED' | translate }}</mat-option>
              </mat-select>
            </mat-form-field>

            @if (form.acquisitionType === 'purchased') {
              <mat-form-field appearance="outline">
                <mat-label>{{ 'GOATS.PURCHASE_PRICE' | translate }}</mat-label>
                <input matInput type="number" [(ngModel)]="form.purchasePrice" name="purchasePrice" />
              </mat-form-field>
            }
          </div>

          <h3 class="section-title"><mat-icon>medical_services</mat-icon> {{ 'GOATS.VETERINARY' | translate }}</h3>
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.VACCINATION_TYPE' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.vaccinationType" name="vaccinationType"
                     placeholder="e.g. PPR, ET, Deworming" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.LAST_VACCINATION' | translate }}</mat-label>
              <input matInput [matDatepicker]="lastVacPicker" [(ngModel)]="form.lastVaccinationDate" name="lastVaccinationDate" />
              <mat-datepicker-toggle matSuffix [for]="lastVacPicker" />
              <mat-datepicker #lastVacPicker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.NEXT_VACCINATION' | translate }}</mat-label>
              <input matInput [matDatepicker]="nextVacPicker" [(ngModel)]="form.nextVaccinationDue" name="nextVaccinationDue" />
              <mat-datepicker-toggle matSuffix [for]="nextVacPicker" />
              <mat-datepicker #nextVacPicker />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.VET_NAME' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.veterinarianName" name="veterinarianName" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'GOATS.VET_PHONE' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.veterinarianPhone" name="veterinarianPhone" type="tel" />
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'GOATS.MEDICAL_NOTES' | translate }}</mat-label>
            <textarea matInput [(ngModel)]="form.medicalNotes" name="medicalNotes" rows="2"
                      placeholder="Injection details, treatment history..."></textarea>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>{{ 'GOATS.NOTES' | translate }}</mat-label>
            <textarea matInput [(ngModel)]="form.notes" name="notes" rows="3"></textarea>
          </mat-form-field>

          <div class="form-actions">
            <button mat-button type="button" (click)="onCancel()">{{ 'COMMON.CANCEL' | translate }}</button>
            <button mat-raised-button color="primary" type="submit" [disabled]="saving()">
              @if (saving()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ 'COMMON.SAVE' | translate }}
              }
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .goat-form { max-width: 800px; }
    .form-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px;
    }
    .section-title { display: flex; align-items: center; gap: 8px; margin: 24px 0 8px; color: #555; font-size: 16px; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `,
})
export class GoatForm implements OnInit {
  private readonly goatService = inject(GoatService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(NotificationService);

  readonly breeds = GOAT_BREEDS;
  isEdit = signal(false);
  saving = signal(false);
  private goatId = '';

  form = {
    tagNumber: '',
    name: '',
    breed: 'semmeri' as GoatBreed,
    gender: 'female' as GoatGender,
    dateOfBirth: new Date(),
    weight: 0,
    status: 'active' as GoatStatus,
    healthStatus: 'healthy' as HealthStatus,
    acquisitionType: 'born_on_farm' as 'born_on_farm' | 'purchased',
    purchasePrice: 0,
    vaccinationType: '',
    lastVaccinationDate: null as Date | null,
    nextVaccinationDue: null as Date | null,
    veterinarianName: '',
    veterinarianPhone: '',
    medicalNotes: '',
    notes: '',
  };

  async ngOnInit(): Promise<void> {
    this.goatId = this.route.snapshot.params['goatId'] || '';
    if (this.goatId) {
      this.isEdit.set(true);
      const goat = await this.goatService.getGoatById(this.goatId);
      if (goat) {
        Object.assign(this.form, {
          tagNumber: goat.tagNumber,
          name: goat.name || '',
          breed: goat.breed,
          gender: goat.gender,
          dateOfBirth: goat.dateOfBirth.toDate(),
          weight: goat.weight,
          status: goat.status,
          healthStatus: goat.healthStatus,
          acquisitionType: goat.acquisitionType,
          purchasePrice: goat.purchasePrice || 0,
          vaccinationType: goat.vaccinationType || '',
          lastVaccinationDate: goat.lastVaccinationDate?.toDate() || null,
          nextVaccinationDue: goat.nextVaccinationDue?.toDate() || null,
          veterinarianName: goat.veterinarianName || '',
          veterinarianPhone: goat.veterinarianPhone || '',
          medicalNotes: goat.medicalNotes || '',
          notes: goat.notes || '',
        });
      }
    }
  }

  async onSave(): Promise<void> {
    if (!this.form.tagNumber) return;
    this.saving.set(true);
    try {
      const data: Omit<Goat, 'id' | 'createdAt' | 'updatedAt'> = {
        tagNumber: this.form.tagNumber,
        name: this.form.name || undefined,
        breed: this.form.breed,
        gender: this.form.gender,
        dateOfBirth: Timestamp.fromDate(this.form.dateOfBirth),
        weight: this.form.weight,
        status: this.form.status,
        healthStatus: this.form.healthStatus,
        acquisitionType: this.form.acquisitionType,
        acquisitionDate: Timestamp.now(),
        purchasePrice: this.form.acquisitionType === 'purchased' ? this.form.purchasePrice : undefined,
        vaccinationType: this.form.vaccinationType || undefined,
        lastVaccinationDate: this.form.lastVaccinationDate ? Timestamp.fromDate(this.form.lastVaccinationDate) : undefined,
        nextVaccinationDue: this.form.nextVaccinationDue ? Timestamp.fromDate(this.form.nextVaccinationDue) : undefined,
        veterinarianName: this.form.veterinarianName || undefined,
        veterinarianPhone: this.form.veterinarianPhone || undefined,
        medicalNotes: this.form.medicalNotes || undefined,
        photoUrls: [],
        notes: this.form.notes || undefined,
        farmId: this.auth.currentFarmId(),
        createdBy: this.auth.currentUid(),
      };

      if (this.isEdit()) {
        await this.goatService.updateGoat(this.goatId, data);
        this.notify.success('Goat updated successfully!');
      } else {
        await this.goatService.registerGoat(data);
        this.notify.success('Goat registered successfully!');
      }
      this.router.navigate(['/goats']);
    } catch (err: unknown) {
      this.notify.error(err instanceof Error ? err.message : 'Failed to save goat');
    } finally {
      this.saving.set(false);
    }
  }

  onCancel(): void {
    this.router.navigate(['/goats']);
  }
}
