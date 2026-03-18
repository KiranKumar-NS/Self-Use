import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DatePipe } from '@angular/common';
import { FeedStore } from '../store/feed.store';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-feed-log',
  imports: [
    RouterLink, DatePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatProgressSpinnerModule, PageHeader, CurrencyInrPipe, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="FEED.TITLE" icon="grass">
      <a mat-raised-button color="primary" routerLink="/feed/new">
        <mat-icon>add</mat-icon>
        {{ 'FEED.LOG_FEED' | translate }}
      </a>
      <a mat-stroked-button routerLink="/feed/stock">
        <mat-icon>inventory</mat-icon>
        {{ 'FEED.STOCK' | translate }}
      </a>
    </app-page-header>

    @if (store.loading()) {
      <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
    } @else {
      <mat-card>
        <mat-card-content>
          @if (store.recentLogs().length === 0) {
            <p class="empty-text">{{ 'COMMON.NO_DATA' | translate }}</p>
          } @else {
            <table mat-table [dataSource]="store.recentLogs()" class="full-width">
              <ng-container matColumnDef="date">
                <th mat-header-cell *matHeaderCellDef>{{ 'FEED.FEED_DATE' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.feedDate.toDate() | date:'mediumDate' }}</td>
              </ng-container>
              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef>{{ 'FEED.TYPE' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.feedType }}</td>
              </ng-container>
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>{{ 'FEED.FEED_NAME' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.feedName }}</td>
              </ng-container>
              <ng-container matColumnDef="quantity">
                <th mat-header-cell *matHeaderCellDef>{{ 'FEED.QUANTITY' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.quantityKg }} kg</td>
              </ng-container>
              <ng-container matColumnDef="cost">
                <th mat-header-cell *matHeaderCellDef>{{ 'FEED.TOTAL_COST' | translate }}</th>
                <td mat-cell *matCellDef="let row">{{ row.totalCostInr | currencyInr }}</td>
              </ng-container>
              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
          }
        </mat-card-content>
      </mat-card>

      <mat-card class="total-card">
        <mat-card-content>
          <strong>{{ 'FEED.TOTAL_COST' | translate }}: {{ store.totalCost() | currencyInr }}</strong>
        </mat-card-content>
      </mat-card>
    }
  `,
  styles: `
    .loading { display: flex; justify-content: center; padding: 40px; }
    .full-width { width: 100%; }
    .empty-text { color: #999; text-align: center; padding: 24px; }
    .total-card { margin-top: 16px; text-align: right; }
  `,
})
export class FeedLogComponent {
  readonly store = inject(FeedStore);
  readonly displayedColumns = ['date', 'type', 'name', 'quantity', 'cost'];
}
