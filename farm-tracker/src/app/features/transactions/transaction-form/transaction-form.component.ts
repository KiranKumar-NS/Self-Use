import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../../core/services/transaction.service';
import { AuthService } from '../../../core/services/auth.service';
import { CategoryService } from '../../../core/services/category.service';
import { SegmentService } from '../../../core/services/segment.service';
import { UserService } from '../../../core/services/user.service';
import { Category } from '../../../core/models/category.model';
import { Segment } from '../../../core/models/segment.model';
import { AppUser } from '../../../core/models/user.model';
import { TransactionFormData, PaymentMethod, IncomePaymentStatus, ExpensePaymentStatus, SaleUnit } from '../../../core/models/transaction.model';
import { AnimalService } from '../../../core/services/animal.service';
import { Animal } from '../../../core/models/animal.model';

import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { getMonthString, getYear } from '../../../core/utils/date.utils';
import { normalizeName, nameKey } from '../../../core/utils/name.utils';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';

import { MatRadioModule } from '@angular/material/radio';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatButtonModule, MatDatepickerModule, MatRadioModule,
    MatIconModule, MatCheckboxModule, MatAutocompleteModule, MatSnackBarModule,
  ],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit' : 'Add' }} Transaction</h1>
    </div>

    <mat-card class="form-card">
      @if (error()) {
        <div class="error-message">{{ error() }}</div>
      }

      <form (ngSubmit)="save()">
        <div class="form-row">
          <mat-radio-group [(ngModel)]="type" name="type" (change)="onTypeChange()">
            <mat-radio-button value="expense">Expense</mat-radio-button>
            <mat-radio-button value="income">Income</mat-radio-button>
          </mat-radio-group>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Date</mat-label>
            <input matInput [matDatepicker]="picker" [(ngModel)]="date" name="date" [max]="today" required />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
            <mat-error>Required</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Amount (INR)</mat-label>
            <input matInput type="number" [(ngModel)]="amount" name="amount" required min="1" />
            <mat-error>Required</mat-error>
          </mat-form-field>
        </div>

        <!-- Quantity / Unit / Rate -->
        <div class="form-row qty-row">
          <mat-form-field appearance="outline">
            <mat-label>Quantity (optional)</mat-label>
            <input matInput type="number" [(ngModel)]="quantity" name="quantity" min="0" step="0.1" (ngModelChange)="onQtyRateChange()" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Unit</mat-label>
            <mat-select [(ngModel)]="unit" name="unit">
              <mat-option value="">-</mat-option>
              <mat-option value="kg">Kg</mat-option>
              <mat-option value="head">Head</mat-option>
              <mat-option value="dozen">Dozen</mat-option>
              <mat-option value="litre">Litre</mat-option>
              <mat-option value="pieces">Pieces</mat-option>
              <mat-option value="bag">Bag</mat-option>
              <mat-option value="bundle">Bundle</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Rate/Unit (₹)</mat-label>
            <input matInput type="number" [(ngModel)]="ratePerUnit" name="ratePerUnit" min="0" step="0.5" (ngModelChange)="onQtyRateChange()" />
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Segment</mat-label>
            <mat-select [(ngModel)]="segment" name="segment" required (selectionChange)="loadActiveAnimals()">
              @for (seg of filteredSegments(); track seg.id) {
                <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
              }
            </mat-select>
            <mat-error>Required</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Category</mat-label>
            <mat-select [(ngModel)]="category" name="category" required>
              @for (cat of filteredCategories(); track cat.id) {
                <mat-option [value]="cat.id">{{ cat.name }}</mat-option>
              }
            </mat-select>
            <mat-error>Required</mat-error>
          </mat-form-field>
        </div>

        <!-- Payment Method -->
        <div class="form-row">
          <div class="payment-method-group">
            <label class="field-label">Payment Method</label>
            <mat-radio-group [(ngModel)]="paymentMethod" name="paymentMethod">
              <mat-radio-button value="cash">Cash</mat-radio-button>
              <mat-radio-button value="upi">UPI</mat-radio-button>
            </mat-radio-group>
          </div>
        </div>

        <!-- Payment Status (income only) -->
        @if (type === 'income') {
          <div class="form-row">
            <div class="payment-method-group">
              <label class="field-label">Payment Status</label>
              <mat-radio-group [(ngModel)]="paymentStatus" name="paymentStatus">
                <mat-radio-button value="received">Received</mat-radio-button>
                <mat-radio-button value="pending">Pending</mat-radio-button>
              </mat-radio-group>
            </div>
          </div>
        }

        <!-- Expense Payment Status -->
        @if (type === 'expense') {
          <div class="form-row">
            <div class="payment-method-group">
              <label class="field-label">Payment Status</label>
              <mat-radio-group [(ngModel)]="expensePaymentStatus" name="expensePaymentStatus">
                <mat-radio-button value="paid">Paid</mat-radio-button>
                <mat-radio-button value="pending">Pending (Credit)</mat-radio-button>
              </mat-radio-group>
            </div>
          </div>
        }

        <!-- Paid By -->
        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ type === 'expense' ? 'Paid By' : 'Received By' }}</mat-label>
            <mat-select [(ngModel)]="paidBy" name="paidBy" (selectionChange)="onPaidByChange()">
              @for (u of users(); track u.uid) {
                <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
              }
              <mat-option value="other">Other (type name)</mat-option>
            </mat-select>
          </mat-form-field>

          @if (paidBy === 'other') {
            <mat-form-field appearance="outline">
              <mat-label>Enter Name</mat-label>
              <input matInput [(ngModel)]="customPaidByName" name="customPaidByName" required placeholder="e.g. Raju" (ngModelChange)="checkSimilarName()" />
              @if (suggestedName) {
                <mat-hint class="name-hint">Did you mean <button type="button" class="hint-btn" (click)="useSuggestedName()">{{ suggestedName }}</button>?</mat-hint>
              }
            </mat-form-field>
          }
        </div>

        <!-- Link to Animals (expense + animal segment) -->
        @if (type === 'expense' && isAnimalSegment()) {
          <div class="animal-link-section">
            <div class="section-header" (click)="animalSectionOpen = !animalSectionOpen">
              <mat-icon>pets</mat-icon>
              <span>Link to Animals (optional)</span>
              @if (selectedAnimalIds.length > 0) {
                <span class="link-count">{{ selectedAnimalIds.length }} linked</span>
              }
              <mat-icon class="toggle-icon" [class.expanded]="animalSectionOpen">expand_more</mat-icon>
            </div>
            @if (animalSectionOpen) {
              <div class="split-row">
                <label class="field-label">Split</label>
                <mat-select [(ngModel)]="animalSplitMode" name="animalSplitMode" class="split-select">
                  <mat-option value="equal">Equal</mat-option>
                  <mat-option value="by_days">By days active</mat-option>
                </mat-select>
                @if (animalSplitMode === 'by_days') {
                  <span class="split-hint">Older animals get bigger share</span>
                }
              </div>
              <div class="animal-list">
                @if (activeAnimals().length === 0) {
                  <div class="no-animals">No active animals in this segment.</div>
                } @else {
                  @for (animal of activeAnimals(); track animal.id) {
                    <div class="animal-row">
                      <mat-checkbox [checked]="isAnimalSelected(animal.id)" (change)="toggleAnimalSelection(animal.id)">
                        {{ animalService.getDisplayName(animal) }}
                        @if (animal.breed) {
                          <span class="breed-tag">({{ animal.breed }})</span>
                        }
                      </mat-checkbox>
                    </div>
                  }
                }
              </div>
            }
          </div>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea matInput [(ngModel)]="description" name="description" rows="3"></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Tags (optional, comma-separated)</mat-label>
          <input matInput [(ngModel)]="tagsInput" name="tags"
            placeholder="e.g. q3-harvest-2026, plot-alpha"
            [matAutocomplete]="tagAuto"
            (input)="onTagInput()" />
          <button mat-icon-button matSuffix type="button" (click)="fillAutoTags()" title="Auto-generate tags">
            <mat-icon>auto_awesome</mat-icon>
          </button>
          <mat-autocomplete #tagAuto="matAutocomplete" (optionSelected)="addTag($event.option.value)">
            @for (tag of filteredTagSuggestions(); track tag) {
              <mat-option [value]="tag">{{ tag }}</mat-option>
            }
          </mat-autocomplete>
          <mat-hint>Group transactions for crop/harvest tracking</mat-hint>
        </mat-form-field>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Transaction' }}
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: var(--color-text); }
    .form-card { max-width: 700px; padding: 1.5rem; margin: 0 auto; }
    .form-row { display: flex; gap: 1rem; margin-bottom: 0.5rem; }
    .form-row mat-form-field { flex: 1; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .error-message { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    mat-radio-group { display: flex; gap: 1rem; }
    .payment-method-group {
      display: flex; flex-direction: column; gap: 6px; margin-bottom: 0.5rem;
    }
    .field-label {
      font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; font-weight: 600;
    }
    .name-hint { color: var(--color-primary); font-size: 0.8rem; }
    .hint-btn {
      background: none; border: none; color: var(--color-primary); font-weight: 700;
      cursor: pointer; text-decoration: underline; padding: 0; font-size: 0.8rem;
    }
    .animal-link-section {
      border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; margin-bottom: 16px;
    }
    .section-header {
      display: flex; align-items: center; gap: 8px; cursor: pointer;
      font-size: 0.85rem; color: var(--color-text-subtle); font-weight: 600;
    }
    .section-header .toggle-icon { margin-left: auto; transition: transform 0.2s; font-size: 20px; width: 20px; height: 20px; }
    .section-header .toggle-icon.expanded { transform: rotate(180deg); }
    .link-count { font-size: 0.7rem; background: var(--color-primary); color: white; padding: 1px 8px; border-radius: 10px; }
    .split-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .split-select { width: 140px; }
    .split-hint { font-size: 0.7rem; color: var(--color-text-secondary); font-style: italic; }
    .animal-list { margin-top: 8px; max-height: 200px; overflow-y: auto; }
    .animal-row { padding: 4px 0; border-bottom: 1px solid var(--color-bg-alt); }
    .breed-tag { color: var(--color-purple); font-size: 0.8rem; }
    .no-animals { color: var(--color-text-muted); font-size: 0.85rem; padding: 8px 0; }
    @media (max-width: 640px) {
      .form-row { flex-direction: column; gap: 0.5rem; }
      .qty-row { flex-direction: row; flex-wrap: wrap; }
      .qty-row mat-form-field:nth-child(1) { flex: 2; min-width: 0; }
      .qty-row mat-form-field:nth-child(2) { flex: 1; min-width: 80px; }
      .qty-row mat-form-field:nth-child(3) { flex: 2; min-width: 0; }
      .form-card { padding: 1rem; }
    }
  `],
})
export class TransactionFormComponent implements OnInit, HasUnsavedChanges {
  private transactionService = inject(TransactionService);
  private authService = inject(AuthService);
  private categoryService = inject(CategoryService);
  private segmentService = inject(SegmentService);
  private userService = inject(UserService);
  animalService = inject(AnimalService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private snackBar = inject(MatSnackBar);

  isEdit = signal(false);
  error = signal('');
  saving = signal(false);
  private saved = false;

  type: 'expense' | 'income' = 'expense';
  today = new Date();
  date = new Date();
  amount = 0;
  quantity: number | null = null;
  unit: SaleUnit | '' = '';
  ratePerUnit: number | null = null;
  segment = '';
  category = '';
  description = '';
  tagsInput = '';
  paidBy = '';
  customPaidByName = '';
  paymentMethod: PaymentMethod = 'upi';
  paymentStatus: IncomePaymentStatus = 'received';
  expensePaymentStatus: ExpensePaymentStatus = 'paid';

  allCategories = signal<Category[]>([]);
  allSegments = signal<Segment[]>([]);
  users = signal<AppUser[]>([]);
  filteredCategories = signal<Category[]>([]);
  filteredSegments = signal<Segment[]>([]);

  suggestedName = '';
  private knownNames: string[] = [];
  private knownTags: string[] = [];
  filteredTagSuggestions = signal<string[]>([]);
  private editId = '';

  // Animal linking
  animalSectionOpen = false;
  activeAnimals = signal<Animal[]>([]);
  selectedAnimalIds: string[] = [];
  oldLinkedAnimalIds: string[] = [];
  animalSplitMode: 'equal' | 'by_days' = 'equal';

  async ngOnInit(): Promise<void> {
    const [categories, segments, users] = await Promise.all([
      this.categoryService.getAll(),
      this.segmentService.getAll(),
      this.userService.getAll(),
    ]);

    this.allCategories.set(categories);
    this.allSegments.set(segments);
    this.users.set(users.filter((u) => u.isActive));
    this.paidBy = this.authService.currentUser()?.uid || '';

    // Load known custom names for duplicate detection
    try {
      const recent = await this.transactionService.getAll({}, 200);
      this.knownNames = [...new Set(
        recent.transactions
          .filter(t => t.paidBy === 'other' && t.paidByName)
          .map(t => t.paidByName!)
      )];
      this.knownTags = [...new Set(
        recent.transactions.flatMap(t => t.tags || [])
      )].sort();
    } catch {}

    // Filter segments by user access
    const accessibleSegments = this.authService.isAdmin()
      ? segments
      : segments.filter((s) => this.authService.assignedSegments().includes(s.id));
    this.filteredSegments.set(accessibleSegments);
    this.onTypeChange();

    // Check if editing
    this.editId = this.route.snapshot.params['id'];
    if (this.editId) {
      this.isEdit.set(true);
      const txn = await this.transactionService.getById(this.editId);
      if (txn) {
        this.type = txn.type;
        this.date = txn.date.toDate();
        this.amount = txn.amount;
        this.segment = txn.segment;
        this.category = txn.category;
        this.description = txn.description;
        // Check if paidBy is a registered user or custom name
        const isRegisteredUser = this.users().some((u) => u.uid === txn.paidBy);
        if (isRegisteredUser) {
          this.paidBy = txn.paidBy || '';
        } else {
          this.paidBy = 'other';
          this.customPaidByName = txn.paidByName || '';
        }
        this.quantity = txn.quantity || null;
        this.unit = txn.unit || '';
        this.ratePerUnit = txn.ratePerUnit || null;
        this.paymentMethod = txn.paymentMethod || 'cash';
        this.paymentStatus = txn.paymentStatus || 'received';
        this.expensePaymentStatus = txn.expensePaymentStatus || 'paid';
        this.tagsInput = txn.tags?.join(', ') || '';
        this.onTypeChange();

        // Load existing animal links
        if (txn.linkedAnimalIds?.length) {
          this.selectedAnimalIds = [...txn.linkedAnimalIds];
          this.oldLinkedAnimalIds = [...txn.linkedAnimalIds];
          await this.loadActiveAnimals();
        }
      }
    }
  }

  onPaidByChange(): void {
    if (this.paidBy !== 'other') {
      this.customPaidByName = '';
      this.suggestedName = '';
    }
  }

  checkSimilarName(): void {
    this.suggestedName = '';
    if (!this.customPaidByName || this.customPaidByName.trim().length < 2) return;
    const inputKey = nameKey(this.customPaidByName);
    const match = this.knownNames.find(n => nameKey(n) === inputKey && n !== this.customPaidByName);
    if (match) this.suggestedName = match;
  }

  useSuggestedName(): void {
    this.customPaidByName = this.suggestedName;
    this.suggestedName = '';
  }

  isAnimalSegment(): boolean {
    const seg = this.allSegments().find(s => s.id === this.segment);
    return seg?.segmentType === 'animal';
  }

  isAnimalSelected(id: string): boolean {
    return this.selectedAnimalIds.includes(id);
  }

  toggleAnimalSelection(id: string): void {
    if (this.isAnimalSelected(id)) {
      this.selectedAnimalIds = this.selectedAnimalIds.filter(i => i !== id);
    } else {
      this.selectedAnimalIds.push(id);
    }
  }

  async loadActiveAnimals(): Promise<void> {
    if (this.segment && this.isAnimalSegment()) {
      this.activeAnimals.set(await this.animalService.getActiveBySegment(this.segment));
    } else {
      this.activeAnimals.set([]);
    }
  }

  fillAutoTags(): void {
    const manual = this.tagsInput.trim()
      ? this.tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t)
      : [];
    const merged = this.autoGenerateTags(manual);
    this.tagsInput = merged.join(', ');
  }

  addTag(tag: string): void {
    const existing = this.tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
    if (!existing.includes(tag)) {
      existing.push(tag);
      this.tagsInput = existing.join(', ');
    }
    this.filteredTagSuggestions.set([]);
  }

  onTagInput(): void {
    const parts = this.tagsInput.split(',');
    const currentPart = (parts[parts.length - 1] || '').trim().toLowerCase();
    const alreadyUsed = parts.slice(0, -1).map(t => t.trim().toLowerCase()).filter(t => t);
    const allSuggestions = this.getSuggestedTags();
    if (!currentPart) {
      this.filteredTagSuggestions.set(allSuggestions.filter(t => !alreadyUsed.includes(t)));
    } else {
      this.filteredTagSuggestions.set(
        allSuggestions.filter(t => t.includes(currentPart) && !alreadyUsed.includes(t))
      );
    }
  }

  private getSuggestedTags(): string[] {
    const seg = this.allSegments().find(s => s.id === this.segment);
    const cat = this.filteredCategories().find(c => c.id === this.category);
    const now = this.date || new Date();
    const monthShort = now.toLocaleString('en', { month: 'short' }).toLowerCase();
    const year = now.getFullYear();
    const contextual: string[] = [];

    // Category-based: e.g. feed-jul-2026
    if (cat) {
      contextual.push(`${cat.name.toLowerCase().replace(/\s+/g, '-')}-${monthShort}-${year}`);
    }

    // Segment + month: e.g. goats-jul-2026
    if (seg) {
      contextual.push(`${seg.name.toLowerCase().replace(/\s+/g, '-')}-${monthShort}-${year}`);
    }

    // Seasonal tags based on date
    contextual.push(...this.getSeasonalTags(now));

    // Crop-specific suggestions
    if (seg?.segmentType === 'crop') {
      const quarter = `q${Math.ceil((now.getMonth() + 1) / 4)}`;
      contextual.push(`${quarter}-harvest-${year}`, 'season-1', 'season-2');
    }

    // Animal-linked suggestions
    if (this.selectedAnimalIds.length > 0) {
      for (const id of this.selectedAnimalIds) {
        const a = this.activeAnimals().find(x => x.id === id);
        if (a) {
          const name = this.animalService.getDisplayName(a).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          contextual.push(name);
        }
      }
    }

    return [...new Set([...contextual, ...this.knownTags])].sort();
  }

  private getSeasonalTags(date: Date): string[] {
    const month = date.getMonth(); // 0-indexed
    const year = date.getFullYear();
    const tags: string[] = [];

    // Indian seasons
    if (month >= 5 && month <= 8) tags.push(`monsoon-${year}`);       // Jun-Sep
    if (month >= 9 && month <= 10) tags.push(`post-monsoon-${year}`); // Oct-Nov
    if (month >= 2 && month <= 4) tags.push(`summer-${year}`);        // Mar-May
    if (month === 11 || month <= 1) tags.push(`winter-${year}`);      // Dec-Feb

    // Eid approximation (moves ~11 days earlier each year, but provide as suggestion)
    // Bakra Eid / Eid-ul-Adha is the main one for animal trade
    tags.push(`eid-${year}`);

    // Harvest seasons
    if (month >= 9 && month <= 11) tags.push(`rabi-sowing-${year}`);  // Oct-Dec
    if (month >= 2 && month <= 4) tags.push(`rabi-harvest-${year}`);  // Mar-May
    if (month >= 5 && month <= 7) tags.push(`kharif-sowing-${year}`); // Jun-Aug
    if (month >= 9 && month <= 10) tags.push(`kharif-harvest-${year}`); // Oct-Nov

    return tags;
  }

  /** Generate auto-tags based on context (category, segment, animals, season) */
  private autoGenerateTags(manualTags: string[]): string[] {
    const autoTags: string[] = [];
    const seg = this.allSegments().find(s => s.id === this.segment);
    const cat = this.filteredCategories().find(c => c.id === this.category);
    const date = this.date || new Date();
    const monthShort = date.toLocaleString('en', { month: 'short' }).toLowerCase();
    const year = date.getFullYear();
    const month = date.getMonth();

    // 1. Category-based: feed-jul-2026
    if (cat) {
      autoTags.push(`${cat.name.toLowerCase().replace(/\s+/g, '-')}-${monthShort}-${year}`);
    }

    // 2. Segment + month: goats-jul-2026
    if (seg) {
      autoTags.push(`${seg.name.toLowerCase().replace(/\s+/g, '-')}-${monthShort}-${year}`);
    }

    // 3. Animal-linked: animal name/batch label
    if (this.selectedAnimalIds.length > 0) {
      for (const id of this.selectedAnimalIds) {
        const a = this.activeAnimals().find(x => x.id === id);
        if (a) {
          const name = this.animalService.getDisplayName(a).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
          if (name) autoTags.push(name);
        }
      }
    }

    // 4. Seasonal: Indian seasons + agricultural cycles
    if (month >= 5 && month <= 8) autoTags.push(`monsoon-${year}`);
    else if (month >= 2 && month <= 4) autoTags.push(`summer-${year}`);
    else if (month === 11 || month <= 1) autoTags.push(`winter-${year}`);

    // Merge: manual first, then auto (deduplicated)
    return [...new Set([...manualTags, ...autoTags])];
  }

  onQtyRateChange(): void {
    if (this.quantity && this.ratePerUnit) {
      this.amount = Math.round(this.quantity * this.ratePerUnit * 100) / 100;
    }
  }

  onTypeChange(): void {
    this.filteredCategories.set(
      this.allCategories().filter((c) => c.type === this.type)
    );
    // Default to UPI for expense, cash for income
    if (!this.isEdit()) {
      this.paymentMethod = this.type === 'expense' ? 'upi' : 'cash';
    }
  }

  async save(): Promise<void> {
    this.error.set('');
    this.saving.set(true);

    try {
      const selectedSegment = this.allSegments().find((s) => s.id === this.segment);
      const selectedCategory = this.filteredCategories().find((c) => c.id === this.category);
      // Resolve paid by - either registered user or custom name
      const isCustom = this.paidBy === 'other';
      const paidByUser = isCustom ? null : this.users().find((u) => u.uid === this.paidBy);
      const resolvedPaidBy = isCustom ? 'other' : this.paidBy;
      const resolvedPaidByName = isCustom ? normalizeName(this.customPaidByName) : paidByUser?.displayName;

      const formData: TransactionFormData = {
        type: this.type,
        date: this.date,
        amount: this.amount,
        quantity: this.quantity || undefined,
        unit: this.unit || undefined,
        ratePerUnit: this.ratePerUnit || undefined,
        category: this.category,
        categoryName: selectedCategory?.name || this.category,
        segment: this.segment,
        segmentName: selectedSegment?.name || this.segment,
        description: this.description,
        paymentMethod: this.paymentMethod,
        paymentStatus: this.type === 'income' ? this.paymentStatus : undefined,
        expensePaymentStatus: this.type === 'expense' ? this.expensePaymentStatus : undefined,
        paidBy: resolvedPaidBy,
        paidByName: resolvedPaidByName,
        tags: this.tagsInput.trim()
          ? this.tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t)
          : undefined,
        month: getMonthString(this.date),
        year: getYear(this.date),
      };

      // Add animal link data
      if (this.selectedAnimalIds.length > 0) {
        const animalNames = this.selectedAnimalIds.map(id => {
          const a = this.activeAnimals().find(x => x.id === id);
          return a ? this.animalService.getDisplayName(a) : id;
        });
        formData.linkedAnimalIds = this.selectedAnimalIds;
        formData.linkedAnimalNames = animalNames;
      }

      if (this.isEdit()) {
        await this.transactionService.update(this.editId, formData);

        // Re-attribute animal costs if links or amount changed
        if (this.type === 'expense') {
          const linksChanged = JSON.stringify(this.oldLinkedAnimalIds.sort()) !== JSON.stringify(this.selectedAnimalIds.sort());
          if (linksChanged || this.oldLinkedAnimalIds.length > 0) {
            // Remove old attributions
            for (const oldId of this.oldLinkedAnimalIds) {
              await this.animalService.removeCost(oldId, this.editId);
            }
            // Apply new attributions
            if (this.selectedAnimalIds.length > 0) {
              await this.animalService.attributeCost(
                this.selectedAnimalIds,
                this.editId,
                { category: this.category, categoryName: formData.categoryName, date: this.date, totalAmount: this.amount, description: this.description },
                this.animalSplitMode
              );
            }
          }
        }
      } else {
        const txnId = await this.transactionService.create(formData);
        // Attribute costs to animals
        if (this.selectedAnimalIds.length > 0 && this.type === 'expense') {
          await this.animalService.attributeCost(
            this.selectedAnimalIds,
            txnId,
            { category: this.category, categoryName: formData.categoryName, date: this.date, totalAmount: this.amount, description: this.description },
            this.animalSplitMode
          );
        }
      }
      this.snackBar.open(
        this.isEdit() ? 'Transaction updated' : 'Transaction created',
        '',
        { duration: 2500 }
      );
      this.saved = true;
      this.router.navigate(['/transactions']);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save transaction');
    } finally {
      this.saving.set(false);
    }
  }

  hasUnsavedChanges(): boolean {
    if (this.saved) return false;
    if (this.isEdit()) return true;
    return this.amount > 0 || this.description.trim() !== '';
  }

  cancel(): void {
    this.router.navigate(['/transactions']);
  }
}
