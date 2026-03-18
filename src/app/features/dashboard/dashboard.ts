import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { GoatStore } from '../goats/store/goat.store';
import { BreedingStore } from '../breeding/store/breeding.store';
import { TransactionStore } from '../transactions/store/transaction.store';
import { YieldStore } from '../yield/store/yield.store';
import { PageHeader } from '../../shared/components/page-header/page-header';
import { StatCard } from '../../shared/components/stat-card/stat-card';
import { CurrencyInrPipe } from '../../shared/pipes/currency-inr.pipe';
import { TranslateModule } from '@ngx-translate/core';
import { DecimalPipe, SlicePipe } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink, DecimalPipe, SlicePipe,
    MatCardModule, MatButtonModule, MatIconModule, MatListModule,
    PageHeader, StatCard, CurrencyInrPipe, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="DASHBOARD.TITLE" icon="dashboard" />

    <div class="grid-4">
      <app-stat-card
        [label]="'DASHBOARD.TOTAL_GOATS' | translate"
        [value]="goatStore.totalCount()"
        icon="pets"
        color="#2e7d32" />
      <app-stat-card
        [label]="'DASHBOARD.ACTIVE_GOATS' | translate"
        [value]="goatStore.activeCount()"
        icon="check_circle"
        color="#1565c0" />
      <app-stat-card
        [label]="'DASHBOARD.PREGNANT' | translate"
        [value]="breedingStore.activePregnancies().length"
        icon="favorite"
        color="#7b1fa2" />
      <app-stat-card
        [label]="'DASHBOARD.MONTHLY_PROFIT' | translate"
        [value]="txnStore.netProfit() | currencyInr"
        icon="account_balance"
        [color]="txnStore.netProfit() >= 0 ? '#2e7d32' : '#c62828'" />
    </div>

    <div class="grid-2">
      <mat-card>
        <mat-card-header>
          <mat-card-title>{{ 'DASHBOARD.HERD_OVERVIEW' | translate }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <mat-list>
            <mat-list-item>
              <mat-icon matListItemIcon>male</mat-icon>
              <span matListItemTitle>Males</span>
              <span matListItemLine>{{ goatStore.maleCount() }}</span>
            </mat-list-item>
            <mat-list-item>
              <mat-icon matListItemIcon>female</mat-icon>
              <span matListItemTitle>Females</span>
              <span matListItemLine>{{ goatStore.femaleCount() }}</span>
            </mat-list-item>
            @for (entry of breedEntries(); track entry[0]) {
              <mat-list-item>
                <mat-icon matListItemIcon>pets</mat-icon>
                <span matListItemTitle>{{ entry[0] }}</span>
                <span matListItemLine>{{ entry[1] }}</span>
              </mat-list-item>
            }
          </mat-list>
        </mat-card-content>
        <mat-card-actions>
          <a mat-button routerLink="/goats">View All Goats</a>
        </mat-card-actions>
      </mat-card>

      <mat-card>
        <mat-card-header>
          <mat-card-title>{{ 'DASHBOARD.INCOME_VS_EXPENSE' | translate }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="finance-summary">
            <div class="finance-row income">
              <span>{{ 'TRANSACTIONS.TOTAL_INCOME' | translate }}</span>
              <strong>{{ txnStore.totalIncome() | currencyInr }}</strong>
            </div>
            <div class="finance-row expense">
              <span>{{ 'TRANSACTIONS.TOTAL_EXPENSE' | translate }}</span>
              <strong>{{ txnStore.totalExpense() | currencyInr }}</strong>
            </div>
            <hr />
            <div class="finance-row profit" [class.loss]="txnStore.netProfit() < 0">
              <span>{{ 'TRANSACTIONS.NET_PROFIT' | translate }}</span>
              <strong>{{ txnStore.netProfit() | currencyInr }}</strong>
            </div>
          </div>
        </mat-card-content>
        <mat-card-actions>
          <a mat-button routerLink="/transactions">View Transactions</a>
        </mat-card-actions>
      </mat-card>
    </div>

    <div class="grid-2 section-margin">
      <mat-card>
        <mat-card-header>
          <mat-card-title>{{ 'DASHBOARD.UPCOMING_EVENTS' | translate }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (breedingStore.upcomingKiddings().length === 0) {
            <p class="empty-text">No upcoming events</p>
          } @else {
            <mat-list>
              @for (record of breedingStore.upcomingKiddings().slice(0, 5); track record.id) {
                <mat-list-item>
                  <mat-icon matListItemIcon color="warn">child_care</mat-icon>
                  <span matListItemTitle>Kidding Expected</span>
                  <span matListItemLine>Doe: {{ record.doeId | slice:0:8 }}...</span>
                </mat-list-item>
              }
            </mat-list>
          }
        </mat-card-content>
        <mat-card-actions>
          <a mat-button routerLink="/breeding">View Breeding</a>
        </mat-card-actions>
      </mat-card>

      <mat-card>
        <mat-card-header>
          <mat-card-title>{{ 'DASHBOARD.MILK_YIELD_TREND' | translate }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="yield-summary">
            <div class="yield-stat">
              <span class="yield-label">{{ 'YIELD.TOTAL_YIELD' | translate }}</span>
              <span class="yield-value">{{ yieldStore.totalYield() | number:'1.1-1' }} L</span>
            </div>
            <div class="yield-stat">
              <span class="yield-label">{{ 'YIELD.AVG_YIELD' | translate }}</span>
              <span class="yield-value">{{ yieldStore.averageYield() | number:'1.2-2' }} L</span>
            </div>
            <div class="yield-stat">
              <span class="yield-label">Records</span>
              <span class="yield-value">{{ yieldStore.entities().length }}</span>
            </div>
          </div>
        </mat-card-content>
        <mat-card-actions>
          <a mat-button routerLink="/yield">View Yield</a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: `
    .grid-4, .grid-2 { margin-bottom: 16px; }
    .section-margin { margin-top: 16px; }
    .finance-summary { padding: 8px 0; }
    .finance-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; }
    .finance-row.income { color: #2e7d32; }
    .finance-row.expense { color: #c62828; }
    .finance-row.profit { color: #2e7d32; font-size: 18px; }
    .finance-row.loss { color: #c62828; }
    hr { border: none; border-top: 1px solid #e0e0e0; margin: 8px 0; }
    .empty-text { color: #999; text-align: center; padding: 16px; }
    .yield-summary { display: flex; justify-content: space-around; padding: 16px 0; }
    .yield-stat { text-align: center; }
    .yield-label { display: block; font-size: 12px; color: #666; }
    .yield-value { display: block; font-size: 24px; font-weight: 600; color: #1565c0; }
  `,
})
export class Dashboard {
  readonly goatStore = inject(GoatStore);
  readonly breedingStore = inject(BreedingStore);
  readonly txnStore = inject(TransactionStore);
  readonly yieldStore = inject(YieldStore);

  breedEntries(): [string, number][] {
    return Object.entries(this.goatStore.breedCounts());
  }
}
