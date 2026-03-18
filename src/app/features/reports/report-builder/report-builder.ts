import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-report-builder',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, PageHeader, TranslateModule],
  template: `
    <app-page-header titleKey="REPORTS.TITLE" icon="assessment" />

    <div class="report-grid">
      <mat-card class="report-card" routerLink="/reports/financial">
        <mat-card-content>
          <mat-icon class="report-icon" style="color: #2e7d32">account_balance</mat-icon>
          <h3>{{ 'REPORTS.FINANCIAL' | translate }}</h3>
          <p>Income, expense, and profit analysis</p>
        </mat-card-content>
      </mat-card>

      <mat-card class="report-card" routerLink="/reports/herd">
        <mat-card-content>
          <mat-icon class="report-icon" style="color: #1565c0">pets</mat-icon>
          <h3>{{ 'REPORTS.HERD' | translate }}</h3>
          <p>Goat distribution, breeding, and yield data</p>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .report-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .report-card {
      cursor: pointer; text-align: center; padding: 24px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .report-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
    .report-icon { font-size: 48px; height: 48px; width: 48px; }
    h3 { margin: 12px 0 4px; }
    p { color: #666; font-size: 14px; }
  `,
})
export class ReportBuilder {}
