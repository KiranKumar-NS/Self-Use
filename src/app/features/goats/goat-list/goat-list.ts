import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule } from '@angular/forms';
import { GoatStore } from '../store/goat.store';
import { GOAT_BREEDS } from '../../../core/constants/breeds.constant';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';
import { Goat } from '../../../core/models';

@Component({
  selector: 'app-goat-list',
  imports: [
    RouterLink,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatCardModule,
    MatProgressSpinnerModule,
    PageHeader,
    TranslateModule,
  ],
  template: `
    <app-page-header titleKey="GOATS.TITLE" icon="pets">
      <a mat-raised-button color="primary" routerLink="/goats/new">
        <mat-icon>add</mat-icon>
        {{ 'GOATS.REGISTER' | translate }}
      </a>
    </app-page-header>

    <mat-card class="filter-card">
      <mat-card-content>
        <div class="filters">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>{{ 'GOATS.SEARCH' | translate }}</mat-label>
            <input matInput [ngModel]="store.searchQuery()" (ngModelChange)="store.setSearchQuery($event)" />
            <mat-icon matPrefix>search</mat-icon>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'GOATS.BREED' | translate }}</mat-label>
            <mat-select [ngModel]="store.filterBreed()" (ngModelChange)="store.setFilterBreed($event)">
              <mat-option value="all">{{ 'COMMON.ALL' | translate }}</mat-option>
              @for (breed of breeds; track breed.value) {
                <mat-option [value]="breed.value">{{ breed.labelEn }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'GOATS.STATUS' | translate }}</mat-label>
            <mat-select [ngModel]="store.filterStatus()" (ngModelChange)="store.setFilterStatus($event)">
              <mat-option value="all">{{ 'COMMON.ALL' | translate }}</mat-option>
              <mat-option value="active">{{ 'GOATS.ACTIVE' | translate }}</mat-option>
              <mat-option value="sold">{{ 'GOATS.SOLD' | translate }}</mat-option>
              <mat-option value="deceased">{{ 'GOATS.DECEASED' | translate }}</mat-option>
              <mat-option value="dead">{{ 'GOATS.DEAD' | translate }}</mat-option>
              <mat-option value="quarantined">{{ 'GOATS.QUARANTINED' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="stats-row">
          <span class="stat-chip">Total: {{ store.totalCount() }}</span>
          <span class="stat-chip active">Active: {{ store.activeCount() }}</span>
          <span class="stat-chip male">Male: {{ store.maleCount() }}</span>
          <span class="stat-chip female">Female: {{ store.femaleCount() }}</span>
        </div>
      </mat-card-content>
    </mat-card>

    @if (store.loading()) {
      <div class="loading-container">
        <mat-spinner diameter="40"></mat-spinner>
      </div>
    } @else if (store.filteredGoats().length === 0) {
      <mat-card class="empty-card">
        <mat-card-content>
          <mat-icon class="empty-icon">pets</mat-icon>
          <p>{{ 'GOATS.NO_GOATS' | translate }}</p>
        </mat-card-content>
      </mat-card>
    } @else {
      <div class="goat-grid">
        @for (goat of store.filteredGoats(); track goat.id) {
          <mat-card class="goat-card" (click)="viewGoat(goat)">
            <mat-card-header>
              <mat-icon mat-card-avatar class="goat-avatar">pets</mat-icon>
              <mat-card-title>{{ goat.tagNumber }}</mat-card-title>
              <mat-card-subtitle>{{ goat.name || goat.breed }}</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="goat-info">
                <span><mat-icon>straighten</mat-icon> {{ goat.weight }} kg</span>
                <span><mat-icon>{{ goat.gender === 'male' ? 'male' : 'female' }}</mat-icon> {{ goat.gender }}</span>
                <span class="status-badge" [class]="goat.status">{{ goat.status }}</span>
              </div>
            </mat-card-content>
          </mat-card>
        }
      </div>
    }
  `,
  styles: `
    .filter-card { margin-bottom: 16px; }
    .filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
    .search-field { flex: 1; min-width: 200px; }
    .stats-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .stat-chip {
      padding: 4px 12px; border-radius: 16px; font-size: 13px;
      background: #e0e0e0; font-weight: 500;
    }
    .stat-chip.active { background: #c8e6c9; color: #2e7d32; }
    .stat-chip.male { background: #bbdefb; color: #1565c0; }
    .stat-chip.female { background: #f8bbd0; color: #c62828; }
    .loading-container { display: flex; justify-content: center; padding: 40px; }
    .empty-card { text-align: center; padding: 40px; }
    .empty-icon { font-size: 64px; height: 64px; width: 64px; color: #ccc; }
    .goat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .goat-card { cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
    .goat-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .goat-avatar { background: #e8f5e9; color: #2e7d32; }
    .goat-info { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
    .goat-info span { display: flex; align-items: center; gap: 4px; font-size: 13px; }
    .goat-info mat-icon { font-size: 16px; height: 16px; width: 16px; }
    .status-badge {
      padding: 2px 8px; border-radius: 12px; font-size: 11px;
      font-weight: 500; text-transform: uppercase;
    }
    .status-badge.active { background: #c8e6c9; color: #2e7d32; }
    .status-badge.sold { background: #fff3e0; color: #e65100; }
    .status-badge.deceased { background: #ffcdd2; color: #c62828; }
    .status-badge.dead { background: #d7ccc8; color: #4e342e; }
    .status-badge.quarantined { background: #fff9c4; color: #f57f17; }
  `,
})
export class GoatList {
  readonly store = inject(GoatStore);
  private readonly router = inject(Router);
  readonly breeds = GOAT_BREEDS;

  viewGoat(goat: Goat): void {
    this.router.navigate(['/goats', goat.id]);
  }
}
