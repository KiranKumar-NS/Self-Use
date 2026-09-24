import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { TransactionService } from '../../core/services/transaction.service';
import { SegmentService } from '../../core/services/segment.service';
import { ToastService } from '../../core/services/toast.service';
import { Transaction, TransactionType } from '../../core/models/transaction.model';
import { Segment } from '../../core/models/segment.model';
import { CurrencyInrPipe } from '../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { sortData, toggleSortState, getSortIndicator, SortDirection } from '../../core/utils/table.utils';
import { safeLoad } from '../../core/utils/async.utils';
import { getMonthString } from '../../core/utils/date.utils';
import { buildMonthOptions, computeLedgerTotals, ledgerPeople, ledgerPersonName, quantityByUnit, formatQuantityByUnit } from '../../core/utils/ledger.utils';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-ledger-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, UpperCasePipe, CurrencyInrPipe,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatIconModule, MatFormFieldModule, MatSelectModule, MatTabsModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Ledger</h1>
        <p class="subtitle">Sales and expenses by segment</p>
      </div>
    </div>

    <!-- Segment tabs -->
    @if (segments().length > 0) {
      <mat-tab-group class="segment-tabs" [selectedIndex]="segmentIndex()" (selectedTabChange)="onSegmentChange($event.index)" animationDuration="0ms">
        @for (seg of segments(); track seg.id) {
          <mat-tab [label]="seg.icon + ' ' + seg.name" />
        }
      </mat-tab-group>
    }

    <!-- Sale / Expense sub-tabs -->
    <mat-tab-group class="type-tabs" [selectedIndex]="type() === 'income' ? 0 : 1" (selectedTabChange)="onTypeChange($event.index)" animationDuration="0ms">
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon class="tab-icon income">arrow_upward</mat-icon>
          Sale
        </ng-template>
      </mat-tab>
      <mat-tab>
        <ng-template mat-tab-label>
          <mat-icon class="tab-icon expense">arrow_downward</mat-icon>
          Expense
        </ng-template>
      </mat-tab>
    </mat-tab-group>

    <!-- Filters -->
    <mat-card class="filter-card">
      <div class="filters">
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Month</mat-label>
          <mat-select multiple [ngModel]="monthSelection()" (ngModelChange)="onMonthTick($event)" (openedChange)="onMonthPanelToggle($event)">
            <mat-option [value]="ALL_MONTHS">All months</mat-option>
            @for (m of monthOptions; track m.value) {
              <mat-option [value]="m.value">{{ m.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Person</mat-label>
          <mat-select [ngModel]="filterPerson()" (ngModelChange)="filterPerson.set($event)">
            <mat-option value="">All people</mat-option>
            @for (p of people(); track p) {
              <mat-option [value]="p">{{ p }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      </div>
      <p class="filter-hint">Tick one or more months (e.g. the last three), or "All months" for the full history.</p>
    </mat-card>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (loadFailed()) {
      <app-empty-state icon="⚠️" title="Couldn't load transactions" message="Check your connection and try again." actionLabel="Retry" (actionClick)="loadData()" />
    } @else if (segments().length === 0) {
      <app-empty-state icon="🗂️" title="No segments" message="No segments are available to you yet." />
    } @else if (displayedRows().length === 0) {
      <app-empty-state icon="📋" [title]="type() === 'income' ? 'No sales' : 'No expenses'" message="Nothing recorded for this segment with the current filters." />
    } @else {
      <mat-card class="table-card">
        <div class="table-container table-container--fixed">
          <table class="data-table data-table--wide ledger-table">
            <thead>
              <tr>
                <th class="sortable" (click)="toggleSort('date')" [attr.aria-sort]="ariaSort('date')">Date <span class="sort-icon">{{ getSortIcon('date') }}</span></th>
                <th>Status</th>
                <th class="sortable" (click)="toggleSort('categoryName')" [attr.aria-sort]="ariaSort('categoryName')">Category <span class="sort-icon">{{ getSortIcon('categoryName') }}</span></th>
                <th class="sortable" (click)="toggleSort('amount')" [attr.aria-sort]="ariaSort('amount')">Amount <span class="sort-icon">{{ getSortIcon('amount') }}</span></th>
                <th>Paid Via</th>
                <th class="sortable" (click)="toggleSort('paidByName')" [attr.aria-sort]="ariaSort('paidByName')">By <span class="sort-icon">{{ getSortIcon('paidByName') }}</span></th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              @for (txn of displayedRows(); track txn.id) {
                <tr (click)="viewDetail(txn.id)" class="clickable-row" [class.income-row]="txn.type === 'income'" [class.expense-row]="txn.type === 'expense'">
                  <td class="date-cell">{{ txn.date.toDate() | date:'dd MMM yyyy' }}</td>
                  <td class="status-cell">
                    @if (txn.type === 'income') {
                      <span class="dist-chip" [class]="getDistStatus(txn)">{{ getDistLabel(txn) }}</span>
                      @if (txn.paymentStatus === 'pending') {
                        <span class="pay-status-chip pending">Pending</span>
                      }
                    }
                    @if (txn.type === 'expense' && txn.expensePaymentStatus === 'pending') {
                      <span class="pay-status-chip credit">Credit</span>
                    }
                    @if (txn.type === 'expense' && txn.linkedSaleTransactionId) {
                      <span class="pay-status-chip sale-link" [title]="txn.linkedSaleLabel || 'Linked to sale'">Sale</span>
                    }
                    @if (txn.type === 'expense' && txn.expensePaymentStatus !== 'pending' && !txn.linkedSaleTransactionId) {
                      <span class="status-empty">—</span>
                    }
                  </td>
                  <td>{{ txn.categoryName }}</td>
                  <td class="amount-cell" [class]="txn.type">
                    {{ txn.amount | currencyInr }}
                    @if (txn.quantity) {
                      <span class="qty-info">{{ txn.quantity }} {{ txn.unit || '' }} × {{ txn.ratePerUnit | currencyInr }}/{{ txn.unit || 'unit' }}</span>
                    }
                  </td>
                  <td>
                    <span class="payment-badge" [class]="txn.paymentMethod || 'cash'">{{ (txn.paymentMethod || 'cash') | uppercase }}</span>
                  </td>
                  <td class="by-cell">{{ personName(txn) }}</td>
                  <td class="desc-cell">
                    {{ txn.description || '-' }}
                    @if (txn.tags?.length) {
                      <div class="tag-pills">
                        @for (tag of txn.tags; track tag) {
                          <span class="tag-pill">{{ tag }}</span>
                        }
                      </div>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <!-- Totals sit outside the horizontally scrolling table so they never need a sideways scroll -->
        <div class="totals" [class.income]="type() === 'income'" [class.expense]="type() === 'expense'">
          <span class="total-label">Total · {{ totals().count }} {{ totals().count === 1 ? 'record' : 'records' }}</span>
          <div class="total-figures">
            <div class="figure main"><span class="figure-label">Total</span><strong>{{ totals().total | currencyInr }}</strong></div>
            <div class="figure"><span class="figure-label">{{ type() === 'income' ? 'Received' : 'Paid' }}</span><strong>{{ totals().settled | currencyInr }}</strong></div>
            <div class="figure pending"><span class="figure-label">Pending</span><strong>{{ totals().pending | currencyInr }}</strong></div>
            @if (quantities().length > 0) {
              <div class="figure qty"><span class="figure-label">{{ type() === 'income' ? 'Sold' : 'Bought' }}</span><strong>{{ quantityLabel() }}</strong></div>
            }
          </div>
        </div>
      </mat-card>
    }
  `,
  styles: [`
    .segment-tabs { margin-bottom: 0.25rem; }
    .filter-hint { margin: 6px 0 0; font-size: var(--font-xs); color: var(--color-text-muted); }
    .type-tabs { margin-bottom: 1rem; }
    .tab-icon { margin-right: 8px; }
    .tab-icon.income { color: var(--color-income, #2e7d32); }
    .tab-icon.expense { color: var(--color-expense, #c62828); }

    .status-cell { white-space: nowrap; }
    .status-cell .dist-chip, .status-cell .pay-status-chip { margin-left: 0; margin-right: 4px; }
    .status-empty { color: var(--color-text-muted); }

    .amount-cell.expense { color: var(--color-expense); }
    .amount-cell.income { color: var(--color-income); }
    .qty-info { display: block; font-size: var(--font-xs); font-weight: 500; color: var(--color-text-muted); }

    .by-cell { font-size: 0.8rem; color: var(--color-text-subtle); white-space: nowrap; }
    .desc-cell { max-width: 180px; }
    .tag-pills { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
    .tag-pill { display: inline-block; padding: 1px 6px; background: var(--color-primary-light, var(--color-info-light)); color: var(--color-primary, var(--color-info)); border-radius: 10px; font-size: 0.6rem; font-weight: 600; }

    .income-row td:first-child { border-left: 3px solid var(--color-income); }
    .expense-row td:first-child { border-left: 3px solid var(--color-expense); }

    .dist-chip, .pay-status-chip {
      display: inline-block; margin-left: 6px; padding: 2px 6px;
      border-radius: var(--radius-sm); font-size: 0.6rem; font-weight: 700;
      text-transform: uppercase; vertical-align: middle;
    }
    .dist-chip.full { background: var(--color-income-bg); color: var(--color-income); }
    .dist-chip.partial { background: var(--color-warning-light); color: var(--color-warning); }
    .dist-chip.none { background: var(--color-bg-alt); color: var(--color-text-muted); }
    .pay-status-chip.pending { background: var(--color-expense-bg); color: var(--color-expense); }
    .pay-status-chip.credit { background: var(--color-warning-light); color: var(--color-warning); }
    .pay-status-chip.sale-link { background: var(--color-info-light); color: var(--color-info); }

    /* Totals bar below the table (outside the horizontal scroll area) */
    .totals {
      display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;
      padding: 12px 14px; border-top: 2px solid var(--color-border); background: var(--color-bg);
    }
    .total-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary); white-space: nowrap; }
    .total-figures { display: flex; gap: 1.5rem; flex-wrap: wrap; justify-content: flex-end; }
    .figure { display: flex; flex-direction: column; align-items: flex-end; }
    .figure-label { font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-muted); }
    .figure strong { font-size: 1rem; color: var(--color-text); }
    .figure.main strong { font-size: 1.2rem; }
    .totals.income .figure.main strong { color: var(--color-income); }
    .totals.expense .figure.main strong { color: var(--color-expense); }
    .figure.pending strong { color: var(--color-warning); }
    .figure.qty strong { color: var(--color-text-secondary); font-size: 0.9rem; }

    @media (max-width: 768px) {
      /* Stack: one figure per line, label left / value right */
      .totals { flex-direction: column; align-items: stretch; gap: 0.5rem; }
      .total-figures { flex-direction: column; gap: 0.35rem; }
      .figure { flex-direction: row; justify-content: space-between; align-items: baseline; gap: 0.75rem; }
      .figure strong { text-align: right; overflow-wrap: anywhere; }
    }
  `],
})
export class LedgerPageComponent implements OnInit {
  private transactionService = inject(TransactionService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private toast = inject(ToastService);

  segments = signal<Segment[]>([]);
  segmentIndex = signal(0);
  type = signal<TransactionType>('income');
  readonly ALL_MONTHS = '__all__';
  /** Selected months ('YYYY-MM'); empty = all months */
  filterMonths = signal<string[]>([getMonthString(new Date())]);
  /** What the dropdown shows ticked: the months, or the "All months" option when none are chosen */
  monthSelection = signal<string[]>(this.filterMonths().length ? this.filterMonths() : [this.ALL_MONTHS]);
  /** Selection being edited while the month panel is open; applied when it closes */
  pendingMonths: string[] | null = null;
  filterPerson = signal('');
  rows = signal<Transaction[]>([]);
  loading = signal(true);
  loadFailed = signal(false);
  sortColumn = signal('');
  sortDirection = signal<SortDirection>('asc');

  readonly monthOptions = buildMonthOptions();

  people = computed<string[]>(() => ledgerPeople(this.rows()));

  displayedRows = computed<Transaction[]>(() => {
    const type = this.type();
    const person = this.filterPerson();
    const months = this.filterMonths();
    let filtered = this.rows().filter(t => t.type === type);
    if (months.length > 0) filtered = filtered.filter(t => months.includes(t.month));
    if (person) filtered = filtered.filter(t => ledgerPersonName(t) === person);
    return sortData(filtered, this.sortColumn(), this.sortDirection());
  });

  totals = computed(() => computeLedgerTotals(this.displayedRows()));
  /** Quantities per unit over the displayed rows (e.g. kg sold), for the footer */
  quantities = computed(() => quantityByUnit(this.displayedRows()));
  quantityLabel = computed(() => formatQuantityByUnit(this.quantities()));

  async ngOnInit(): Promise<void> {
    const ok = await safeLoad(this.loading, async () => {
      // Every segment the user may view, active or not — an inactive segment can still hold history
      this.segments.set(await this.segmentService.getAll());
    }, this.toast);
    if (!ok) { this.loadFailed.set(true); return; }
    await this.loadData();
  }

  async onSegmentChange(index: number): Promise<void> {
    if (index === this.segmentIndex()) return;
    this.segmentIndex.set(index);
    await this.loadData();
  }

  onTypeChange(index: number): void {
    this.type.set(index === 0 ? 'income' : 'expense');
  }

  /** "All months" and specific months are mutually exclusive; nothing ticked falls back to "All months" */
  onMonthTick(values: string[]): void {
    const prev = this.monthSelection();
    const hadAll = prev.includes(this.ALL_MONTHS);
    const hasAll = values.includes(this.ALL_MONTHS);
    let months: string[];
    if (hasAll && !hadAll) months = [];                                   // just ticked "All months"
    else months = values.filter(v => v !== this.ALL_MONTHS);              // ticked a month (drops "All months")
    this.monthSelection.set(months.length ? months : [this.ALL_MONTHS]);
    this.pendingMonths = months;
  }

  /** Reload once when the month panel closes, not on every tick */
  async onMonthPanelToggle(opened: boolean): Promise<void> {
    if (opened || this.pendingMonths === null) return;
    const next = [...this.pendingMonths].sort().reverse();
    this.pendingMonths = null;
    const current = this.filterMonths();
    if (next.length === current.length && next.every((m, i) => m === current[i])) return;
    this.filterMonths.set(next);
    await this.loadData();
  }

  async loadData(): Promise<void> {
    const segment = this.segments()[this.segmentIndex()];
    if (!segment) {
      this.rows.set([]);
      this.loading.set(false);
      return;
    }
    const months = this.filterMonths();
    // Up to 30 months go to the server as an `in` query; beyond that (or none) load the whole segment
    const filters: { segment: string; months?: string[] } = { segment: segment.id };
    if (months.length > 0 && months.length <= 30) filters.months = months;

    const ok = await safeLoad(this.loading, async () => {
      // One fetch for both Sale and Expense (no type filter) — both query shapes
      // are covered by existing composite indexes. Page through to the end so
      // the footer totals are exact, with a hard cap as a safety net.
      const all = await this.transactionService.getAllPages(filters);
      this.rows.set(all);
      // Drop a person filter that no longer matches any loaded row
      if (this.filterPerson() && !ledgerPeople(all).includes(this.filterPerson())) {
        this.filterPerson.set('');
      }
    }, this.toast);
    this.loadFailed.set(!ok);
  }

  personName(txn: Transaction): string {
    return ledgerPersonName(txn);
  }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn(), direction: this.sortDirection() }, column);
    this.sortColumn.set(state.column);
    this.sortDirection.set(state.direction);
  }

  getSortIcon(column: string): string {
    return getSortIndicator(this.sortColumn(), this.sortDirection(), column);
  }

  ariaSort(column: string): string | null {
    if (this.sortColumn() !== column) return null;
    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  viewDetail(id: string): void {
    this.router.navigate(['/transactions', id]);
  }

  getDistStatus(txn: Transaction): string {
    if (!txn.distributions?.length) return 'none';
    const total = txn.distributions.reduce((s, d) => s + d.amount, 0);
    return total >= txn.amount ? 'full' : 'partial';
  }

  getDistLabel(txn: Transaction): string {
    const status = this.getDistStatus(txn);
    if (status === 'full') return 'Distributed';
    if (status === 'partial') return 'Partial';
    return 'Undistributed';
  }
}
