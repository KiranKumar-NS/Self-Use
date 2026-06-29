import { Component, Input } from '@angular/core';
import { Segment } from '../../../core/models/segment.model';
import { MonthlySummary } from '../../../core/models/monthly-summary.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-budget-widget',
  standalone: true,
  imports: [CurrencyInrPipe, MatCardModule, MatIconModule, MatProgressBarModule],
  template: `
    @if (budgetItems().length > 0) {
      <mat-card class="budget-card">
        <h3><mat-icon class="title-icon">account_balance</mat-icon> Budget vs Actual</h3>
        @for (item of budgetItems(); track item.segment) {
          <div class="budget-row">
            <div class="budget-info">
              <span class="seg-name">{{ item.icon }} {{ item.name }}</span>
              <span class="budget-text">
                {{ item.spent | currencyInr }} / {{ item.limit | currencyInr }}
                <span class="pct" [class]="item.status">({{ item.pct }}%)</span>
              </span>
            </div>
            <mat-progress-bar
              mode="determinate"
              [value]="item.pct > 100 ? 100 : item.pct"
              [class]="item.status" />
          </div>
        }
      </mat-card>
    }
  `,
  styles: [`
    .budget-card { padding: 1.25rem; margin-bottom: 1rem; }
    h3 { margin: 0 0 1rem; font-size: 1rem; color: #1e293b; display: flex; align-items: center; gap: 8px; }
    .title-icon { font-size: 20px; width: 20px; height: 20px; color: #64748b; }
    .budget-row { margin-bottom: 14px; }
    .budget-row:last-child { margin-bottom: 0; }
    .budget-info { display: flex; justify-content: space-between; margin-bottom: 6px; }
    .seg-name { font-weight: 600; font-size: 0.9rem; color: #1e293b; }
    .budget-text { font-size: 0.8rem; color: #64748b; }
    .pct { font-weight: 700; margin-left: 4px; }
    .pct.safe { color: #16a34a; }
    .pct.warning { color: #d97706; }
    .pct.exceeded { color: #dc2626; }
    mat-progress-bar.safe { --mdc-linear-progress-active-indicator-color: #16a34a; }
    mat-progress-bar.warning { --mdc-linear-progress-active-indicator-color: #d97706; }
    mat-progress-bar.exceeded { --mdc-linear-progress-active-indicator-color: #dc2626; }
    @media (max-width: 480px) {
      .budget-info { flex-direction: column; gap: 2px; }
      .budget-text { font-size: 0.75rem; }
    }
  `],
})
export class BudgetWidgetComponent {
  @Input() segments: Segment[] = [];
  @Input() summaries: MonthlySummary[] = [];

  budgetItems(): { segment: string; name: string; icon: string; spent: number; limit: number; pct: number; status: string }[] {
    const items: any[] = [];
    for (const seg of this.segments) {
      const limit = seg.budgets?.monthlyExpenseLimit;
      if (!limit) continue;
      const summary = this.summaries.find(s => s.segment === seg.id);
      const spent = summary?.totalExpense || 0;
      const pct = Math.round((spent / limit) * 100);
      const status = pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'safe';
      items.push({ segment: seg.id, name: seg.name, icon: seg.icon, spent, limit, pct, status });
    }
    return items;
  }
}
