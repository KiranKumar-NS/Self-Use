import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DatePipe, SlicePipe, UpperCasePipe } from '@angular/common';
import { BreedingStore } from '../store/breeding.store';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';
import { BreedingStatus } from '../../../core/models';

@Component({
  selector: 'app-breeding-list',
  imports: [
    RouterLink, DatePipe, SlicePipe, UpperCasePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatTabsModule, MatChipsModule,
    MatProgressSpinnerModule, PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="BREEDING.TITLE" icon="favorite">
      <a mat-raised-button color="primary" routerLink="/breeding/new">
        <mat-icon>add</mat-icon>
        {{ 'BREEDING.NEW_RECORD' | translate }}
      </a>
      <a mat-stroked-button routerLink="/breeding/calendar">
        <mat-icon>calendar_month</mat-icon>
        {{ 'BREEDING.CALENDAR' | translate }}
      </a>
    </app-page-header>

    <mat-card class="filter-card">
      <mat-card-content>
        <mat-chip-listbox (change)="onStatusFilter($event.value)">
          <mat-chip-option value="all" [selected]="store.filterStatus() === 'all'">{{ 'BREEDING.ALL' | translate }}</mat-chip-option>
          <mat-chip-option value="heat_detected">{{ 'BREEDING.HEAT_DETECTED' | translate }}</mat-chip-option>
          <mat-chip-option value="mated">{{ 'BREEDING.MATED' | translate }}</mat-chip-option>
          <mat-chip-option value="confirmed_pregnant">{{ 'BREEDING.PREGNANT' | translate }}</mat-chip-option>
          <mat-chip-option value="kidding_due">{{ 'BREEDING.KIDDING_DUE' | translate }}</mat-chip-option>
          <mat-chip-option value="kidded">{{ 'BREEDING.KIDDED' | translate }}</mat-chip-option>
        </mat-chip-listbox>
      </mat-card-content>
    </mat-card>

    @if (store.loading()) {
      <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
    } @else {
      <div class="record-grid">
        @for (record of store.filteredRecords(); track record.id) {
          <mat-card class="record-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="breeding-icon">favorite</mat-icon>
              <mat-card-title>Doe: {{ record.doeId | slice:0:8 }}...</mat-card-title>
              <mat-card-subtitle>Buck: {{ record.buckId | slice:0:8 }}...</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="record-details">
                <span class="status-badge" [class]="record.status">{{ record.status | uppercase }}</span>
                @if (record.matingDate) {
                  <span><mat-icon>event</mat-icon> Mated: {{ record.matingDate.toDate() | date:'mediumDate' }}</span>
                }
                @if (record.expectedKiddingDate) {
                  <span><mat-icon>child_care</mat-icon> Due: {{ record.expectedKiddingDate.toDate() | date:'mediumDate' }}</span>
                }
                @if (record.litterSize) {
                  <span><mat-icon>pets</mat-icon> Litter: {{ record.litterSize }}</span>
                }
              </div>
            </mat-card-content>
            <mat-card-actions>
              <a mat-button [routerLink]="['/breeding', record.id, 'edit']">
                <mat-icon>edit</mat-icon> {{ 'COMMON.EDIT' | translate }}
              </a>
            </mat-card-actions>
          </mat-card>
        } @empty {
          <mat-card class="empty-card">
            <mat-card-content>
              <p>No breeding records found.</p>
            </mat-card-content>
          </mat-card>
        }
      </div>
    }
  `,
  styles: `
    .filter-card { margin-bottom: 16px; }
    .loading { display: flex; justify-content: center; padding: 40px; }
    .record-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .breeding-icon { background: #fce4ec; color: #c62828; }
    .record-details { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .record-details span { display: flex; align-items: center; gap: 4px; font-size: 13px; }
    .record-details mat-icon { font-size: 16px; height: 16px; width: 16px; }
    .status-badge {
      padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 500;
      display: inline-block; width: fit-content;
    }
    .status-badge.heat_detected { background: #fff3e0; color: #e65100; }
    .status-badge.mated { background: #e3f2fd; color: #1565c0; }
    .status-badge.confirmed_pregnant { background: #f3e5f5; color: #7b1fa2; }
    .status-badge.kidding_due { background: #fce4ec; color: #c62828; }
    .status-badge.kidded { background: #c8e6c9; color: #2e7d32; }
    .status-badge.failed { background: #ffcdd2; color: #c62828; }
    .empty-card { text-align: center; padding: 24px; color: #999; }
  `,
})
export class BreedingList {
  readonly store = inject(BreedingStore);

  onStatusFilter(value: string): void {
    this.store.setFilterStatus(value as BreedingStatus | 'all');
  }
}
