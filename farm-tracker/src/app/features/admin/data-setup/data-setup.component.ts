import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SegmentService } from '../../../core/services/segment.service';
import { CategoryService } from '../../../core/services/category.service';
import { Segment } from '../../../core/models/segment.model';
import { Category } from '../../../core/models/category.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  Firestore,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from '@angular/fire/firestore';

@Component({
  selector: 'app-data-setup',
  standalone: true,
  imports: [
    FormsModule, LoadingSpinnerComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatChipsModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
  ],
  template: `
    <div class="page-header">
      <h1>Data Setup</h1>
      <p class="subtitle">Manage business segments and transaction categories</p>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <!-- Seed Defaults Banner -->
      @if (segments().length === 0 && categories().length === 0) {
        <mat-card class="seed-banner">
          <mat-icon>info</mat-icon>
          <div>
            <h3>No data found in Firestore</h3>
            <p>Initialize your database with default segments and categories to get started.</p>
          </div>
          <button mat-flat-button color="primary" (click)="seedAll()" [disabled]="seeding()">
            {{ seeding() ? 'Seeding...' : 'Seed All Defaults' }}
          </button>
        </mat-card>
      }

      @if (successMsg()) {
        <div class="success-message">{{ successMsg() }}</div>
      }
      @if (errorMsg()) {
        <div class="error-message">{{ errorMsg() }}</div>
      }

      <mat-tab-group>
        <!-- SEGMENTS TAB -->
        <mat-tab label="Segments">
          <div class="tab-content">
            <div class="section-header">
              <h3>Business Segments ({{ segments().length }})</h3>
              <div class="section-actions">
                @if (segments().length === 0) {
                  <button mat-stroked-button color="primary" (click)="seedSegments()" [disabled]="seeding()">
                    <mat-icon>add_circle</mat-icon> Add Default Segments
                  </button>
                }
              </div>
            </div>

            <!-- Existing Segments -->
            @if (segments().length > 0) {
              <div class="cards-grid">
                @for (seg of segments(); track seg.id) {
                  <mat-card class="item-card">
                    <div class="item-header">
                      <span class="item-icon">{{ seg.icon }}</span>
                      <div>
                        <strong>{{ seg.name }}</strong>
                        <span class="item-id">{{ seg.id }}</span>
                      </div>
                      <mat-slide-toggle
                        [checked]="seg.isActive"
                        (change)="toggleSegment(seg)"
                        color="primary" />
                    </div>
                    <p class="item-desc">{{ seg.description }}</p>
                    <button mat-icon-button color="warn" class="delete-btn" (click)="deleteSegment(seg.id)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </mat-card>
                }
              </div>
            }

            <!-- Add Custom Segment -->
            <mat-card class="add-form-card">
              <h4>Add Custom Segment</h4>
              <div class="add-form">
                <mat-form-field appearance="outline">
                  <mat-label>ID (lowercase, no spaces)</mat-label>
                  <input matInput [(ngModel)]="newSegment.id" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Name</mat-label>
                  <input matInput [(ngModel)]="newSegment.name" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Description</mat-label>
                  <input matInput [(ngModel)]="newSegment.description" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Icon (emoji)</mat-label>
                  <input matInput [(ngModel)]="newSegment.icon" />
                </mat-form-field>
                <button mat-flat-button color="primary" (click)="addSegment()" [disabled]="!newSegment.id || !newSegment.name">
                  <mat-icon>add</mat-icon> Add
                </button>
              </div>
            </mat-card>

          </div>
        </mat-tab>

        <!-- CATEGORIES TAB -->
        <mat-tab label="Categories">
          <div class="tab-content">
            <div class="section-header">
              <h3>Transaction Categories ({{ categories().length }})</h3>
              <div class="section-actions">
                @if (categories().length === 0) {
                  <button mat-stroked-button color="primary" (click)="seedCategories()" [disabled]="seeding()">
                    <mat-icon>add_circle</mat-icon> Add Default Categories
                  </button>
                }
              </div>
            </div>

            <!-- Expense Categories -->
            <h4 class="sub-heading">Expense Categories</h4>
            @if (expenseCategories().length > 0) {
              <div class="cards-grid">
                @for (cat of expenseCategories(); track cat.id) {
                  <mat-card class="item-card expense-card">
                    <div class="item-header">
                      <div>
                        <strong>{{ cat.name }}</strong>
                        <span class="item-id">{{ cat.id }}</span>
                      </div>
                      <span class="type-chip expense">EXPENSE</span>
                    </div>
                    <button mat-icon-button color="warn" class="delete-btn" (click)="deleteCategory(cat.id)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </mat-card>
                }
              </div>
            } @else {
              <p class="no-data">No expense categories</p>
            }

            <!-- Income Categories -->
            <h4 class="sub-heading">Income Sources</h4>
            @if (incomeCategories().length > 0) {
              <div class="cards-grid">
                @for (cat of incomeCategories(); track cat.id) {
                  <mat-card class="item-card income-card">
                    <div class="item-header">
                      <div>
                        <strong>{{ cat.name }}</strong>
                        <span class="item-id">{{ cat.id }}</span>
                      </div>
                      <span class="type-chip income">INCOME</span>
                    </div>
                    <button mat-icon-button color="warn" class="delete-btn" (click)="deleteCategory(cat.id)">
                      <mat-icon>delete</mat-icon>
                    </button>
                  </mat-card>
                }
              </div>
            } @else {
              <p class="no-data">No income categories</p>
            }

            <!-- Add Custom Category -->
            <mat-card class="add-form-card">
              <h4>Add Custom Category</h4>
              <div class="add-form">
                <mat-form-field appearance="outline">
                  <mat-label>ID (lowercase, no spaces)</mat-label>
                  <input matInput [(ngModel)]="newCategory.id" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Name</mat-label>
                  <input matInput [(ngModel)]="newCategory.name" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Type</mat-label>
                  <mat-select [(ngModel)]="newCategory.type">
                    <mat-option value="expense">Expense</mat-option>
                    <mat-option value="income">Income</mat-option>
                  </mat-select>
                </mat-form-field>
                <button mat-flat-button color="primary" (click)="addCategory()" [disabled]="!newCategory.id || !newCategory.name">
                  <mat-icon>add</mat-icon> Add
                </button>
              </div>
            </mat-card>

          </div>
        </mat-tab>
        <!-- BUDGETS TAB -->
        <mat-tab label="Budgets">
          <div class="tab-content">
            <div class="section-header">
              <h3>Monthly Budget per Segment</h3>
            </div>
            <p class="budget-hint">Set monthly expense limits per segment. Dashboard will show progress and warn at 80%.</p>

            @for (seg of segments(); track seg.id) {
              <mat-card class="budget-item">
                <div class="budget-seg-header">
                  <span class="item-icon">{{ seg.icon }}</span>
                  <strong>{{ seg.name }}</strong>
                </div>
                <div class="budget-fields">
                  <mat-form-field appearance="outline">
                    <mat-label>Monthly Expense Limit</mat-label>
                    <input matInput type="number" [value]="seg.budgets?.monthlyExpenseLimit || ''"
                      (change)="onBudgetChange(seg.id, 'monthlyExpenseLimit', $event)" min="0" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Monthly Income Target</mat-label>
                    <input matInput type="number" [value]="seg.budgets?.monthlyIncomeTarget || ''"
                      (change)="onBudgetChange(seg.id, 'monthlyIncomeTarget', $event)" min="0" />
                  </mat-form-field>
                </div>
              </mat-card>
            }
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: [`
    .page-header { margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .subtitle { margin: 4px 0 0; color: #64748b; font-size: 0.875rem; }
    .seed-banner {
      display: flex; align-items: center; gap: 1rem; padding: 1.5rem;
      background: #eff6ff; border: 1px solid #bfdbfe; margin-bottom: 1rem;
    }
    .seed-banner mat-icon { font-size: 2rem; width: 2rem; height: 2rem; color: #2563eb; }
    .seed-banner h3 { margin: 0; font-size: 1rem; color: #1e293b; }
    .seed-banner p { margin: 4px 0 0; font-size: 0.8rem; color: #64748b; }
    .seed-banner button { margin-left: auto; white-space: nowrap; }
    .success-message { background: #f0fdf4; color: #16a34a; padding: 10px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem; }
    .error-message { background: #fef2f2; color: #dc2626; padding: 10px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem; }
    .tab-content { padding: 1rem 0; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .section-header h3 { margin: 0; font-size: 1.1rem; color: #1e293b; }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .item-card { padding: 1rem; position: relative; }
    .item-header { display: flex; align-items: center; gap: 10px; }
    .item-icon { font-size: 1.5rem; }
    .item-id { display: block; font-size: 0.7rem; color: #94a3b8; font-family: monospace; }
    .item-desc { margin: 8px 0 0; font-size: 0.8rem; color: #64748b; }
    .delete-btn { position: absolute; top: 4px; right: 4px; }
    .expense-card { border-left: 3px solid #dc2626; }
    .income-card { border-left: 3px solid #16a34a; }
    .type-chip { padding: 2px 8px; border-radius: 4px; font-size: 0.65rem; font-weight: 700; margin-left: auto; }
    .type-chip.expense { background: #fef2f2; color: #dc2626; }
    .type-chip.income { background: #f0fdf4; color: #16a34a; }
    .sub-heading { margin: 1rem 0 0.5rem; font-size: 0.9rem; color: #475569; }
    .no-data { color: #94a3b8; font-size: 0.85rem; padding: 0.5rem 0; }
    .add-form-card { padding: 1.25rem; margin-bottom: 1.5rem; background: #f8fafc; }
    .add-form-card h4 { margin: 0 0 1rem; font-size: 0.9rem; color: #1e293b; }
    .add-form { display: flex; gap: 0.75rem; align-items: flex-start; flex-wrap: wrap; }
    .add-form mat-form-field { flex: 1; min-width: 150px; }
    .budget-hint { font-size: 0.8rem; color: #64748b; margin: 0 0 1rem; }
    .budget-item { padding: 1rem; margin-bottom: 0.75rem; }
    .budget-seg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 0.75rem; }
    .budget-fields { display: flex; gap: 1rem; flex-wrap: wrap; }
    .budget-fields mat-form-field { flex: 1; min-width: 200px; }
    @media (max-width: 768px) {
      .seed-banner { flex-direction: column; text-align: center; }
      .seed-banner button { margin-left: 0; }
      .add-form mat-form-field { min-width: 0; flex-basis: 100%; }
      .budget-fields mat-form-field { min-width: 0; flex-basis: 100%; }
      .section-header { flex-direction: column; gap: 0.5rem; align-items: flex-start; }
    }
  `],
})
export class DataSetupComponent implements OnInit {
  private segmentService = inject(SegmentService);
  private categoryService = inject(CategoryService);
  private firestore = inject(Firestore);

  loading = signal(true);
  seeding = signal(false);
  successMsg = signal('');
  errorMsg = signal('');

  segments = signal<Segment[]>([]);
  categories = signal<Category[]>([]);
  expenseCategories = signal<Category[]>([]);
  incomeCategories = signal<Category[]>([]);

  newSegment = { id: '', name: '', description: '', icon: '' };
  newCategory = { id: '', name: '', type: 'expense' as 'expense' | 'income' };

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const [segments, categories] = await Promise.all([
      this.segmentService.getAll(),
      this.categoryService.getAll(),
    ]);
    this.segments.set(segments);
    this.categories.set(categories);
    this.expenseCategories.set(categories.filter((c) => c.type === 'expense'));
    this.incomeCategories.set(categories.filter((c) => c.type === 'income'));
    this.loading.set(false);
  }

  async seedAll(): Promise<void> {
    this.seeding.set(true);
    this.clearMessages();
    try {
      await this.segmentService.seedDefaults();
      await this.categoryService.seedDefaults();
      this.successMsg.set('All default segments and categories have been added to Firestore!');
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to seed defaults');
    } finally {
      this.seeding.set(false);
    }
  }

  async seedSegments(): Promise<void> {
    this.seeding.set(true);
    this.clearMessages();
    try {
      await this.segmentService.seedDefaults();
      this.successMsg.set('Default segments added!');
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    } finally {
      this.seeding.set(false);
    }
  }

  async seedCategories(): Promise<void> {
    this.seeding.set(true);
    this.clearMessages();
    try {
      await this.categoryService.seedDefaults();
      this.successMsg.set('Default categories added!');
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    } finally {
      this.seeding.set(false);
    }
  }

  async addSegment(): Promise<void> {
    this.clearMessages();
    const id = this.newSegment.id.toLowerCase().replace(/\s+/g, '-');
    try {
      await setDoc(doc(this.firestore, 'segments', id), {
        id,
        name: this.newSegment.name,
        description: this.newSegment.description,
        icon: this.newSegment.icon || '📦',
        isActive: true,
        createdAt: serverTimestamp(),
      });
      this.successMsg.set(`Segment "${this.newSegment.name}" added!`);
      this.newSegment = { id: '', name: '', description: '', icon: '' };
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    }
  }

  async addCategory(): Promise<void> {
    this.clearMessages();
    const id = this.newCategory.id.toLowerCase().replace(/\s+/g, '-');
    try {
      await setDoc(doc(this.firestore, 'categories', id), {
        id,
        name: this.newCategory.name,
        type: this.newCategory.type,
        isActive: true,
      });
      this.successMsg.set(`Category "${this.newCategory.name}" added!`);
      this.newCategory = { id: '', name: '', type: 'expense' };
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    }
  }

  async deleteSegment(id: string): Promise<void> {
    this.clearMessages();
    try {
      await deleteDoc(doc(this.firestore, 'segments', id));
      this.successMsg.set(`Segment "${id}" deleted.`);
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    }
  }

  async deleteCategory(id: string): Promise<void> {
    this.clearMessages();
    try {
      await deleteDoc(doc(this.firestore, 'categories', id));
      this.successMsg.set(`Category "${id}" deleted.`);
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    }
  }

  async toggleSegment(seg: Segment): Promise<void> {
    this.clearMessages();
    try {
      await setDoc(doc(this.firestore, 'segments', seg.id), {
        ...seg,
        isActive: !seg.isActive,
      });
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    }
  }

  async onBudgetChange(segmentId: string, field: 'monthlyExpenseLimit' | 'monthlyIncomeTarget', event: Event): Promise<void> {
    this.clearMessages();
    const value = parseFloat((event.target as HTMLInputElement).value) || 0;
    const seg = this.segments().find(s => s.id === segmentId);
    const budgets = { ...(seg?.budgets || {}), [field]: value };
    try {
      await this.segmentService.updateBudget(segmentId, budgets);
      this.successMsg.set(`Budget updated for ${seg?.name || segmentId}`);
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to update budget');
    }
  }

  private clearMessages(): void {
    this.successMsg.set('');
    this.errorMsg.set('');
  }
}
