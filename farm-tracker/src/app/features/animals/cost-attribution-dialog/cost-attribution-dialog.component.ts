import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { AnimalService } from '../../../core/services/animal.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { ToastService } from '../../../core/services/toast.service';
import { Animal } from '../../../core/models/animal.model';
import { Transaction } from '../../../core/models/transaction.model';
import { AnimalSplitMode, computeCostSplits, daysActive } from '../../../core/utils/animal-cost.utils';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';

export interface CostAttributionDialogData {
  transaction: Transaction;
  segment: string;
}

@Component({
  selector: 'app-cost-attribution-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatIconModule, MatCheckboxModule, CurrencyInrPipe,
  ],
  template: `
    <h2 mat-dialog-title>Link Expense to Animals</h2>
    <mat-dialog-content>
      <div class="txn-info">
        Expense: <strong>{{ data.transaction.categoryName }}</strong> -
        {{ data.transaction.amount | currencyInr }}
      </div>

      @if (animals().length === 0) {
        <div class="empty">No active animals in this segment.</div>
      } @else {
        <div class="split-mode">
          <label class="field-label">Split Mode</label>
          <mat-select [ngModel]="splitMode()" (ngModelChange)="splitMode.set($event)">
            <mat-option value="equal">Equal split</mat-option>
            <mat-option value="by_days">Split by days active</mat-option>
            <mat-option value="custom">Custom amounts</mat-option>
          </mat-select>
        </div>

        @if (splitMode() === 'by_days') {
          <div class="split-hint">
            <mat-icon>info_outline</mat-icon>
            Animals active longer get a bigger share. Based on days from origin to expense date.
          </div>
        }

        <div class="animal-list">
          @for (animal of animals(); track animal.id) {
            <div class="animal-row" [class.selected]="isSelected(animal.id)">
              <div class="animal-info">
                <mat-checkbox [checked]="isSelected(animal.id)" (change)="toggleAnimal(animal.id)">
                  {{ animalService.getDisplayName(animal) }}
                  @if (animal.breed) {
                    <span class="breed">({{ animal.breed }})</span>
                  }
                </mat-checkbox>
                @if (splitMode() === 'by_days' && isSelected(animal.id)) {
                  <span class="days-info">{{ getDaysActive(animal) }} days</span>
                }
              </div>
              @if (splitMode() !== 'custom' && isSelected(animal.id)) {
                <span class="computed-amount">{{ previewSplits()[animal.id] || 0 | currencyInr }}</span>
              }
              @if (splitMode() === 'custom' && isSelected(animal.id)) {
                <mat-form-field appearance="outline" class="amount-field">
                  <input matInput type="number" [ngModel]="customAmounts()[animal.id] || 0"
                    (ngModelChange)="setCustomAmount(animal.id, $event)" min="0" />
                </mat-form-field>
              }
            </div>
          }
        </div>

        @if (selectedIds().length > 0) {
          <div class="summary" [class.over]="customOver()">
            <span>{{ selectedIds().length }} selected</span>
            @if (splitMode() === 'custom') {
              <span>{{ customTotal() | currencyInr }} / {{ data.transaction.amount | currencyInr }}</span>
            } @else {
              <span>{{ data.transaction.amount | currencyInr }} split</span>
            }
          </div>
        }
      }

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      @if (data.transaction.linkedAnimalIds?.length) {
        <button mat-button color="warn" [disabled]="saving()" (click)="unlink()">Unlink all</button>
      }
      <button mat-flat-button color="primary"
        [disabled]="saving() || selectedIds().length === 0 || customOver()"
        (click)="save()">
        {{ saving() ? 'Saving...' : 'Link' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .txn-info { margin-bottom: 16px; font-size: 0.95rem; }
    .split-mode { margin-bottom: 16px; }
    .field-label { display: block; font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .animal-list { max-height: 300px; overflow-y: auto; }
    .split-hint { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 12px; background: var(--color-bg); padding: 8px 12px; border-radius: 6px; }
    .split-hint mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    .animal-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--color-bg-alt); }
    .animal-row.selected { background: var(--color-income-bg); }
    .animal-info { display: flex; align-items: center; gap: 8px; flex: 1; }
    .breed { color: var(--color-purple); font-size: 0.8rem; }
    .days-info { font-size: 0.7rem; color: var(--color-text-secondary); background: var(--color-bg-alt); padding: 1px 6px; border-radius: 8px; }
    .computed-amount { font-size: 0.85rem; font-weight: 600; color: var(--color-expense); min-width: 70px; text-align: right; }
    .amount-field { width: 100px; margin-left: 8px; }
    .summary { display: flex; justify-content: space-between; padding: 12px 0; font-weight: 600; color: var(--color-text-subtle); border-top: 2px solid var(--color-border); margin-top: 8px; }
    .summary.over { color: var(--color-danger); }
    .empty { color: var(--color-text-secondary); padding: 1rem 0; }
    .error-msg { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
  `],
})
export class CostAttributionDialogComponent implements OnInit {
  data = inject<CostAttributionDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<CostAttributionDialogComponent>);
  animalService = inject(AnimalService);
  private transactionService = inject(TransactionService);
  private toast = inject(ToastService);

  animals = signal<Animal[]>([]);
  saving = signal(false);
  error = signal('');

  splitMode = signal<AnimalSplitMode>('equal');
  selectedIds = signal<string[]>([]);
  customAmounts = signal<Record<string, number>>({});

  /** Same split math the write path applies, so the preview always matches what is saved. */
  previewSplits = computed<Record<string, number>>(() => {
    const selected = this.selectedIds();
    const targets = selected
      .map(id => this.animals().find(a => a.id === id))
      .filter((a): a is Animal => !!a);
    return computeCostSplits(
      targets,
      this.data.transaction.amount,
      this.splitMode(),
      this.data.transaction.date.toDate(),
      this.customAmounts(),
    );
  });

  customTotal = computed(() =>
    this.selectedIds().reduce((s, id) => s + (this.customAmounts()[id] || 0), 0),
  );

  customOver = computed(() =>
    this.splitMode() === 'custom' && this.customTotal() > this.data.transaction.amount + 0.005,
  );

  async ngOnInit(): Promise<void> {
    try {
      this.animals.set(await this.animalService.getActiveBySegment(this.data.segment));
    } catch (err) {
      console.error('Failed to load animals', err);
      this.toast.error('Failed to load animals. Check your connection and try again.');
    }

    // Pre-select if already linked
    if (this.data.transaction.linkedAnimalIds?.length) {
      this.selectedIds.set([...this.data.transaction.linkedAnimalIds]);
      if (this.data.transaction.animalCostSplit) {
        this.splitMode.set('custom');
        this.customAmounts.set({ ...this.data.transaction.animalCostSplit });
      }
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  toggleAnimal(id: string): void {
    if (this.isSelected(id)) {
      this.selectedIds.set(this.selectedIds().filter(i => i !== id));
      this.customAmounts.update(amounts => {
        const next = { ...amounts };
        delete next[id];
        return next;
      });
    } else {
      this.selectedIds.set([...this.selectedIds(), id]);
    }
  }

  setCustomAmount(id: string, amount: number): void {
    this.customAmounts.update(amounts => ({ ...amounts, [id]: amount }));
  }

  getDaysActive(animal: Animal): number {
    return daysActive(animal.originDate, this.data.transaction.date.toDate());
  }

  async save(): Promise<void> {
    await this.commit(this.selectedIds());
  }

  async unlink(): Promise<void> {
    await this.commit([]);
  }

  /** One atomic write: txn link fields + timeline + every affected animal's ledger. */
  private async commit(animalIds: string[]): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      await this.transactionService.setAnimalAttribution(
        this.data.transaction.id,
        animalIds,
        this.splitMode(),
        this.splitMode() === 'custom' ? this.customAmounts() : undefined,
      );
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to link');
    } finally {
      this.saving.set(false);
    }
  }
}
