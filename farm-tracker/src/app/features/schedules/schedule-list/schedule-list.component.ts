import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScheduleService } from '../../../core/services/schedule.service';
import { Schedule } from '../../../core/models/schedule.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RecurringSetupDialogComponent } from '../recurring-setup-dialog/recurring-setup-dialog.component';
import { ReminderFormDialogComponent } from '../reminder-form-dialog/reminder-form-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-schedule-list',
  standalone: true,
  imports: [
    DatePipe, FormsModule, NgTemplateOutlet,
    LoadingSpinnerComponent, EmptyStateComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatMenuModule,
    MatSlideToggleModule, MatSnackBarModule, MatTabsModule,
  ],
  template: `
    <div class="page-header">
      <div>
        <h1>Schedules & Reminders</h1>
        <p class="subtitle">Recurring transactions and scheduled reminders</p>
      </div>
      <div class="header-actions">
        <button mat-flat-button color="primary" [matMenuTriggerFor]="addMenu">
          <mat-icon>add</mat-icon> <span class="btn-label">Add</span>
        </button>
        <mat-menu #addMenu="matMenu">
          <button mat-menu-item (click)="addRecurring()">
            <mat-icon>repeat</mat-icon> Recurring Transaction
          </button>
          <button mat-menu-item (click)="addReminder()">
            <mat-icon>alarm</mat-icon> Reminder
          </button>
        </mat-menu>
      </div>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else if (schedules().length === 0) {
      <app-empty-state icon="📅" title="No schedules yet"
        message="Create recurring transactions or reminders to stay on top of your farm tasks."
        actionLabel="Add Schedule" (actionClick)="addRecurring()" />
    } @else {
      <mat-tab-group>
        <mat-tab label="All ({{ schedules().length }})">
          <ng-container *ngTemplateOutlet="scheduleCards; context: { $implicit: schedules() }" />
        </mat-tab>
        <mat-tab label="Recurring ({{ recurringSchedules().length }})">
          <ng-container *ngTemplateOutlet="scheduleCards; context: { $implicit: recurringSchedules() }" />
        </mat-tab>
        <mat-tab label="Reminders ({{ reminderSchedules().length }})">
          <ng-container *ngTemplateOutlet="scheduleCards; context: { $implicit: reminderSchedules() }" />
        </mat-tab>
      </mat-tab-group>

      <ng-template #scheduleCards let-items>
        <div class="schedule-grid">
          @for (schedule of items; track schedule.id) {
            <mat-card class="schedule-card" [class.inactive]="!schedule.isActive">
              <mat-card-content>
                <div class="card-header">
                  <div class="card-icon">
                    <mat-icon>{{ schedule.type === 'recurring_transaction' ? 'repeat' : 'alarm' }}</mat-icon>
                  </div>
                  <div class="card-info">
                    <h3>{{ schedule.title }}</h3>
                    <p class="schedule-desc">{{ schedule.description }}</p>
                  </div>
                  <mat-slide-toggle
                    [checked]="schedule.isActive"
                    (change)="toggleActive(schedule)"
                    color="primary" />
                </div>

                <div class="card-details">
                  <div class="detail-row">
                    <span class="label">Frequency</span>
                    <mat-chip-set>
                      <mat-chip [highlighted]="true">{{ schedule.frequency }}</mat-chip>
                    </mat-chip-set>
                  </div>

                  <div class="detail-row">
                    <span class="label">Next Due</span>
                    <span class="value" [class.overdue]="isOverdue(schedule)">
                      {{ schedule.nextDueDate.toDate() | date:'dd MMM yyyy' }}
                      @if (isOverdue(schedule)) {
                        <mat-icon class="overdue-icon">warning</mat-icon>
                      }
                    </span>
                  </div>

                  @if (schedule.type === 'recurring_transaction' && schedule.transactionTemplate) {
                    <div class="detail-row">
                      <span class="label">Amount</span>
                      <span class="value amount">₹{{ schedule.transactionTemplate.amount.toLocaleString('en-IN') }}</span>
                    </div>
                    <div class="detail-row">
                      <span class="label">Type</span>
                      <span class="value">{{ schedule.transactionTemplate.type }} — {{ schedule.transactionTemplate.categoryName }}</span>
                    </div>
                  }

                  @if (schedule.type === 'reminder' && schedule.reminderConfig) {
                    <div class="detail-row">
                      <span class="label">Type</span>
                      <span class="value">{{ formatReminderType(schedule.reminderConfig.reminderType) }}</span>
                    </div>
                    @if (schedule.reminderConfig.autoCreateTask) {
                      <div class="detail-row">
                        <span class="label">Auto-task</span>
                        <span class="value">✓ Creates task when due</span>
                      </div>
                    }
                  }

                  <div class="detail-row">
                    <span class="label">Processed</span>
                    <span class="value">{{ schedule.processedCount }} times</span>
                  </div>
                </div>

                <div class="card-actions">
                  <button mat-icon-button (click)="editSchedule(schedule)" title="Edit"><mat-icon>edit</mat-icon></button>
                  <button mat-icon-button color="warn" (click)="confirmDelete(schedule)" title="Delete"><mat-icon>delete</mat-icon></button>
                </div>
              </mat-card-content>
            </mat-card>
          }
        </div>
      </ng-template>
    }
  `,
  styles: [`
    .header-actions { display: flex; gap: 8px; }
    .schedule-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; padding: 16px 0; }
    .schedule-card { border-radius: 12px; }
    .schedule-card.inactive { opacity: 0.6; }
    .card-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .card-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--color-primary-bg); color: var(--color-primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .card-info { flex: 1; min-width: 0; }
    .card-info h3 { margin: 0; font-size: 1rem; font-weight: 600; }
    .schedule-desc { margin: 2px 0 0; font-size: var(--font-sm); color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .card-details { display: flex; flex-direction: column; gap: 8px; }
    .detail-row { display: flex; align-items: center; justify-content: space-between; font-size: var(--font-sm); }
    .label { color: var(--color-text-secondary); }
    .value { font-weight: 500; display: flex; align-items: center; gap: 4px; }
    .value.amount { color: var(--color-primary); font-weight: 700; }
    .value.overdue { color: var(--color-danger); }
    .overdue-icon { font-size: 16px; width: 16px; height: 16px; color: var(--color-danger); }
    .card-actions { display: flex; justify-content: flex-end; gap: 4px; margin-top: 12px; border-top: 1px solid var(--color-border); padding-top: 8px; }
    @media (max-width: 480px) { .schedule-grid { grid-template-columns: 1fr; } }
  `],
})
export class ScheduleListComponent implements OnInit {
  private scheduleService = inject(ScheduleService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  schedules = signal<Schedule[]>([]);
  loading = signal(true);

  async ngOnInit(): Promise<void> {
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.schedules.set(await this.scheduleService.getAll());
    this.loading.set(false);
  }

  recurringSchedules(): Schedule[] {
    return this.schedules().filter(s => s.type === 'recurring_transaction');
  }

  reminderSchedules(): Schedule[] {
    return this.schedules().filter(s => s.type === 'reminder');
  }

  isOverdue(schedule: Schedule): boolean {
    return schedule.isActive && schedule.nextDueDate.toDate() < new Date();
  }

  formatReminderType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  addRecurring(): void {
    const ref = this.dialog.open(RecurringSetupDialogComponent, { width: '90vw', maxWidth: '550px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Recurring transaction created', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  addReminder(): void {
    const ref = this.dialog.open(ReminderFormDialogComponent, { width: '90vw', maxWidth: '550px', data: {} });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Reminder created', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  editSchedule(schedule: Schedule): void {
    if (schedule.type === 'recurring_transaction') {
      const ref = this.dialog.open(RecurringSetupDialogComponent, { width: '90vw', maxWidth: '550px', data: { schedule } });
      ref.afterClosed().subscribe(async (result) => {
        if (result) {
          this.snackBar.open('Schedule updated', '', { duration: 2500 });
          await this.loadData();
        }
      });
    } else {
      const ref = this.dialog.open(ReminderFormDialogComponent, { width: '90vw', maxWidth: '550px', data: { schedule } });
      ref.afterClosed().subscribe(async (result) => {
        if (result) {
          this.snackBar.open('Reminder updated', '', { duration: 2500 });
          await this.loadData();
        }
      });
    }
  }

  async toggleActive(schedule: Schedule): Promise<void> {
    await this.scheduleService.toggleActive(schedule.id, !schedule.isActive);
    this.snackBar.open(schedule.isActive ? 'Schedule paused' : 'Schedule activated', '', { duration: 2000 });
    await this.loadData();
  }

  confirmDelete(schedule: Schedule): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Schedule', message: `Delete "${schedule.title}"?`, confirmText: 'Delete' } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        await this.scheduleService.softDelete(schedule.id);
        this.snackBar.open('Schedule deleted', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }
}
