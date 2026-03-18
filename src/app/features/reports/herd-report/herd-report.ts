import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { GoatStore } from '../../goats/store/goat.store';
import { BreedingStore } from '../../breeding/store/breeding.store';
import { YieldStore } from '../../yield/store/yield.store';
import { ExportService } from '../../../core/services/export.service';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatCard } from '../../../shared/components/stat-card/stat-card';
import { TranslateModule } from '@ngx-translate/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-herd-report',
  imports: [
    RouterLink, DecimalPipe,
    MatCardModule, MatButtonModule, MatIconModule, MatListModule,
    PageHeader, StatCard, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="REPORTS.HERD" icon="pets">
      <button mat-stroked-button (click)="exportPdf()">
        <mat-icon>picture_as_pdf</mat-icon>
        {{ 'REPORTS.EXPORT_PDF' | translate }}
      </button>
      <button mat-stroked-button (click)="exportExcel()">
        <mat-icon>table_chart</mat-icon>
        {{ 'REPORTS.EXPORT_EXCEL' | translate }}
      </button>
      <a mat-button routerLink="/reports"><mat-icon>arrow_back</mat-icon>Back</a>
    </app-page-header>

    <div class="grid-4">
      <app-stat-card label="Total Goats" [value]="goatStore.totalCount()" icon="pets" color="#2e7d32" />
      <app-stat-card label="Active" [value]="goatStore.activeCount()" icon="check_circle" color="#1565c0" />
      <app-stat-card label="Males" [value]="goatStore.maleCount()" icon="male" color="#0277bd" />
      <app-stat-card label="Females" [value]="goatStore.femaleCount()" icon="female" color="#c62828" />
    </div>

    <div class="grid-2">
      <mat-card>
        <mat-card-header><mat-card-title>{{ 'DASHBOARD.BY_BREED' | translate }}</mat-card-title></mat-card-header>
        <mat-card-content>
          <mat-list>
            @for (entry of breedEntries(); track entry[0]) {
              <mat-list-item>
                <mat-icon matListItemIcon>pets</mat-icon>
                <span matListItemTitle>{{ entry[0] }}</span>
                <span matListItemLine>{{ entry[1] }} goats</span>
              </mat-list-item>
            }
          </mat-list>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-header><mat-card-title>Yield Summary</mat-card-title></mat-card-header>
        <mat-card-content>
          <mat-list>
            <mat-list-item>
              <mat-icon matListItemIcon>water_drop</mat-icon>
              <span matListItemTitle>Total Milk Yield</span>
              <span matListItemLine>{{ yieldStore.totalYield() | number:'1.1-1' }} L</span>
            </mat-list-item>
            <mat-list-item>
              <mat-icon matListItemIcon>analytics</mat-icon>
              <span matListItemTitle>Average Per Record</span>
              <span matListItemLine>{{ yieldStore.averageYield() | number:'1.2-2' }} L</span>
            </mat-list-item>
            <mat-list-item>
              <mat-icon matListItemIcon>favorite</mat-icon>
              <span matListItemTitle>Active Pregnancies</span>
              <span matListItemLine>{{ breedingStore.activePregnancies().length }}</span>
            </mat-list-item>
          </mat-list>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .grid-4, .grid-2 { margin-bottom: 16px; }
  `,
})
export class HerdReport {
  readonly goatStore = inject(GoatStore);
  readonly breedingStore = inject(BreedingStore);
  readonly yieldStore = inject(YieldStore);
  private readonly exportService = inject(ExportService);

  breedEntries(): [string, number][] {
    return Object.entries(this.goatStore.breedCounts());
  }

  async exportPdf(): Promise<void> {
    const headers = ['Breed', 'Count'];
    const rows = this.breedEntries().map(([breed, count]) => [breed, count.toString()]);
    rows.push(['Total', this.goatStore.totalCount().toString()]);
    await this.exportService.exportToPdf('Herd Report', headers, rows);
  }

  async exportExcel(): Promise<void> {
    const headers = ['Breed', 'Count'];
    const rows = this.breedEntries().map(([breed, count]) => [breed, count]);
    rows.push(['Total', this.goatStore.totalCount()]);
    await this.exportService.exportToExcel('Herd Report', headers, rows);
  }
}
