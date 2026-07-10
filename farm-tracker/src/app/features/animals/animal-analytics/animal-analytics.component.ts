import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AnimalService } from '../../../core/services/animal.service';
import { BuyerService } from '../../../core/services/buyer.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { SegmentService } from '../../../core/services/segment.service';
import { ToastService } from '../../../core/services/toast.service';
import { Animal } from '../../../core/models/animal.model';
import { Buyer } from '../../../core/models/buyer.model';
import { Transaction } from '../../../core/models/transaction.model';
import { Segment } from '../../../core/models/segment.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { LoadingSkeletonComponent } from '../../../shared/components/loading-skeleton/loading-skeleton.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';

interface MonthlyTrend {
  month: string;
  label: string;
  totalSales: number;
  totalQuantity: number;
  avgRate: number;
  txnCount: number;
}

interface SegmentSales {
  segment: string;
  segmentName: string;
  totalRevenue: number;
  totalExpense: number;
  profit: number;
  txnCount: number;
}

interface CategorySales {
  category: string;
  amount: number;
  count: number;
  pct: number;
}

@Component({
  selector: 'app-animal-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, CurrencyInrPipe, LoadingSpinnerComponent, LoadingSkeletonComponent, MatCardModule, MatButtonModule, MatIconModule, MatTabsModule],
  template: `
    <div class="page-header">
      <h1>Sales & Cost Analytics</h1>
      <button mat-button (click)="back()">
        <mat-icon>arrow_back</mat-icon> Back to Animals
      </button>
    </div>

    @if (loading()) {
      <app-loading-skeleton type="cards" [count]="5" />
      <app-loading-skeleton type="table" [count]="5" />
    } @else {
      @if (!fullHistory()) {
        <div class="history-banner">
          <mat-icon>info</mat-icon>
          <span>Showing the last 12 months of transactions.</span>
          <button mat-button color="primary" (click)="loadFullHistory()" [disabled]="loadingHistory()">
            {{ loadingHistory() ? 'Loading…' : 'Load full history' }}
          </button>
        </div>
      }
      <!-- Overall Summary Cards -->
      <div class="stats-grid">
        <mat-card class="stat-card">
          <div class="stat-value income">{{ overallIncome() | currencyInr }}</div>
          <div class="stat-label">Total Sales Revenue</div>
        </mat-card>
        <mat-card class="stat-card">
          <div class="stat-value expense">{{ overallExpense() | currencyInr }}</div>
          <div class="stat-label">Total Expenses</div>
        </mat-card>
        <mat-card class="stat-card">
          <div class="stat-value" [class.positive]="overallProfit() > 0" [class.negative]="overallProfit() < 0">
            {{ overallProfit() | currencyInr }}
          </div>
          <div class="stat-label">Net Profit</div>
        </mat-card>
        <mat-card class="stat-card">
          <div class="stat-value">{{ totalActive() }}</div>
          <div class="stat-label">Active Animals</div>
        </mat-card>
        <mat-card class="stat-card">
          <div class="stat-value">{{ totalSold() }}</div>
          <div class="stat-label">Animals Sold</div>
        </mat-card>
      </div>

      <mat-tab-group>
        <!-- Sale Trends -->
        <mat-tab label="Sale Trends">
          <mat-card class="tab-card">
            <h3 class="tab-title">Monthly Sales (All Segments)</h3>
            @if (monthlyTrends().length === 0) {
              <div class="empty">No sale data yet.</div>
            } @else {
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Sales Count</th>
                      <th>Total Qty</th>
                      <th>Revenue</th>
                      <th>Avg Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (t of monthlyTrends(); track t.month) {
                      <tr>
                        <td><strong>{{ t.label }}</strong></td>
                        <td>{{ t.txnCount }}</td>
                        <td>{{ t.totalQuantity ? t.totalQuantity.toFixed(1) : '-' }}</td>
                        <td class="income">{{ t.totalSales | currencyInr }}</td>
                        <td>{{ t.avgRate ? (t.avgRate | currencyInr) : '-' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <!-- Visual bars -->
              <div class="trend-bars">
                @for (t of monthlyTrends(); track t.month) {
                  <div class="trend-row">
                    <span class="trend-label">{{ t.label }}</span>
                    <div class="trend-bar-container">
                      <div class="trend-bar-fill" [style.width.%]="trendPct(t.totalSales)"></div>
                    </div>
                    <span class="trend-amount">{{ t.totalSales | currencyInr }}</span>
                  </div>
                }
              </div>
            }
          </mat-card>
        </mat-tab>

        <!-- Revenue by Segment -->
        <mat-tab label="By Segment">
          <mat-card class="tab-card">
            <h3 class="tab-title">Revenue & Expense by Segment</h3>
            @if (segmentSales().length === 0) {
              <div class="empty">No data yet.</div>
            } @else {
              <div class="segment-cards">
                @for (s of segmentSales(); track s.segment) {
                  <mat-card class="segment-card">
                    <div class="segment-name">{{ s.segmentName }}</div>
                    <div class="segment-stats">
                      <div class="seg-stat">
                        <span class="seg-label">Revenue</span>
                        <span class="seg-value income">{{ s.totalRevenue | currencyInr }}</span>
                      </div>
                      <div class="seg-stat">
                        <span class="seg-label">Expense</span>
                        <span class="seg-value expense">{{ s.totalExpense | currencyInr }}</span>
                      </div>
                      <div class="seg-stat">
                        <span class="seg-label">Profit</span>
                        <span class="seg-value" [class.positive]="s.profit > 0" [class.negative]="s.profit < 0">
                          {{ s.profit | currencyInr }}
                        </span>
                      </div>
                      <div class="seg-stat">
                        <span class="seg-label">Transactions</span>
                        <span class="seg-value">{{ s.txnCount }}</span>
                      </div>
                    </div>
                  </mat-card>
                }
              </div>
            }
          </mat-card>
        </mat-tab>

        <!-- By Category -->
        <mat-tab label="By Category">
          <mat-card class="tab-card">
            <h3 class="tab-title">Income by Source</h3>
            @if (incomeByCat().length === 0) {
              <div class="empty">No income data yet.</div>
            } @else {
              <div class="breakdown-grid">
                @for (item of incomeByCat(); track item.category) {
                  <div class="breakdown-item">
                    <span class="breakdown-label">{{ item.category }}</span>
                    <span class="breakdown-value income">{{ item.amount | currencyInr }}</span>
                    <div class="breakdown-bar">
                      <div class="bar-fill income-bar" [style.width.%]="item.pct"></div>
                    </div>
                    <span class="breakdown-pct">{{ item.pct.toFixed(0) }}%</span>
                  </div>
                }
              </div>
            }

            <h3 class="tab-title" style="margin-top: 2rem">Expense by Category</h3>
            @if (expenseByCat().length === 0) {
              <div class="empty">No expense data yet.</div>
            } @else {
              <div class="breakdown-grid">
                @for (item of expenseByCat(); track item.category) {
                  <div class="breakdown-item">
                    <span class="breakdown-label">{{ item.category }}</span>
                    <span class="breakdown-value expense">{{ item.amount | currencyInr }}</span>
                    <div class="breakdown-bar">
                      <div class="bar-fill expense-bar" [style.width.%]="item.pct"></div>
                    </div>
                    <span class="breakdown-pct">{{ item.pct.toFixed(0) }}%</span>
                  </div>
                }
              </div>
            }
          </mat-card>
        </mat-tab>

        <!-- Animal Profit -->
        <mat-tab label="Animal Profit">
          <mat-card class="tab-card">
            <h3 class="tab-title">Profit per Sold Animal</h3>
            @if (soldAnimals().length === 0) {
              <div class="empty">No sold animals yet.</div>
            } @else {
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Animal</th>
                      <th>Segment</th>
                      <th>Breed</th>
                      <th>Purchase</th>
                      <th>Costs</th>
                      <th>Invested</th>
                      <th>Sale Price</th>
                      <th>Profit</th>
                      <th>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of soldAnimals(); track a.id) {
                      <tr class="clickable-row" (click)="viewAnimal(a.id)">
                        <td><strong>{{ animalService.getDisplayName(a) }}</strong></td>
                        <td>{{ a.segmentName }}</td>
                        <td class="breed-cell">{{ a.breed || '-' }}</td>
                        <td>{{ a.purchasePrice || 0 | currencyInr }}</td>
                        <td>{{ a.totalCosts | currencyInr }}</td>
                        <td>{{ a.totalInvested | currencyInr }}</td>
                        <td class="income">{{ a.salePrice | currencyInr }}</td>
                        <td [class.positive]="(a.profit || 0) > 0" [class.negative]="(a.profit || 0) < 0">
                          {{ a.profit | currencyInr }}
                        </td>
                        <td [class.positive]="(a.profitMargin || 0) > 0" [class.negative]="(a.profitMargin || 0) < 0">
                          {{ a.profitMargin?.toFixed(1) }}%
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <!-- Unit Economics -->
              <h3 class="tab-title" style="margin-top: 2rem">Unit Economics (Animals)</h3>
              <div class="economics-grid">
                <div class="econ-card">
                  <div class="econ-label">Avg Purchase Price</div>
                  <div class="econ-value">{{ avgPurchasePrice() | currencyInr }}</div>
                  <div class="econ-sub">per head</div>
                </div>
                <div class="econ-card">
                  <div class="econ-label">Avg Cost to Raise</div>
                  <div class="econ-value">{{ avgCostToRaise() | currencyInr }}</div>
                  <div class="econ-sub">per head</div>
                </div>
                <div class="econ-card">
                  <div class="econ-label">Avg Sale Price</div>
                  <div class="econ-value income">{{ avgSalePrice() | currencyInr }}</div>
                  <div class="econ-sub">per head</div>
                </div>
                <div class="econ-card">
                  <div class="econ-label">Avg Profit</div>
                  <div class="econ-value" [class.positive]="avgProfitPerHead() > 0" [class.negative]="avgProfitPerHead() < 0">
                    {{ avgProfitPerHead() | currencyInr }}
                  </div>
                  <div class="econ-sub">per head</div>
                </div>
              </div>
            }
          </mat-card>
        </mat-tab>

        <!-- By Buyer -->
        <mat-tab label="By Buyer">
          <mat-card class="tab-card">
            <h3 class="tab-title">Revenue by Buyer</h3>
            @if (buyers().length === 0) {
              <div class="empty">No buyer data yet.</div>
            } @else {
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Buyer</th>
                      <th>Purchases</th>
                      <th>Total Paid</th>
                      <th>Avg Rate</th>
                      <th>Last Purchase</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (b of buyers(); track b.id) {
                      <tr class="clickable-row" (click)="viewBuyer(b.id)">
                        <td><strong>{{ b.name }}</strong></td>
                        <td>{{ b.totalPurchases }}</td>
                        <td class="income">{{ b.totalAmountPaid | currencyInr }}</td>
                        <td>{{ b.averageRate ? (b.averageRate | currencyInr) : '-' }}</td>
                        <td class="date-cell">{{ b.lastPurchaseDate ? (b.lastPurchaseDate.toDate() | date:'dd MMM yyyy') : '-' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </mat-card>
        </mat-tab>

        <!-- Seasonal -->
        <mat-tab label="Seasonal">
          <mat-card class="tab-card">
            <h3 class="tab-title">Monthly Pattern (Income vs Expense)</h3>
            @if (seasonalData().length === 0) {
              <div class="empty">Not enough data for seasonal analysis.</div>
            } @else {
              <div class="seasonal-grid">
                @for (m of seasonalData(); track m.monthNum) {
                  <div class="seasonal-card" [class.best-month]="m.isBestIncome" [class.worst-month]="m.isHighestExpense">
                    <div class="seasonal-month">{{ m.monthName }}</div>
                    <div class="seasonal-row">
                      <span class="seasonal-label">Income</span>
                      <span class="seasonal-value income">{{ m.avgIncome | currencyInr }}</span>
                    </div>
                    <div class="seasonal-row">
                      <span class="seasonal-label">Expense</span>
                      <span class="seasonal-value expense">{{ m.avgExpense | currencyInr }}</span>
                    </div>
                    <div class="seasonal-row">
                      <span class="seasonal-label">Net</span>
                      <span class="seasonal-value" [class.positive]="m.avgNet > 0" [class.negative]="m.avgNet < 0">
                        {{ m.avgNet | currencyInr }}
                      </span>
                    </div>
                    @if (m.isBestIncome) {
                      <div class="seasonal-badge best">Best Sales</div>
                    }
                    @if (m.isHighestExpense) {
                      <div class="seasonal-badge worst">Highest Costs</div>
                    }
                  </div>
                }
              </div>
            }
          </mat-card>
        </mat-tab>

        <!-- Animal Cost Breakdown -->
        <mat-tab label="Cost Attribution">
          <mat-card class="tab-card">
            <h3 class="tab-title">Cost Breakdown (Attributed to Animals)</h3>
            @if (animalCostBreakdown().length === 0) {
              <div class="empty">No cost data attributed to animals yet.</div>
            } @else {
              <div class="breakdown-grid">
                @for (item of animalCostBreakdown(); track item.category) {
                  <div class="breakdown-item">
                    <span class="breakdown-label">{{ item.category }}</span>
                    <span class="breakdown-value expense">{{ item.amount | currencyInr }}</span>
                    <div class="breakdown-bar">
                      <div class="bar-fill expense-bar" [style.width.%]="item.pct"></div>
                    </div>
                    <span class="breakdown-pct">{{ item.pct.toFixed(0) }}%</span>
                  </div>
                }
              </div>
            }
          </mat-card>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .history-banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; margin-bottom: 1rem; border-radius: 8px; background: var(--color-bg-subtle, rgba(0,0,0,0.04)); font-size: var(--font-sm); color: var(--color-text-muted); flex-wrap: wrap; }
    .history-banner mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .stats-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.75rem; margin-bottom: 1.5rem; }
    .stat-card { padding: 1rem; text-align: center; }
    .stat-value { font-size: 1.4rem; font-weight: 700; }
    .stat-label { font-size: var(--font-xs); color: var(--color-text-muted); text-transform: uppercase; font-weight: 600; }
    .income { color: var(--color-income); }
    .expense { color: var(--color-expense); }
    .positive { color: var(--color-income); }
    .negative { color: var(--color-expense); }

    .tab-card { margin-top: 16px; padding: 1rem; }
    .tab-title { margin: 0 0 1rem; font-size: 1rem; color: var(--color-text); }
    .empty { padding: 1rem; color: var(--color-text-secondary); }
    .breed-cell { color: var(--color-purple); font-weight: 500; font-size: 0.85rem; }

    /* Trend bars */
    .trend-bars { margin-top: 1.5rem; }
    .trend-row { display: grid; grid-template-columns: 80px 1fr 100px; gap: 12px; align-items: center; padding: 6px 0; }
    .trend-label { font-size: 0.8rem; color: var(--color-text-subtle); font-weight: 600; }
    .trend-bar-container { height: 20px; background: var(--color-bg-alt); border-radius: 4px; overflow: hidden; }
    .trend-bar-fill { height: 100%; background: linear-gradient(90deg, var(--color-income), var(--color-accent)); border-radius: 4px; transition: width 0.3s; min-width: 2px; }
    .trend-amount { font-size: 0.8rem; font-weight: 600; color: var(--color-income); text-align: right; }

    /* Segment cards */
    .segment-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
    .segment-card { padding: 1.25rem; border-left: 4px solid var(--color-primary); }
    .segment-name { font-size: 1.1rem; font-weight: 700; margin-bottom: 12px; color: var(--color-text); }
    .segment-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .seg-stat { display: flex; flex-direction: column; }
    .seg-label { font-size: 0.65rem; color: var(--color-text-muted); text-transform: uppercase; font-weight: 600; }
    .seg-value { font-size: 1.1rem; font-weight: 700; }

    /* Breakdown bars */
    .breakdown-grid { display: flex; flex-direction: column; gap: 12px; }
    .breakdown-item { display: grid; grid-template-columns: 150px 100px 1fr 50px; gap: 12px; align-items: center; }
    .breakdown-label { font-weight: 600; font-size: 0.9rem; }
    .breakdown-value { font-weight: 600; }
    .breakdown-bar { height: 8px; background: var(--color-bg-alt); border-radius: 4px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
    .income-bar { background: var(--color-income); }
    .expense-bar { background: var(--color-expense); }
    .breakdown-pct { color: var(--color-text-muted); font-size: 0.8rem; text-align: right; }

    /* Economics */
    .economics-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
    .econ-card { text-align: center; padding: 1.5rem; border: 1px solid var(--color-border); border-radius: 12px; }
    .econ-label { font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
    .econ-value { font-size: 1.5rem; font-weight: 700; }
    .econ-sub { font-size: 0.7rem; color: var(--color-text-muted); margin-top: 4px; }

    /* Seasonal */
    .seasonal-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
    .seasonal-card { padding: 1rem; border: 1px solid var(--color-border); border-radius: 10px; position: relative; }
    .seasonal-card.best-month { border-color: var(--color-income); background: var(--color-income-bg); }
    .seasonal-card.worst-month { border-color: var(--color-expense); background: var(--color-expense-bg); }
    .seasonal-month { font-weight: 700; font-size: 0.9rem; margin-bottom: 8px; color: var(--color-text); }
    .seasonal-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
    .seasonal-label { font-size: 0.65rem; color: var(--color-text-muted); text-transform: uppercase; font-weight: 600; }
    .seasonal-value { font-size: 0.85rem; font-weight: 600; }
    .seasonal-badge { position: absolute; top: -8px; right: 8px; font-size: 0.6rem; font-weight: 700; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
    .seasonal-badge.best { background: var(--color-income); color: white; }
    .seasonal-badge.worst { background: var(--color-expense); color: white; }

    .form-card { margin: 0 auto; }
    @media (max-width: 1024px) {
      .stats-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 768px) {
      .stats-grid { grid-template-columns: repeat(3, 1fr); }
      .economics-grid { grid-template-columns: 1fr 1fr; }
      .breakdown-item { grid-template-columns: 100px 80px 1fr 40px; }
      .seasonal-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 480px) {
      .stats-grid { grid-template-columns: 1fr 1fr; }
      .economics-grid { grid-template-columns: 1fr; }
      .seasonal-grid { grid-template-columns: 1fr 1fr; }
      .trend-row { grid-template-columns: 60px 1fr 80px; }
    }
  `],
})
export class AnimalAnalyticsComponent implements OnInit {
  animalService = inject(AnimalService);
  private buyerService = inject(BuyerService);
  private transactionService = inject(TransactionService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private toast = inject(ToastService);

  allAnimals = signal<Animal[]>([]);
  buyers = signal<Buyer[]>([]);
  allTransactions = signal<Transaction[]>([]);
  segments = signal<Segment[]>([]);
  loading = signal(true);
  fullHistory = signal(false);
  loadingHistory = signal(false);

  // --- Overall ---
  overallIncome = computed(() =>
    this.allTransactions().filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  );
  overallExpense = computed(() =>
    this.allTransactions().filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  );
  overallProfit = computed(() => this.overallIncome() - this.overallExpense());

  // --- Animals ---
  soldAnimals = computed(() => this.allAnimals().filter(a => a.status === 'sold'));
  totalActive = computed(() => this.allAnimals().filter(a => a.status === 'active').length);
  totalSold = computed(() => this.soldAnimals().length);

  // --- Monthly Sale Trends (all income txns) ---
  monthlyTrends = computed<MonthlyTrend[]>(() => {
    const incomeTxns = this.allTransactions().filter(t => t.type === 'income');
    const monthMap: Record<string, { total: number; qty: number; count: number; rateSum: number; rateCount: number }> = {};

    for (const t of incomeTxns) {
      if (!monthMap[t.month]) monthMap[t.month] = { total: 0, qty: 0, count: 0, rateSum: 0, rateCount: 0 };
      monthMap[t.month].total += t.amount;
      monthMap[t.month].count++;
      if (t.quantity) monthMap[t.month].qty += t.quantity;
      if (t.ratePerUnit) { monthMap[t.month].rateSum += t.ratePerUnit; monthMap[t.month].rateCount++; }
    }

    return Object.entries(monthMap)
      .map(([month, data]) => ({
        month,
        label: this.formatMonth(month),
        totalSales: data.total,
        totalQuantity: data.qty,
        avgRate: data.rateCount > 0 ? Math.round(data.rateSum / data.rateCount) : 0,
        txnCount: data.count,
      }))
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12);
  });

  private maxTrend = computed(() => {
    const trends = this.monthlyTrends();
    return trends.length > 0 ? Math.max(...trends.map(t => t.totalSales)) : 1;
  });

  trendPct(amount: number): number {
    return this.maxTrend() > 0 ? (amount / this.maxTrend()) * 100 : 0;
  }

  // --- Revenue by Segment ---
  segmentSales = computed<SegmentSales[]>(() => {
    const segMap: Record<string, SegmentSales> = {};
    for (const t of this.allTransactions()) {
      if (!segMap[t.segment]) {
        segMap[t.segment] = { segment: t.segment, segmentName: t.segmentName, totalRevenue: 0, totalExpense: 0, profit: 0, txnCount: 0 };
      }
      if (t.type === 'income') segMap[t.segment].totalRevenue += t.amount;
      else segMap[t.segment].totalExpense += t.amount;
      segMap[t.segment].txnCount++;
    }
    return Object.values(segMap)
      .map(s => ({ ...s, profit: s.totalRevenue - s.totalExpense }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);
  });

  // --- Income by Category ---
  incomeByCat = computed<CategorySales[]>(() => this.buildCatBreakdown('income'));
  expenseByCat = computed<CategorySales[]>(() => this.buildCatBreakdown('expense'));

  // --- Animal Cost Breakdown ---
  animalCostBreakdown = computed<CategorySales[]>(() => {
    const categoryMap: Record<string, number> = {};
    for (const animal of this.allAnimals()) {
      for (const entry of animal.costEntries) {
        categoryMap[entry.categoryName] = (categoryMap[entry.categoryName] || 0) + entry.amount;
      }
    }
    const total = Object.values(categoryMap).reduce((s, v) => s + v, 0);
    return Object.entries(categoryMap)
      .map(([category, amount]) => ({ category, amount, count: 0, pct: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  });

  // --- Seasonal (avg per calendar month) ---
  seasonalData = computed(() => {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthData: Record<number, { income: number[]; expense: number[] }> = {};
    for (let i = 0; i < 12; i++) monthData[i] = { income: [], expense: [] };

    // Group by calendar month across years
    const txnsByYearMonth: Record<string, { income: number; expense: number }> = {};
    for (const t of this.allTransactions()) {
      const key = t.month; // format: "2026-03"
      if (!txnsByYearMonth[key]) txnsByYearMonth[key] = { income: 0, expense: 0 };
      if (t.type === 'income') txnsByYearMonth[key].income += t.amount;
      else txnsByYearMonth[key].expense += t.amount;
    }

    for (const [ym, data] of Object.entries(txnsByYearMonth)) {
      const monthIdx = parseInt(ym.split('-')[1], 10) - 1;
      if (monthIdx >= 0 && monthIdx < 12) {
        monthData[monthIdx].income.push(data.income);
        monthData[monthIdx].expense.push(data.expense);
      }
    }

    const results = Object.entries(monthData)
      .filter(([, data]) => data.income.length > 0 || data.expense.length > 0)
      .map(([idx, data]) => {
        const monthNum = parseInt(idx, 10);
        const avgIncome = data.income.length > 0 ? Math.round(data.income.reduce((s, v) => s + v, 0) / data.income.length) : 0;
        const avgExpense = data.expense.length > 0 ? Math.round(data.expense.reduce((s, v) => s + v, 0) / data.expense.length) : 0;
        return {
          monthNum,
          monthName: monthNames[monthNum],
          avgIncome,
          avgExpense,
          avgNet: avgIncome - avgExpense,
          isBestIncome: false,
          isHighestExpense: false,
        };
      });

    if (results.length > 0) {
      const bestIncome = Math.max(...results.map(r => r.avgIncome));
      const highestExpense = Math.max(...results.map(r => r.avgExpense));
      for (const r of results) {
        if (r.avgIncome === bestIncome && bestIncome > 0) r.isBestIncome = true;
        if (r.avgExpense === highestExpense && highestExpense > 0) r.isHighestExpense = true;
      }
    }

    return results;
  });

  // --- Animal Unit Economics ---
  avgPurchasePrice = computed(() => {
    const purchased = this.allAnimals().filter(a => a.origin === 'purchase' && a.purchasePrice);
    if (purchased.length === 0) return 0;
    return Math.round(purchased.reduce((s, a) => s + (a.purchasePrice || 0), 0) / purchased.length);
  });

  avgCostToRaise = computed(() => {
    const withCosts = this.allAnimals().filter(a => a.totalCosts > 0);
    if (withCosts.length === 0) return 0;
    return Math.round(withCosts.reduce((s, a) => s + a.totalCosts, 0) / withCosts.length);
  });

  avgSalePrice = computed(() => {
    const sold = this.soldAnimals();
    if (sold.length === 0) return 0;
    return Math.round(sold.reduce((s, a) => s + (a.salePrice || 0), 0) / sold.length);
  });

  avgProfitPerHead = computed(() => {
    const sold = this.soldAnimals();
    if (sold.length === 0) return 0;
    return Math.round(sold.reduce((s, a) => s + (a.profit || 0), 0) / sold.length);
  });

  async ngOnInit(): Promise<void> {
    try {
      const [animals, buyers, segments] = await Promise.all([
        this.animalService.getAll(),
        this.buyerService.getAll(),
        this.segmentService.getAll(),
      ]);

      // Default to the last 12 months; "Load full history" fetches the rest on demand
      const dateFrom = new Date();
      dateFrom.setMonth(dateFrom.getMonth() - 12);
      const txns = await this.fetchTransactions({ dateFrom });

      this.allAnimals.set(animals);
      this.buyers.set(buyers.filter(b => b.totalPurchases > 0));
      this.segments.set(segments);
      this.allTransactions.set(txns);
    } catch (err) {
      console.error('Failed to load analytics data', err);
      this.toast.error('Failed to load data. Check your connection and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadFullHistory(): Promise<void> {
    if (this.fullHistory() || this.loadingHistory()) return;
    this.loadingHistory.set(true);
    try {
      this.allTransactions.set(await this.fetchTransactions({}));
      this.fullHistory.set(true);
    } catch (err) {
      console.error('Failed to load full history', err);
      this.toast.error('Failed to load full history. Please try again.');
    } finally {
      this.loadingHistory.set(false);
    }
  }

  private async fetchTransactions(filters: { dateFrom?: Date }): Promise<Transaction[]> {
    let txns: Transaction[] = [];
    let lastDoc: any = null;
    let hasMore = true;
    while (hasMore) {
      const result = await this.transactionService.getAll(filters, 200, lastDoc);
      txns = [...txns, ...result.transactions];
      lastDoc = result.lastDoc;
      hasMore = result.transactions.length === 200;
    }
    return txns;
  }

  private buildCatBreakdown(type: 'income' | 'expense'): CategorySales[] {
    const catMap: Record<string, { amount: number; count: number }> = {};
    for (const t of this.allTransactions().filter(t => t.type === type)) {
      if (!catMap[t.categoryName]) catMap[t.categoryName] = { amount: 0, count: 0 };
      catMap[t.categoryName].amount += t.amount;
      catMap[t.categoryName].count++;
    }
    const total = Object.values(catMap).reduce((s, v) => s + v.amount, 0);
    return Object.entries(catMap)
      .map(([category, data]) => ({ category, amount: data.amount, count: data.count, pct: total > 0 ? (data.amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }

  private formatMonth(month: string): string {
    const [year, m] = month.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${names[parseInt(m, 10) - 1]} ${year}`;
  }

  viewAnimal(id: string): void { this.router.navigate(['/stock', id]); }
  viewBuyer(id: string): void { this.router.navigate(['/buyers', id]); }
  back(): void { this.router.navigate(['/stock']); }
}
