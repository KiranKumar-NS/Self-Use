import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { DatePipe, SlicePipe, UpperCasePipe } from '@angular/common';
import { BreedingStore } from '../store/breeding.store';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-breeding-calendar',
  imports: [
    RouterLink, DatePipe, SlicePipe, UpperCasePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatListModule,
    PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="BREEDING.CALENDAR" icon="calendar_month">
      <a mat-button routerLink="/breeding">
        <mat-icon>arrow_back</mat-icon>
        Back to List
      </a>
    </app-page-header>

    <mat-card>
      <mat-card-header>
        <mat-card-title>{{ 'BREEDING.KIDDING_TRACKER' | translate }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (store.upcomingKiddings().length === 0) {
          <p class="empty-text">No upcoming kidding dates</p>
        } @else {
          <mat-list>
            @for (record of store.upcomingKiddings(); track record.id) {
              <mat-list-item>
                <mat-icon matListItemIcon [style.color]="record.status === 'kidding_due' ? '#c62828' : '#7b1fa2'">
                  child_care
                </mat-icon>
                <span matListItemTitle>Doe: {{ record.doeId | slice:0:8 }}...</span>
                <span matListItemLine>
                  @if (record.expectedKiddingDate) {
                    Due: {{ record.expectedKiddingDate.toDate() | date:'mediumDate' }}
                  }
                  | Status: {{ record.status | uppercase }}
                </span>
              </mat-list-item>
            }
          </mat-list>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .empty-text { color: #999; text-align: center; padding: 24px; }
  `,
})
export class BreedingCalendar {
  readonly store = inject(BreedingStore);
}
