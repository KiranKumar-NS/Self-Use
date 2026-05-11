import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { AuditLog, EntityType } from '../../../core/models/audit-log.model';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-audit-log-page',
  standalone: true,
  imports: [
    FormsModule, RelativeTimePipe, JsonPipe, LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatFormFieldModule, MatSelectModule, MatButtonModule, MatIconModule,
  ],
  template: `
    <div class="page-header">
      <h1>Audit Log</h1>
    </div>

    <mat-card class="filter-card">
      <div class="filters">
        <mat-form-field appearance="outline">
          <mat-label>Entity Type</mat-label>
          <mat-select [(ngModel)]="filterType" (selectionChange)="loadData()">
            <mat-option value="">All</mat-option>
            <mat-option value="transaction">Transaction</mat-option>
            <mat-option value="loan">Loan</mat-option>
            <mat-option value="repayment">Repayment</mat-option>
            <mat-option value="user">User</mat-option>
          </mat-select>
        </mat-form-field>
      </div>
    </mat-card>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (logs().length === 0) {
      <app-empty-state icon="📜" title="No audit logs" message="No audit entries found." />
    } @else {
      <div class="log-list">
        @for (log of logs(); track log.id) {
          <mat-card class="log-entry">
            <div class="log-header">
              <div class="log-action">
                <mat-icon [class]="log.action">{{ getActionIcon(log.action) }}</mat-icon>
                <strong>{{ log.userName }}</strong>
                <span class="action-text">{{ log.action }}d</span>
                <span class="entity-badge">{{ log.entityType }}</span>
              </div>
              <span class="log-time">{{ log.timestamp | relativeTime }}</span>
            </div>
            @if (log.changes.length > 0 && log.changes[0].field !== '*') {
              <div class="changes">
                @for (change of log.changes; track change.field) {
                  <div class="change-item">
                    <span class="field-name">{{ change.field }}:</span>
                    <span class="old-value">{{ change.oldValue }}</span>
                    <mat-icon class="arrow">arrow_forward</mat-icon>
                    <span class="new-value">{{ change.newValue }}</span>
                  </div>
                }
              </div>
            }
          </mat-card>
        }
      </div>

      @if (hasMore()) {
        <div class="load-more">
          <button mat-stroked-button (click)="loadMore()">Load More</button>
        </div>
      }
    }
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .filter-card { margin-bottom: 1rem; padding: 1rem; }
    .filters { display: flex; gap: 1rem; }
    .log-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .log-entry { padding: 1rem; }
    .log-header { display: flex; justify-content: space-between; align-items: center; }
    .log-action { display: flex; align-items: center; gap: 8px; }
    .log-action mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .log-action mat-icon.create { color: #16a34a; }
    .log-action mat-icon.update { color: #2563eb; }
    .log-action mat-icon.delete { color: #dc2626; }
    .action-text { color: #64748b; }
    .entity-badge { background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
    .log-time { color: #94a3b8; font-size: 0.8rem; }
    .changes { margin-top: 8px; padding-top: 8px; border-top: 1px solid #f1f5f9; }
    .change-item { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; margin: 4px 0; }
    .field-name { font-weight: 600; color: #475569; }
    .old-value { color: #dc2626; text-decoration: line-through; }
    .new-value { color: #16a34a; }
    .arrow { font-size: 14px; width: 14px; height: 14px; color: #94a3b8; }
    .load-more { text-align: center; padding: 1rem; }
  `],
})
export class AuditLogPageComponent implements OnInit {
  private auditLogService = inject(AuditLogService);

  logs = signal<AuditLog[]>([]);
  loading = signal(true);
  hasMore = signal(false);
  filterType = '';
  private lastDoc: any = null;

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.lastDoc = null;
    const filters: any = {};
    if (this.filterType) filters.entityType = this.filterType;

    const result = await this.auditLogService.getLogs(filters, 20);
    this.logs.set(result.logs);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.logs.length === 20);
    this.loading.set(false);
  }

  async loadMore(): Promise<void> {
    const filters: any = {};
    if (this.filterType) filters.entityType = this.filterType;

    const result = await this.auditLogService.getLogs(filters, 20, this.lastDoc);
    this.logs.update((prev) => [...prev, ...result.logs]);
    this.lastDoc = result.lastDoc;
    this.hasMore.set(result.logs.length === 20);
  }

  getActionIcon(action: string): string {
    switch (action) {
      case 'create': return 'add_circle';
      case 'update': return 'edit';
      case 'delete': return 'delete';
      default: return 'info';
    }
  }
}
