import { Component, inject, signal } from '@angular/core';
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
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Timestamp } from 'firebase/firestore';
import { FeedService } from '../services/feed.service';
import { NotificationService } from '../../../core/services/notification.service';
import { FEED_TYPES } from '../../../core/constants/feed-types.constant';
import { FeedType } from '../../../core/models';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-feed-form',
  imports: [
    FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
    MatRadioModule, MatProgressSpinnerModule, PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="FEED.LOG_FEED" icon="grass" />

    <mat-card>
      <mat-card-content>
        <form (ngSubmit)="onSave()" class="feed-form">
          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'FEED.TYPE' | translate }}</mat-label>
              <mat-select [(ngModel)]="form.feedType" name="feedType" required>
                @for (ft of feedTypes; track ft.value) {
                  <mat-option [value]="ft.value">{{ ft.labelEn }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'FEED.FEED_NAME' | translate }}</mat-label>
              <input matInput [(ngModel)]="form.feedName" name="feedName" required />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'FEED.QUANTITY' | translate }}</mat-label>
              <input matInput type="number" [(ngModel)]="form.quantityKg" name="quantity" required (ngModelChange)="calcTotal()" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'FEED.UNIT_COST' | translate }}</mat-label>
              <input matInput type="number" [(ngModel)]="form.unitCostInr" name="unitCost" required (ngModelChange)="calcTotal()" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'FEED.TOTAL_COST' | translate }}</mat-label>
              <input matInput type="number" [ngModel]="form.totalCostInr" name="totalCost" readonly />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'FEED.FEED_DATE' | translate }}</mat-label>
              <input matInput [matDatepicker]="feedPicker" [(ngModel)]="form.feedDate" name="feedDate" />
              <mat-datepicker-toggle matSuffix [for]="feedPicker" />
              <mat-datepicker #feedPicker />
            </mat-form-field>
          </div>

          <div class="target-section">
            <label>{{ 'FEED.TARGET' | translate }}</label>
            <mat-radio-group [(ngModel)]="form.targetType" name="targetType">
              <mat-radio-button value="group">{{ 'FEED.GROUP' | translate }}</mat-radio-button>
              <mat-radio-button value="individual">{{ 'FEED.INDIVIDUAL' | translate }}</mat-radio-button>
            </mat-radio-group>

            @if (form.targetType === 'group') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'FEED.GROUP_NAME' | translate }}</mat-label>
                <input matInput [(ngModel)]="form.groupName" name="groupName" />
              </mat-form-field>
            }
          </div>

          <div class="form-actions">
            <button mat-button type="button" (click)="router.navigate(['/feed'])">{{ 'COMMON.CANCEL' | translate }}</button>
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
    .feed-form { max-width: 800px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 16px; }
    .full-width { width: 100%; }
    .target-section { margin: 16px 0; display: flex; flex-direction: column; gap: 8px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
    mat-radio-group { display: flex; gap: 16px; }
  `,
})
export class FeedFormComponent {
  private readonly feedService = inject(FeedService);
  private readonly notify = inject(NotificationService);
  readonly router = inject(Router);
  readonly feedTypes = FEED_TYPES;
  saving = signal(false);

  form = {
    feedType: 'concentrate' as FeedType,
    feedName: '',
    quantityKg: 0,
    unitCostInr: 0,
    totalCostInr: 0,
    feedDate: new Date(),
    targetType: 'group' as 'individual' | 'group',
    groupName: 'All Goats',
    goatId: '',
  };

  calcTotal(): void {
    this.form.totalCostInr = this.form.quantityKg * this.form.unitCostInr;
  }

  async onSave(): Promise<void> {
    if (!this.form.feedName) return;
    this.saving.set(true);
    try {
      await this.feedService.addFeedLog({
        feedType: this.form.feedType,
        feedName: this.form.feedName,
        quantityKg: this.form.quantityKg,
        unitCostInr: this.form.unitCostInr,
        totalCostInr: this.form.totalCostInr,
        feedDate: Timestamp.fromDate(this.form.feedDate),
        targetType: this.form.targetType,
        groupName: this.form.targetType === 'group' ? this.form.groupName : undefined,
        goatId: this.form.targetType === 'individual' ? this.form.goatId : undefined,
        farmId: '',
        createdBy: '',
      });
      this.notify.success('Feed log saved!');
      this.router.navigate(['/feed']);
    } catch (err: unknown) {
      this.notify.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
