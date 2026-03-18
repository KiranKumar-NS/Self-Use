import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DatePipe, DecimalPipe, SlicePipe } from '@angular/common';
import { YieldStore } from '../store/yield.store';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { StatCard } from '../../../shared/components/stat-card/stat-card';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-milk-yield',
  imports: [
    RouterLink, DatePipe, DecimalPipe, SlicePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatProgressSpinnerModule, PageHeader, StatCard, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="YIELD.MILK_YIELD" icon="water_drop">
      <a mat-raised-button color="primary" routerLink="/yield/new">
        <mat-icon>add</mat-icon>
        {{ 'YIELD.LOG_MILK' | translate }}
      </a>
      <a mat-stroked-button routerLink="/yield/growth">
        <mat-icon>trending_up</mat-icon>
        {{ 'YIELD.GROWTH' | translate }}
      </a>
    </app-page-header>

    <div class="grid-3">
      <app-stat-card [label]="'YIELD.TOTAL_YIELD' | translate" [value]="(store.totalYield() | number:'1.1-1') + ' L'" icon="water_drop" color="#1565c0" />
      <app-stat-card [label]="'YIELD.AVG_YIELD' | translate" [value]="(store.averageYield() | number:'1.2-2') + ' L'" icon="analytics" color="#2e7d32" />
      <app-stat-card label="Records" [value]="store.entities().length" icon="list" color="#7b1fa2" />
    </div>

    @if (store.loading()) {
      <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
    } @else {
      <mat-card class="table-card">
        <mat-card-content>
          @if (store.recentYields().length === 0) {
            <p class="empty-text">{{ 'COMMON.NO_DATA' | translate }}</p>
          } @else {
            <table mat-table [dataSource]="store.recentYields()" class="full-width">
              <ng-container matColumnDef="date">
                <th mat-header-cell *matHeaderCellDef>{{ 'YIELD.DATE' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.dateRecorded.toDate() | date:'mediumDate' }}</td>
              </ng-container>
              <ng-container matColumnDef="goatId">
                <th mat-header-cell *matHeaderCellDef>Goat</th>
                <td mat-cell *matCellDef="let row">{{ row.goatId | slice:0:8 }}...</td>
              </ng-container>
              <ng-container matColumnDef="morning">
                <th mat-header-cell *matHeaderCellDef>{{ 'YIELD.MORNING' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.morningYieldLiters }}</td>
              </ng-container>
              <ng-container matColumnDef="evening">
                <th mat-header-cell *matHeaderCellDef>{{ 'YIELD.EVENING' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.eveningYieldLiters }}</td>
              </ng-container>
              <ng-container matColumnDef="total">
                <th mat-header-cell *matHeaderCellDef>{{ 'YIELD.TOTAL' | translate }}</th>
                <td mat-cell *matCellDef="let row"><strong>{{ row.totalYieldLiters }}</strong></td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .grid-3 { margin-bottom: 16px; }
    .loading { display: flex; justify-content: center; padding: 40px; }
    .table-card { margin-top: 16px; }
    .full-width { width: 100%; }
    .empty-text { color: #999; text-align: center; padding: 24px; }
  `,
})
export class MilkYieldComponent {
  readonly store = inject(YieldStore);
  readonly displayedColumns = ['date', 'goatId', 'morning', 'evening', 'total'];
}
