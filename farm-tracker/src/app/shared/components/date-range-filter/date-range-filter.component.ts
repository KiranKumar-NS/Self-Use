import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { getMonthString, getMonthName, shiftMonth } from '../../../core/utils/date.utils';

export type ViewMode = 'monthly' | 'custom' | 'alltime';

export interface DateRangeSelection {
  mode: ViewMode;
  month?: string;       // 'YYYY-MM' for monthly mode
  fromMonth?: string;   // 'YYYY-MM' for custom mode
  toMonth?: string;     // 'YYYY-MM' for custom mode
}

interface MonthOption { value: number; label: string; }
interface YearOption { value: number; }

@Component({
  selector: 'app-date-range-filter',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatFormFieldModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="date-range-filter">
      <mat-button-toggle-group [value]="viewMode()" (change)="onViewModeChange($event.value)" class="view-toggle">
        <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
        <mat-button-toggle value="custom">Custom</mat-button-toggle>
        <mat-button-toggle value="alltime">All Time</mat-button-toggle>
      </mat-button-toggle-group>

      @if (viewMode() === 'monthly') {
        <div class="month-nav">
          <button mat-icon-button (click)="prevMonth()" aria-label="Previous month"><mat-icon>chevron_left</mat-icon></button>
          <span class="month-label">{{ currentMonthLabel() }}</span>
          <button mat-icon-button (click)="nextMonth()" [disabled]="isCurrentMonth()" aria-label="Next month"><mat-icon>chevron_right</mat-icon></button>
          @if (!isCurrentMonth()) {
            <button mat-button class="today-btn" (click)="goToCurrentMonth()">Today</button>
          }
        </div>
      }

      @if (viewMode() === 'custom') {
        <div class="range-picker">
          <div class="range-group">
            <span class="range-group-label">From</span>
            <mat-form-field appearance="outline" class="year-field">
              <mat-label>Year</mat-label>
              <mat-select [value]="fromYear()" (selectionChange)="fromYear.set($event.value); emitCustomRange()">
                @for (y of years(); track y.value) {
                  <mat-option [value]="y.value">{{ y.value }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="month-field">
              <mat-label>Month</mat-label>
              <mat-select [value]="fromMonthNum()" (selectionChange)="fromMonthNum.set($event.value); emitCustomRange()">
                @for (m of months; track m.value) {
                  <mat-option [value]="m.value">{{ m.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
          <div class="range-group">
            <span class="range-group-label">To</span>
            <mat-form-field appearance="outline" class="year-field">
              <mat-label>Year</mat-label>
              <mat-select [value]="toYear()" (selectionChange)="toYear.set($event.value); emitCustomRange()">
                @for (y of years(); track y.value) {
                  <mat-option [value]="y.value">{{ y.value }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="month-field">
              <mat-label>Month</mat-label>
              <mat-select [value]="toMonthNum()" (selectionChange)="toMonthNum.set($event.value); emitCustomRange()">
                @for (m of months; track m.value) {
                  <mat-option [value]="m.value">{{ m.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          </div>
        </div>
      }

      @if (viewMode() === 'alltime') {
        <div class="alltime-label">
          <span class="month-label">All Time</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .date-range-filter { display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: var(--space-4); }
    .view-toggle { height: 36px; text-align: center; }
    .view-toggle mat-button-toggle { text-align: center; }
    .month-nav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .month-label { font-size: var(--font-lg); font-weight: 600; color: var(--color-text); min-width: 140px; text-align: center; }
    .today-btn { font-size: 0.8rem; color: var(--color-primary); }
    .range-picker { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .range-group { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
    .range-group-label { font-size: 0.8rem; font-weight: 600; color: var(--color-text-secondary); min-width: 36px; }
    .year-field { width: 100px; }
    .month-field { width: 130px; }
    .alltime-label { padding: 4px 0; }

    @media (max-width: 768px) {
      .view-toggle { width: 100%; }
      .view-toggle mat-button-toggle { flex: 1; }
      .month-label { min-width: 100px; font-size: 0.9rem; }
      .today-btn { font-size: 0.75rem; padding: 0 8px; }
      .range-picker { flex-direction: column; gap: 0.5rem; }
      .range-group { gap: 0.25rem; }
      .year-field { width: 90px; }
      .month-field { width: 110px; }
    }
  `],
})
export class DateRangeFilterComponent implements OnInit {
  defaultMode = input<ViewMode>('alltime');
  startYear = input(2024);
  rangeChange = output<DateRangeSelection>();

  viewMode = signal<ViewMode>('monthly');
  selectedMonth = signal(getMonthString(new Date()));
  currentMonthLabel = signal('');

  // Custom range state
  fromYear = signal(new Date().getFullYear());
  fromMonthNum = signal(1);
  toYear = signal(new Date().getFullYear());
  toMonthNum = signal(new Date().getMonth() + 1);

  years = signal<YearOption[]>([]);
  months: MonthOption[] = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  ngOnInit(): void {
    this.viewMode.set(this.defaultMode());
    this.buildYears();
    this.currentMonthLabel.set(getMonthName(this.selectedMonth()));
    this.emit();
  }

  onViewModeChange(mode: ViewMode): void {
    this.viewMode.set(mode);
    this.emit();
  }

  prevMonth(): void {
    this.selectedMonth.set(shiftMonth(this.selectedMonth(), -1));
    this.currentMonthLabel.set(getMonthName(this.selectedMonth()));
    this.emit();
  }

  nextMonth(): void {
    this.selectedMonth.set(shiftMonth(this.selectedMonth(), 1));
    this.currentMonthLabel.set(getMonthName(this.selectedMonth()));
    this.emit();
  }

  goToCurrentMonth(): void {
    this.selectedMonth.set(getMonthString(new Date()));
    this.currentMonthLabel.set(getMonthName(this.selectedMonth()));
    this.emit();
  }

  isCurrentMonth(): boolean {
    return this.selectedMonth() === getMonthString(new Date());
  }

  emitCustomRange(): void {
    this.emit();
  }

  private emit(): void {
    if (this.viewMode() === 'monthly') {
      this.rangeChange.emit({ mode: 'monthly', month: this.selectedMonth() });
    } else if (this.viewMode() === 'custom') {
      const from = `${this.fromYear()}-${this.fromMonthNum().toString().padStart(2, '0')}`;
      const to = `${this.toYear()}-${this.toMonthNum().toString().padStart(2, '0')}`;
      this.rangeChange.emit({ mode: 'custom', fromMonth: from, toMonth: to });
    } else {
      this.rangeChange.emit({ mode: 'alltime' });
    }
  }

  private buildYears(): void {
    const currentYear = new Date().getFullYear();
    const years: YearOption[] = [];
    for (let y = currentYear; y >= this.startYear(); y--) {
      years.push({ value: y });
    }
    this.years.set(years);
  }
}
