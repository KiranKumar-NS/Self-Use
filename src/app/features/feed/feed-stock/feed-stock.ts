import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { FeedService } from '../services/feed.service';
import { FeedStock } from '../../../core/models';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-feed-stock',
  imports: [
    RouterLink,
    MatCardModule, MatButtonModule, MatIconModule, MatProgressBarModule,
    PageHeader, TranslateModule,
  ],
  template: `
    <app-page-header titleKey="FEED.STOCK" icon="inventory">
      <a mat-button routerLink="/feed">
        <mat-icon>arrow_back</mat-icon>
        Back to Feed Log
      </a>
    </app-page-header>

    <div class="stock-grid">
      @for (stock of stocks(); track stock.id) {
        <mat-card [class.low-stock]="stock.currentStockKg <= stock.minimumStockKg">
          <mat-card-header>
            <mat-icon mat-card-avatar [class.warning]="stock.currentStockKg <= stock.minimumStockKg">
              {{ stock.currentStockKg <= stock.minimumStockKg ? 'warning' : 'inventory' }}
            </mat-icon>
            <mat-card-title>{{ stock.feedName }}</mat-card-title>
            <mat-card-subtitle>{{ stock.feedType }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="stock-info">
              <span>{{ 'FEED.CURRENT_STOCK' | translate }}: <strong>{{ stock.currentStockKg }} kg</strong></span>
              <span>{{ 'FEED.MINIMUM_STOCK' | translate }}: {{ stock.minimumStockKg }} kg</span>
            </div>
            <mat-progress-bar
              [mode]="'determinate'"
              [value]="getStockPercentage(stock)"
              [color]="stock.currentStockKg <= stock.minimumStockKg ? 'warn' : 'primary'">
            </mat-progress-bar>
            @if (stock.currentStockKg <= stock.minimumStockKg) {
              <p class="low-stock-alert">{{ 'FEED.LOW_STOCK_ALERT' | translate }}</p>
            }
          </mat-card-content>
        </mat-card>
      } @empty {
        <mat-card><mat-card-content><p class="empty-text">{{ 'COMMON.NO_DATA' | translate }}</p></mat-card-content></mat-card>
      }
    </div>
  `,
  styles: `
    .stock-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .stock-info { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; font-size: 14px; }
    .low-stock { border-left: 4px solid #ff9800; }
    .low-stock-alert { color: #e65100; font-weight: 500; margin-top: 8px; font-size: 13px; }
    .warning { color: #e65100 !important; }
    .empty-text { color: #999; text-align: center; padding: 24px; }
  `,
})
export class FeedStockComponent implements OnInit {
  private readonly feedService = inject(FeedService);
  stocks = signal<FeedStock[]>([]);

  async ngOnInit(): Promise<void> {
    this.feedService.getFeedStock$().subscribe((stocks) => this.stocks.set(stocks));
  }

  getStockPercentage(stock: FeedStock): number {
    const maxStock = stock.minimumStockKg * 3;
    return Math.min(100, (stock.currentStockKg / maxStock) * 100);
  }
}
