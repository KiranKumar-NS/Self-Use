import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SegmentService } from '../../../core/services/segment.service';
import { CategoryService } from '../../../core/services/category.service';
import { SummaryReconciliationService, ReconciliationReport, CounterpartyReconciliationReport } from '../../../core/services/summary-reconciliation.service';
import { TagService } from '../../../core/services/tag.service';
import { Segment } from '../../../core/models/segment.model';
import { Category } from '../../../core/models/category.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { safeLoad } from '../../../core/utils/async.utils';
import { ToastService } from '../../../core/services/toast.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, LoadingSpinnerComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatChipsModule,
    MatTabsModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule, MatProgressBarModule,
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
                        <span class="seg-type-chip" [class]="seg.segmentType || 'animal'">{{ (seg.segmentType || 'animal') === 'animal' ? '🐄 Animal' : '🌱 Crop' }}</span>
                      </div>
                      <mat-slide-toggle
                        [checked]="seg.isActive"
                        (change)="toggleSegment(seg)"
                        color="primary" />
                    </div>
                    <p class="item-desc">{{ seg.description }}</p>
                    <button mat-icon-button color="warn" class="delete-btn" (click)="deleteSegment(seg.id)" aria-label="Delete segment">
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
                  <input matInput [ngModel]="newSegment().id" (ngModelChange)="newSegment().id = $event" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Name</mat-label>
                  <input matInput [ngModel]="newSegment().name" (ngModelChange)="newSegment().name = $event" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Description</mat-label>
                  <input matInput [ngModel]="newSegment().description" (ngModelChange)="newSegment().description = $event" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Icon (emoji)</mat-label>
                  <input matInput [ngModel]="newSegment().icon" (ngModelChange)="newSegment().icon = $event" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Type</mat-label>
                  <mat-select [ngModel]="newSegment().segmentType" (ngModelChange)="newSegment().segmentType = $event">
                    <mat-option value="animal">🐄 Animal</mat-option>
                    <mat-option value="crop">🌱 Crop</mat-option>
                  </mat-select>
                </mat-form-field>
                <button mat-flat-button color="primary" (click)="addSegment()" [disabled]="!newSegment().id || !newSegment().name">
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
                      <button mat-icon-button color="warn" class="cat-delete" (click)="deleteCategory(cat.id)" aria-label="Delete category">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>
                    <mat-form-field appearance="outline" class="cat-seg-field" subscriptSizing="dynamic">
                      <mat-label>Segments</mat-label>
                      <mat-select multiple placeholder="All segments"
                        [ngModel]="cat.segments || []"
                        (ngModelChange)="updateCategorySegments(cat, $event)">
                        @for (seg of segments(); track seg.id) {
                          <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
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
                      <button mat-icon-button color="warn" class="cat-delete" (click)="deleteCategory(cat.id)" aria-label="Delete category">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>
                    <mat-form-field appearance="outline" class="cat-seg-field" subscriptSizing="dynamic">
                      <mat-label>Segments</mat-label>
                      <mat-select multiple placeholder="All segments"
                        [ngModel]="cat.segments || []"
                        (ngModelChange)="updateCategorySegments(cat, $event)">
                        @for (seg of segments(); track seg.id) {
                          <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
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
                  <input matInput [ngModel]="newCategory().id" (ngModelChange)="newCategory().id = $event" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Name</mat-label>
                  <input matInput [ngModel]="newCategory().name" (ngModelChange)="newCategory().name = $event" />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Type</mat-label>
                  <mat-select [ngModel]="newCategory().type" (ngModelChange)="newCategory().type = $event">
                    <mat-option value="expense">Expense</mat-option>
                    <mat-option value="income">Income</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Segments</mat-label>
                  <mat-select multiple placeholder="All segments" [ngModel]="newCategory().segments" (ngModelChange)="newCategory().segments = $event">
                    @for (seg of segments(); track seg.id) {
                      <mat-option [value]="seg.id">{{ seg.icon }} {{ seg.name }}</mat-option>
                    }
                  </mat-select>
                  <mat-hint>Leave empty to show in all segments</mat-hint>
                </mat-form-field>
                <button mat-flat-button color="primary" (click)="addCategory()" [disabled]="!newCategory().id || !newCategory().name">
                  <mat-icon>add</mat-icon> Add
                </button>
              </div>
            </mat-card>

          </div>
        </mat-tab>

        <!-- TAGS TAB -->
        <mat-tab label="Tags">
          <div class="tab-content">
            <div class="section-header">
              <h3>Tags ({{ tags().length }})</h3>
            </div>
            <p class="budget-hint">Deleting or renaming a tag also updates every transaction that carries it.</p>

            @if (tags().length === 0) {
              <p class="no-data">No tags yet — tags are collected as you use them on transactions.</p>
            } @else {
              <div class="tag-chips">
                @for (tag of tags(); track tag) {
                  <span class="tag-chip">
                    {{ tag }}
                    <button class="tag-delete" (click)="deleteTag(tag)" [disabled]="tagBusy()" aria-label="Delete tag" title="Delete tag">
                      <mat-icon>close</mat-icon>
                    </button>
                  </span>
                }
              </div>
            }

            <mat-card class="add-form-card">
              <h4>Rename Tag</h4>
              <div class="add-form">
                <mat-form-field appearance="outline">
                  <mat-label>Existing tag</mat-label>
                  <mat-select [(ngModel)]="renameFrom">
                    @for (tag of tags(); track tag) {
                      <mat-option [value]="tag">{{ tag }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>New name</mat-label>
                  <input matInput [(ngModel)]="renameTo" />
                </mat-form-field>
                <button mat-flat-button color="primary" (click)="renameTag()"
                        [disabled]="tagBusy() || !renameFrom || !renameTo.trim()">
                  {{ tagBusy() ? 'Working…' : 'Rename' }}
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
            <!-- Reconcile Summaries Section -->
            <mat-card class="reconcile-section">
              <div class="reconcile-header">
                <mat-icon class="reconcile-icon">sync</mat-icon>
                <div>
                  <h3>Reconcile Summaries</h3>
                  <p class="reconcile-desc">Recompute all monthly and yearly summaries from raw transaction data. Use this if summary totals have drifted due to partial write failures.</p>
                </div>
              </div>
              @if (reconciling()) {
                <mat-progress-bar mode="indeterminate" />
                <p class="reconcile-status">Reconciling... This may take a moment.</p>
              }
              @if (reconcileReport()) {
                <div class="reconcile-results">
                  <div class="reconcile-stat">
                    <span class="stat-label">Transactions processed</span>
                    <span class="stat-value">{{ reconcileReport()!.totalTransactions }}</span>
                  </div>
                  <div class="reconcile-stat">
                    <span class="stat-label">Monthly summaries written</span>
                    <span class="stat-value">{{ reconcileReport()!.monthlySummariesWritten }}</span>
                  </div>
                  <div class="reconcile-stat">
                    <span class="stat-label">Yearly summaries written</span>
                    <span class="stat-value">{{ reconcileReport()!.yearlySummariesWritten }}</span>
                  </div>
                  <div class="reconcile-stat corrected">
                    <span class="stat-label">Monthly corrected</span>
                    <span class="stat-value">{{ reconcileReport()!.monthlyCorrected }}</span>
                  </div>
                  <div class="reconcile-stat corrected">
                    <span class="stat-label">Yearly corrected</span>
                    <span class="stat-value">{{ reconcileReport()!.yearlyCorrected }}</span>
                  </div>
                </div>
              }
              <button mat-flat-button color="warn" (click)="reconcileSummaries()" [disabled]="reconciling()">
                <mat-icon>sync</mat-icon>
                {{ reconciling() ? 'Reconciling...' : 'Reconcile All Summaries' }}
              </button>
            </mat-card>

            <!-- Reconcile Buyer/Supplier Stats Section -->
            <mat-card class="reconcile-section">
              <div class="reconcile-header">
                <mat-icon class="reconcile-icon">groups</mat-icon>
                <div>
                  <h3>Reconcile Buyer &amp; Supplier Stats</h3>
                  <p class="reconcile-desc">Recompute purchase/order totals, segment breakdowns and supplier pending amounts from raw transactions. Use this if counterparty totals look wrong — form-linked sales historically never updated these counters.</p>
                </div>
              </div>
              @if (reconcilingParties()) {
                <mat-progress-bar mode="indeterminate" />
                <p class="reconcile-status">Reconciling... This may take a moment.</p>
              }
              @if (partyReport()) {
                <div class="reconcile-results">
                  <div class="reconcile-stat">
                    <span class="stat-label">Transactions processed</span>
                    <span class="stat-value">{{ partyReport()!.totalTransactions }}</span>
                  </div>
                  <div class="reconcile-stat">
                    <span class="stat-label">Buyers checked</span>
                    <span class="stat-value">{{ partyReport()!.buyersChecked }}</span>
                  </div>
                  <div class="reconcile-stat corrected">
                    <span class="stat-label">Buyers corrected</span>
                    <span class="stat-value">{{ partyReport()!.buyersCorrected }}</span>
                  </div>
                  <div class="reconcile-stat">
                    <span class="stat-label">Suppliers checked</span>
                    <span class="stat-value">{{ partyReport()!.suppliersChecked }}</span>
                  </div>
                  <div class="reconcile-stat corrected">
                    <span class="stat-label">Suppliers corrected</span>
                    <span class="stat-value">{{ partyReport()!.suppliersCorrected }}</span>
                  </div>
                </div>
              }
              <button mat-flat-button color="warn" (click)="reconcileParties()" [disabled]="reconcilingParties()">
                <mat-icon>groups</mat-icon>
                {{ reconcilingParties() ? 'Reconciling...' : 'Reconcile Buyer/Supplier Stats' }}
              </button>
            </mat-card>
          </div>
        </mat-tab>

      </mat-tab-group>
    }
  `,
  styles: [`
    .page-header { margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: var(--color-text); }
    .subtitle { margin: 4px 0 0; color: var(--color-text-secondary); font-size: 0.875rem; }
    .seed-banner {
      display: flex; align-items: center; gap: 1rem; padding: 1.5rem;
      background: var(--color-info-light); border: 1px solid var(--color-info); margin-bottom: 1rem;
    }
    .seed-banner mat-icon { font-size: 2rem; width: 2rem; height: 2rem; color: var(--color-info); }
    .seed-banner h3 { margin: 0; font-size: 1rem; color: var(--color-text); }
    .seed-banner p { margin: 4px 0 0; font-size: 0.8rem; color: var(--color-text-secondary); }
    .seed-banner button { margin-left: auto; white-space: nowrap; }
    .success-message { background: var(--color-income-bg); color: var(--color-income); padding: 10px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem; }
    .error-message { background: var(--color-expense-bg); color: var(--color-danger); padding: 10px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem; }
    .tab-content { padding: 1rem 0; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .section-header h3 { margin: 0; font-size: 1.1rem; color: var(--color-text); }
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr)); gap: 0.75rem; margin-bottom: 1.5rem; }
    .item-card { padding: 1rem; position: relative; }
    .item-header { display: flex; align-items: center; gap: 10px; }
    .item-icon { font-size: 1.5rem; }
    .item-id { display: block; font-size: 0.7rem; color: var(--color-text-muted); font-family: monospace; }
    .seg-type-chip { display: inline-block; margin-top: 2px; padding: 1px 6px; border-radius: 4px; font-size: 0.6rem; font-weight: 700; }
    .seg-type-chip.animal { background: var(--color-warning-light); color: var(--color-warning); }
    .seg-type-chip.crop { background: var(--color-income-bg); color: var(--color-income); }
    .item-desc { margin: 8px 0 0; font-size: 0.8rem; color: var(--color-text-secondary); }
    .delete-btn { position: absolute; top: 4px; right: 4px; }
    .expense-card { border-left: 3px solid var(--color-expense); }
    .income-card { border-left: 3px solid var(--color-income); }
    .cat-delete { margin: -8px -8px -8px auto; }
    .cat-seg-field { width: 100%; margin-top: 0.75rem; }
    .expense-card .item-header, .income-card .item-header { min-height: 24px; }
    .sub-heading { margin: 1rem 0 0.5rem; font-size: 0.9rem; color: var(--color-text-subtle); }
    .no-data { color: var(--color-text-muted); font-size: 0.85rem; padding: 0.5rem 0; }
    .add-form-card { padding: 1.25rem; margin-bottom: 1.5rem; background: var(--color-bg); }
    .add-form-card h4 { margin: 0 0 1rem; font-size: 0.9rem; color: var(--color-text); }
    .add-form { display: flex; gap: 0.75rem; align-items: flex-start; flex-wrap: wrap; }
    .add-form mat-form-field { flex: 1; min-width: min(150px, 100%); }
    .budget-hint { font-size: 0.8rem; color: var(--color-text-secondary); margin: 0 0 1rem; }
    .budget-item { padding: 1rem; margin-bottom: 0.75rem; }
    .budget-seg-header { display: flex; align-items: center; gap: 8px; margin-bottom: 0.75rem; }
    .budget-fields { display: flex; gap: 1rem; flex-wrap: wrap; }
    .budget-fields mat-form-field { flex: 1; min-width: min(200px, 100%); }
    .reconcile-section { padding: 1.5rem; margin-top: 2rem; border: 1px solid var(--color-border, #e0e0e0); }
    .reconcile-header { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; }
    .reconcile-icon { font-size: 2rem; width: 2rem; height: 2rem; color: var(--color-warning, #f59e0b); }
    .reconcile-header h3 { margin: 0; font-size: 1rem; color: var(--color-text); }
    .reconcile-desc { margin: 4px 0 0; font-size: 0.8rem; color: var(--color-text-secondary); }
    .reconcile-status { font-size: 0.85rem; color: var(--color-text-secondary); margin: 0.75rem 0; }
    .reconcile-results { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; padding: 1rem; background: var(--color-bg, #f9f9f9); border-radius: 8px; }
    .reconcile-stat { display: flex; flex-direction: column; gap: 2px; min-width: 140px; }
    .stat-label { font-size: 0.75rem; color: var(--color-text-secondary); }
    .stat-value { font-size: 1.1rem; font-weight: 600; color: var(--color-text); }
    .reconcile-stat.corrected .stat-value { color: var(--color-warning, #f59e0b); }
    .reconcile-section + .reconcile-section { margin-top: 1rem; }
    .tag-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 1.5rem; }
    .tag-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 6px 4px 12px; border-radius: 16px;
      background: var(--color-bg, #f0f0f0); border: 1px solid var(--color-border, #e0e0e0);
      font-size: 0.85rem; font-family: monospace;
    }
    .tag-delete {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; padding: 0; border: none; border-radius: 50%;
      background: transparent; cursor: pointer; color: var(--color-text-secondary);
    }
    .tag-delete:hover:not(:disabled) { background: var(--color-expense-bg, rgba(198,40,40,0.1)); color: var(--color-expense, #c62828); }
    .tag-delete:disabled { opacity: 0.4; cursor: default; }
    .tag-delete mat-icon { font-size: 16px; width: 16px; height: 16px; }
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
  private reconciliationService = inject(SummaryReconciliationService);
  private tagService = inject(TagService);
  private firestore = inject(Firestore);
  private toast = inject(ToastService);

  loading = signal(true);
  seeding = signal(false);
  reconciling = signal(false);
  reconcileReport = signal<ReconciliationReport | null>(null);
  reconcilingParties = signal(false);
  partyReport = signal<CounterpartyReconciliationReport | null>(null);
  tags = signal<string[]>([]);
  tagBusy = signal(false);
  renameFrom = '';
  renameTo = '';
  successMsg = signal('');
  errorMsg = signal('');

  segments = signal<Segment[]>([]);
  categories = signal<Category[]>([]);
  expenseCategories = signal<Category[]>([]);
  incomeCategories = signal<Category[]>([]);

  newSegment = signal<{ id: string; name: string; description: string; icon: string; segmentType: 'animal' | 'crop' }>({ id: '', name: '', description: '', icon: '', segmentType: 'animal' });
  newCategory = signal<{ id: string; name: string; type: 'expense' | 'income'; segments: string[] }>({ id: '', name: '', type: 'expense', segments: [] });


  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    await safeLoad(this.loading, async () => {
      const [segments, categories, tags] = await Promise.all([
        this.segmentService.getAll(),
        this.categoryService.getAll(),
        this.tagService.getTags(),
      ]);
      this.segments.set(segments);
      this.categories.set(categories);
      this.expenseCategories.set(categories.filter((c) => c.type === 'expense'));
      this.incomeCategories.set(categories.filter((c) => c.type === 'income'));
      this.tags.set([...tags].sort());
    }, this.toast);
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
    const newSegment = this.newSegment();
    const id = newSegment.id.toLowerCase().replace(/\s+/g, '-');
    try {
      await setDoc(doc(this.firestore, 'segments', id), {
        id,
        name: newSegment.name,
        description: newSegment.description,
        icon: newSegment.icon || '📦',
        segmentType: newSegment.segmentType,
        isActive: true,
        createdAt: serverTimestamp(),
      });
      this.successMsg.set(`Segment "${newSegment.name}" added!`);
      this.newSegment.set({ id: '', name: '', description: '', icon: '', segmentType: 'animal' });
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    }
  }

  async addCategory(): Promise<void> {
    this.clearMessages();
    const newCategory = this.newCategory();
    const id = newCategory.id.toLowerCase().replace(/\s+/g, '-');
    try {
      await setDoc(doc(this.firestore, 'categories', id), {
        id,
        name: newCategory.name,
        type: newCategory.type,
        isActive: true,
        segments: newCategory.segments,
      });
      this.categoryService.clearCache();
      this.successMsg.set(`Category "${newCategory.name}" added!`);
      this.newCategory.set({ id: '', name: '', type: 'expense', segments: [] });
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
      this.categoryService.clearCache();
      this.successMsg.set(`Category "${id}" deleted.`);
      await this.loadData();
    } catch (err: any) {
      this.errorMsg.set(err.message);
    }
  }

  async updateCategorySegments(cat: Category, segments: string[]): Promise<void> {
    this.clearMessages();
    try {
      await setDoc(doc(this.firestore, 'categories', cat.id), { segments }, { merge: true });
      this.categoryService.clearCache();
      // Patch signals in place — a full loadData() would close the open multi-select
      const patch = (list: Category[]) => list.map((c) => (c.id === cat.id ? { ...c, segments } : c));
      this.categories.update(patch);
      this.expenseCategories.update(patch);
      this.incomeCategories.update(patch);
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

  async reconcileSummaries(): Promise<void> {
    this.clearMessages();
    this.reconcileReport.set(null);
    this.reconciling.set(true);
    try {
      const report = await this.reconciliationService.reconcileAll();
      this.reconcileReport.set(report);
      const corrected = report.monthlyCorrected + report.yearlyCorrected;
      this.successMsg.set(
        corrected > 0
          ? `Reconciliation complete. ${corrected} summary doc(s) were corrected from ${report.totalTransactions} transactions.`
          : `Reconciliation complete. All ${report.monthlySummariesWritten + report.yearlySummariesWritten} summaries were already accurate (${report.totalTransactions} transactions).`
      );
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Reconciliation failed');
    } finally {
      this.reconciling.set(false);
    }
  }

  async reconcileParties(): Promise<void> {
    this.clearMessages();
    this.partyReport.set(null);
    this.reconcilingParties.set(true);
    try {
      const report = await this.reconciliationService.reconcileCounterparties();
      this.partyReport.set(report);
      const corrected = report.buyersCorrected + report.suppliersCorrected;
      this.successMsg.set(
        corrected > 0
          ? `Counterparty reconciliation complete. ${report.buyersCorrected} buyer(s) and ${report.suppliersCorrected} supplier(s) corrected from ${report.totalTransactions} transactions.`
          : `Counterparty reconciliation complete. All ${report.buyersChecked + report.suppliersChecked} records were already accurate (${report.totalTransactions} transactions).`
      );
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Counterparty reconciliation failed');
    } finally {
      this.reconcilingParties.set(false);
    }
  }

  async deleteTag(tag: string): Promise<void> {
    if (!confirm(`Delete tag "${tag}"? It will also be removed from every transaction that uses it.`)) return;
    this.clearMessages();
    this.tagBusy.set(true);
    try {
      const count = await this.tagService.deleteTag(tag);
      this.successMsg.set(`Tag "${tag}" deleted (removed from ${count} transaction${count === 1 ? '' : 's'}).`);
      await this.refreshTags();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to delete tag');
    } finally {
      this.tagBusy.set(false);
    }
  }

  async renameTag(): Promise<void> {
    const from = this.renameFrom;
    const to = this.renameTo.trim().toLowerCase();
    if (!from || !to) return;
    this.clearMessages();
    this.tagBusy.set(true);
    try {
      const count = await this.tagService.renameTag(from, to);
      this.successMsg.set(`Tag "${from}" renamed to "${to}" (updated ${count} transaction${count === 1 ? '' : 's'}).`);
      this.renameFrom = '';
      this.renameTo = '';
      await this.refreshTags();
    } catch (err: any) {
      this.errorMsg.set(err.message || 'Failed to rename tag');
    } finally {
      this.tagBusy.set(false);
    }
  }

  private async refreshTags(): Promise<void> {
    this.tags.set([...(await this.tagService.getTags())].sort());
  }

  private clearMessages(): void {
    this.successMsg.set('');
    this.errorMsg.set('');
  }
}
