import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MarketPriceService } from '../../core/services/market-price.service';
import { SummaryService } from '../../core/services/summary.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { MarketPrice } from '../../core/models/market-price.model';
import { SaleUnit } from '../../core/models/transaction.model';
import { CurrencyInrPipe } from '../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorMessagePipe } from '../../shared/pipes/error-message.pipe';
import { safeLoad } from '../../core/utils/async.utils';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';

interface RateComparison {
  product: string;
  myQty: number;
  myAvgRate: number;
  marketRate: number | null;
  marketDate: Date | null;
  diffPct: number | null;
}

@Component({
  selector: 'app-market-prices-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, CurrencyInrPipe, ErrorMessagePipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatSelectModule, MatInputModule, MatDatepickerModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Market Prices</h1>
        <p class="subtitle">Record market rates and compare with your sale rates</p>
      </div>
    </div>

    @if (canEdit()) {
      <mat-card class="entry-card">
        <form #f="ngForm" (ngSubmit)="save(f.valid)">
          <div class="entry-grid">
            <mat-form-field appearance="outline">
              <mat-label>Date</mat-label>
              <input matInput [matDatepicker]="dp" [(ngModel)]="date" name="date" required [max]="today" #dateModel="ngModel" />
              <mat-datepicker-toggle matIconSuffix [for]="dp" />
              <mat-datepicker #dp />
              <mat-error>{{ dateModel.errors | errorMessage }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Product</mat-label>
              <input matInput [(ngModel)]="product" name="product" required placeholder="e.g. tomato, goat, milk" #productModel="ngModel" />
              <mat-error>{{ productModel.errors | errorMessage }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Price</mat-label>
              <input matInput type="number" [(ngModel)]="price" name="price" required min="1" #priceModel="ngModel" />
              <mat-error>{{ priceModel.errors | errorMessage }}</mat-error>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Per</mat-label>
              <mat-select [(ngModel)]="unit" name="unit" required>
                @for (u of units; track u) {
                  <mat-option [value]="u">{{ u }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Market (optional)</mat-label>
              <input matInput [(ngModel)]="market" name="market" placeholder="e.g. local mandi" />
            </mat-form-field>

            <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
              <mat-icon>add</mat-icon> {{ saving() ? 'Saving…' : 'Add Price' }}
            </button>
          </div>
        </form>
      </mat-card>
    }

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      @if (comparison().length > 0) {
        <mat-card class="table-card">
          <h3 class="section-title">My Rate vs Market ({{ currentYear }})</h3>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>My Qty Sold</th>
                  <th>My Avg Rate</th>
                  <th>Latest Market Rate</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                @for (c of comparison(); track c.product) {
                  <tr>
                    <td class="product-cell">{{ c.product }}</td>
                    <td>{{ c.myQty }}</td>
                    <td>{{ c.myAvgRate | currencyInr }}</td>
                    <td>
                      @if (c.marketRate != null) {
                        {{ c.marketRate | currencyInr }}
                        <span class="date-hint">{{ c.marketDate | date:'dd MMM' }}</span>
                      } @else { — }
                    </td>
                    <td>
                      @if (c.diffPct != null) {
                        <span class="diff" [class.above]="c.diffPct >= 0" [class.below]="c.diffPct < 0">
                          {{ c.diffPct >= 0 ? '+' : '' }}{{ c.diffPct.toFixed(1) }}%
                        </span>
                      } @else { — }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="hint">My Avg Rate comes from this year's sales with a product set on the transaction.</p>
        </mat-card>
      }

      @if (prices().length === 0) {
        <app-empty-state icon="📈" title="No market prices yet" message="Record market rates to compare against your own sale rates over time." />
      } @else {
        <mat-card class="table-card">
          <h3 class="section-title">Recent Market Prices</h3>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Rate</th>
                  <th>Market</th>
                  @if (auth.isAdmin()) { <th></th> }
                </tr>
              </thead>
              <tbody>
                @for (p of prices(); track p.id) {
                  <tr>
                    <td>{{ p.date.toDate() | date:'dd MMM yyyy' }}</td>
                    <td class="product-cell">{{ p.product }}</td>
                    <td>{{ p.price | currencyInr }}/{{ p.unit }}</td>
                    <td>{{ p.market || '-' }}</td>
                    @if (auth.isAdmin()) {
                      <td>
                        <button mat-icon-button color="warn" (click)="remove(p)" aria-label="Delete market price">
                          <mat-icon>delete</mat-icon>
                        </button>
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </mat-card>
      }
    }
  `,
  styles: [`
    .entry-card { padding: 1rem; margin-bottom: 1rem; }
    .entry-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; align-items: center; }
    .section-title { margin: 0 0 0.75rem; font-size: var(--font-lg); }
    .table-card { padding: 1rem; margin-bottom: 1rem; }
    .product-cell { font-weight: 600; text-transform: capitalize; }
    .date-hint { display: block; font-size: var(--font-xs); color: var(--color-text-muted); }
    .diff.above { color: var(--color-income); font-weight: 700; }
    .diff.below { color: var(--color-expense); font-weight: 700; }
    .hint { font-size: var(--font-xs); color: var(--color-text-muted); margin: 0.5rem 0 0; }
    @media (max-width: 768px) {
      .entry-grid { grid-template-columns: 1fr 1fr; }
    }
  `],
})
export class MarketPricesPageComponent implements OnInit {
  private marketPriceService = inject(MarketPriceService);
  private summaryService = inject(SummaryService);
  private toast = inject(ToastService);
  auth = inject(AuthService);

  readonly units: SaleUnit[] = ['kg', 'head', 'dozen', 'litre', 'pieces', 'bag', 'bundle'];
  readonly today = new Date();
  readonly currentYear = new Date().getFullYear();

  loading = signal(true);
  saving = signal(false);
  prices = signal<MarketPrice[]>([]);
  private mySales = signal<{ qty: Record<string, number>; amt: Record<string, number> }>({ qty: {}, amt: {} });

  canEdit = computed(() => this.auth.isAdmin() || this.auth.isManager());

  // form model
  date = signal<Date>(new Date());
  product = signal('');
  price = signal<number | null>(null);
  unit = signal<SaleUnit>('kg');
  market = signal('');

  comparison = computed<RateComparison[]>(() => {
    const { qty, amt } = this.mySales();
    const latestByProduct = new Map<string, MarketPrice>();
    for (const p of this.prices()) {
      if (!latestByProduct.has(p.product)) latestByProduct.set(p.product, p);
    }
    return Object.keys(qty)
      .filter(product => qty[product] > 0)
      .map(product => {
        const myAvgRate = amt[product] / qty[product];
        const marketEntry = latestByProduct.get(product) ?? null;
        return {
          product,
          myQty: Math.round(qty[product] * 10) / 10,
          myAvgRate: Math.round(myAvgRate * 100) / 100,
          marketRate: marketEntry?.price ?? null,
          marketDate: marketEntry?.date.toDate() ?? null,
          diffPct: marketEntry ? ((myAvgRate - marketEntry.price) / marketEntry.price) * 100 : null,
        };
      })
      .sort((a, b) => b.myQty * b.myAvgRate - a.myQty * a.myAvgRate);
  });

  async ngOnInit(): Promise<void> {
    await safeLoad(this.loading, async () => {
      const [prices, yearSummaries] = await Promise.all([
        this.marketPriceService.getRecent(),
        this.summaryService.getForYear(this.currentYear),
      ]);
      this.prices.set(prices);

      const qty: Record<string, number> = {};
      const amt: Record<string, number> = {};
      for (const s of yearSummaries) {
        for (const [product, q] of Object.entries(s.salesQtyByProduct ?? {})) {
          qty[product] = (qty[product] || 0) + q;
        }
        for (const [product, a] of Object.entries(s.salesAmtByProduct ?? {})) {
          amt[product] = (amt[product] || 0) + a;
        }
      }
      this.mySales.set({ qty, amt });
    }, this.toast);
  }

  async save(valid: boolean | null): Promise<void> {
    if (!valid || !this.price()) return;
    this.saving.set(true);
    try {
      await this.marketPriceService.create({
        date: this.date(),
        product: this.product(),
        price: this.price()!,
        unit: this.unit(),
        market: this.market() || undefined,
      });
      this.toast.success('Market price recorded');
      this.product.set('');
      this.price.set(null);
      this.market.set('');
      this.prices.set(await this.marketPriceService.getRecent());
    } catch (err) {
      console.error('Failed to save market price', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to save market price');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(p: MarketPrice): Promise<void> {
    try {
      await this.marketPriceService.softDelete(p.id);
      this.prices.update(list => list.filter(x => x.id !== p.id));
      this.toast.success('Market price deleted');
    } catch (err) {
      console.error('Failed to delete market price', err);
      this.toast.error('Failed to delete market price');
    }
  }
}
