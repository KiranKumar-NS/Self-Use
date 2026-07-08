import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { AnimalService } from '../../../core/services/animal.service';
import { Animal } from '../../../core/models/animal.model';
import { Transaction } from '../../../core/models/transaction.model';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';

export interface CostAttributionDialogData {
  transaction: Transaction;
  segment: string;
}

@Component({
  selector: 'app-cost-attribution-dialog',
  standalone: true,
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
          <mat-select [(ngModel)]="splitMode" (selectionChange)="onSplitModeChange()">
            <mat-option value="equal">Equal split</mat-option>
            <mat-option value="by_days">Split by days active</mat-option>
            <mat-option value="custom">Custom amounts</mat-option>
          </mat-select>
        </div>

        @if (splitMode === 'by_days') {
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
                @if (splitMode === 'by_days' && isSelected(animal.id)) {
                  <span class="days-info">{{ getDaysActive(animal) }} days</span>
                }
              </div>
              @if (splitMode === 'by_days' && isSelected(animal.id)) {
                <span class="computed-amount">{{ getByDaysAmount(animal.id) | currencyInr }}</span>
              }
              @if (splitMode === 'custom' && isSelected(animal.id)) {
                <mat-form-field appearance="outline" class="amount-field">
                  <input matInput type="number" [ngModel]="customAmounts[animal.id] || 0"
                    (ngModelChange)="customAmounts[animal.id] = $event" min="0" />
                </mat-form-field>
              }
            </div>
          }
        </div>

        @if (selectedIds.length > 0) {
          <div class="summary">
            <span>{{ selectedIds.length }} selected</span>
            @if (splitMode === 'equal') {
              <span>{{ perAnimalAmount() | currencyInr }} each</span>
            } @else if (splitMode === 'by_days') {
              <span>{{ data.transaction.amount | currencyInr }} (proportional)</span>
            } @else {
              <span>{{ customTotal() | currencyInr }} / {{ data.transaction.amount | currencyInr }}</span>
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
      <button mat-flat-button color="primary"
        [disabled]="saving() || selectedIds.length === 0"
        (click)="save()">
        {{ saving() ? 'Saving...' : 'Link' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .txn-info { margin-bottom: 16px; font-size: 0.95rem; }
    .split-mode { margin-bottom: 16px; }
    .field-label { display: block; font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 4px; }
    .animal-list { max-height: 300px; overflow-y: auto; }
    .split-hint { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: #64748b; margin-bottom: 12px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; }
    .split-hint mat-icon { font-size: 18px; width: 18px; height: 18px; flex-shrink: 0; }
    .animal-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
    .animal-row.selected { background: #f0fdf4; }
    .animal-info { display: flex; align-items: center; gap: 8px; flex: 1; }
    .breed { color: #7c3aed; font-size: 0.8rem; }
    .days-info { font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 1px 6px; border-radius: 8px; }
    .computed-amount { font-size: 0.85rem; font-weight: 600; color: var(--color-expense); min-width: 70px; text-align: right; }
    .amount-field { width: 100px; margin-left: 8px; }
    .summary { display: flex; justify-content: space-between; padding: 12px 0; font-weight: 600; color: var(--color-text-subtle); border-top: 2px solid #e2e8f0; margin-top: 8px; }
    .empty { color: #64748b; padding: 1rem 0; }
    .error-msg { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
  `],
})
export class CostAttributionDialogComponent implements OnInit {
  data = inject<CostAttributionDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<CostAttributionDialogComponent>);
  animalService = inject(AnimalService);
  private firestore = inject(Firestore);

  animals = signal<Animal[]>([]);
  saving = signal(false);
  error = signal('');

  splitMode: 'equal' | 'custom' | 'by_days' = 'equal';
  selectedIds: string[] = [];
  customAmounts: Record<string, number> = {};
  private byDaysAmounts: Record<string, number> = {};

  async ngOnInit(): Promise<void> {
    this.animals.set(await this.animalService.getActiveBySegment(this.data.segment));

    // Pre-select if already linked
    if (this.data.transaction.linkedAnimalIds?.length) {
      this.selectedIds = [...this.data.transaction.linkedAnimalIds];
      if (this.data.transaction.animalCostSplit) {
        this.splitMode = 'custom';
        this.customAmounts = { ...this.data.transaction.animalCostSplit };
      }
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIds.includes(id);
  }

  toggleAnimal(id: string): void {
    if (this.isSelected(id)) {
      this.selectedIds = this.selectedIds.filter(i => i !== id);
      delete this.customAmounts[id];
    } else {
      this.selectedIds.push(id);
    }
    if (this.splitMode === 'by_days') this.recalcByDays();
  }

  onSplitModeChange(): void {
    if (this.splitMode === 'by_days') {
      this.recalcByDays();
    }
  }

  getDaysActive(animal: Animal): number {
    const expenseDate = this.data.transaction.date.toDate().getTime();
    const originMs = animal.originDate.toDate().getTime();
    return Math.max(1, Math.ceil((expenseDate - originMs) / (1000 * 60 * 60 * 24)));
  }

  getByDaysAmount(animalId: string): number {
    return this.byDaysAmounts[animalId] || 0;
  }

  private recalcByDays(): void {
    this.byDaysAmounts = {};
    if (this.selectedIds.length === 0) return;

    const totalAmount = this.data.transaction.amount;
    let totalDays = 0;
    const daysByAnimal: Record<string, number> = {};

    for (const id of this.selectedIds) {
      const animal = this.animals().find(a => a.id === id);
      if (!animal) continue;
      const days = this.getDaysActive(animal);
      daysByAnimal[id] = days;
      totalDays += days;
    }

    if (totalDays === 0) return;

    let allocated = 0;
    for (let i = 0; i < this.selectedIds.length; i++) {
      const id = this.selectedIds[i];
      if (i === this.selectedIds.length - 1) {
        this.byDaysAmounts[id] = Math.round((totalAmount - allocated) * 100) / 100;
      } else {
        const share = Math.round(((daysByAnimal[id] || 1) / totalDays) * totalAmount * 100) / 100;
        this.byDaysAmounts[id] = share;
        allocated += share;
      }
    }
  }

  perAnimalAmount(): number {
    if (this.selectedIds.length === 0) return 0;
    return Math.round((this.data.transaction.amount / this.selectedIds.length) * 100) / 100;
  }

  customTotal(): number {
    return Object.values(this.customAmounts).reduce((s, v) => s + (v || 0), 0);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');

    try {
      const txn = this.data.transaction;

      // Remove old attributions first
      if (txn.linkedAnimalIds?.length) {
        for (const oldId of txn.linkedAnimalIds) {
          await this.animalService.removeCost(oldId, txn.id);
        }
      }

      // Apply new attributions
      const animalNames = this.selectedIds.map(id => {
        const a = this.animals().find(x => x.id === id);
        return a ? this.animalService.getDisplayName(a) : id;
      });

      await this.animalService.attributeCost(
        this.selectedIds,
        txn.id,
        {
          category: txn.category,
          categoryName: txn.categoryName,
          date: txn.date.toDate(),
          totalAmount: txn.amount,
          description: txn.description,
        },
        this.splitMode,
        this.splitMode === 'custom' ? this.customAmounts : undefined
      );

      // Store the computed splits for reference
      const actualSplits = this.splitMode === 'by_days' ? this.byDaysAmounts
        : this.splitMode === 'custom' ? this.customAmounts : undefined;

      // Update the transaction document with linked animal IDs
      const txnRef = doc(this.firestore, 'transactions', txn.id);
      const txnUpdates: Record<string, any> = {
        linkedAnimalIds: this.selectedIds,
        linkedAnimalNames: animalNames,
      };
      if (actualSplits) {
        txnUpdates['animalCostSplit'] = actualSplits;
      }
      await updateDoc(txnRef, txnUpdates);

      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to link');
    } finally {
      this.saving.set(false);
    }
  }
}
