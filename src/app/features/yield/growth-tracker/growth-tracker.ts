import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-growth-tracker',
  imports: [MatCardModule, PageHeader, TranslateModule],
  template: `
    <app-page-header titleKey="YIELD.GROWTH" icon="trending_up" />
    <mat-card>
      <mat-card-content>
        <p class="placeholder-text">Select a goat to view weight growth chart. Weight records logged via the yield form will appear here.</p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `.placeholder-text { color: #999; text-align: center; padding: 40px; }`,
})
export class GrowthTracker {}
