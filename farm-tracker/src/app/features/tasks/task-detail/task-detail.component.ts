import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../../core/services/task.service';
import { Task } from '../../../core/models/task.model';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { DatePipe } from '@angular/common';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-task-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, MatCardModule, MatButtonModule, MatIconModule, MatCheckboxModule],
  template: `
    @if (task()) {
      <div class="page-header">
        <h1>{{ task()!.title }}</h1>
        <div class="header-actions">
          <button mat-stroked-button (click)="edit()"><mat-icon>edit</mat-icon> Edit</button>
          <button mat-button color="warn" (click)="deleteTask()"><mat-icon>delete</mat-icon></button>
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <mat-card class="detail-card">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Status</label>
            <span class="status-badge" [class]="task()!.status">{{ formatStatus(task()!.status) }}</span>
          </div>
          <div class="detail-item">
            <label>Priority</label>
            <span class="priority-badge" [class]="task()!.priority">{{ task()!.priority }}</span>
          </div>
          <div class="detail-item">
            <label>Due Date</label>
            <span>{{ task()!.dueDate ? (task()!.dueDate!.toDate() | date:'dd MMM yyyy') : 'No due date' }}</span>
          </div>
          <div class="detail-item">
            <label>Assigned To</label>
            <span>{{ task()!.assigneeName || 'Unassigned' }}</span>
          </div>
          @if (task()!.description) {
            <div class="detail-item full">
              <label>Description</label>
              <span>{{ task()!.description }}</span>
            </div>
          }
          @if (task()!.tags.length > 0) {
            <div class="detail-item full">
              <label>Tags</label>
              <div class="tags">
                @for (tag of task()!.tags; track tag) {
                  <span class="tag">{{ tag }}</span>
                }
              </div>
            </div>
          }
        </div>
      </mat-card>

      @if (task()!.subtasks.length > 0) {
        <h3 class="section-title">Subtasks ({{ getDone() }}/{{ task()!.subtasks.length }})</h3>
        <mat-card class="subtasks-card">
          @for (sub of task()!.subtasks; track sub.id; let i = $index) {
            <div class="subtask-item">
              <mat-checkbox [checked]="sub.done" (change)="toggleSubtask(i)">
                <span [class.done-text]="sub.done">{{ sub.title }}</span>
              </mat-checkbox>
              @if (sub.dueDate) {
                <span class="subtask-due">{{ sub.dueDate }}</span>
              }
            </div>
          }
        </mat-card>
      }
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: var(--color-text); word-break: break-word; }
    .header-actions { display: flex; gap: 4px; flex-wrap: wrap; }
    .detail-card { padding: 1.5rem; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1.5rem; }
    .detail-item label { display: block; font-size: 0.7rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px; }
    .detail-item.full { grid-column: 1 / -1; }
    .status-badge { padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
    .status-badge.backlog { background: var(--color-bg-alt); color: var(--color-text-secondary); }
    .status-badge.todo { background: var(--color-info-light); color: var(--color-info); }
    .status-badge.in_progress { background: var(--color-warning-light); color: var(--color-warning); }
    .status-badge.done { background: var(--color-income-bg); color: var(--color-income); }
    .priority-badge { padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
    .priority-badge.low { background: var(--color-bg-alt); color: var(--color-text-secondary); }
    .priority-badge.medium { background: var(--color-info-light); color: var(--color-info); }
    .priority-badge.high { background: var(--color-warning-light); color: var(--color-warning); }
    .priority-badge.urgent { background: var(--color-expense-bg); color: var(--color-danger); }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { background: var(--color-primary-light); color: var(--color-primary); padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; }
    .subtasks-card { padding: 1rem; }
    .subtask-item { padding: 6px 0; border-bottom: 1px solid var(--color-bg-alt); display: flex; align-items: center; justify-content: space-between; }
    .subtask-due { font-size: 0.7rem; color: var(--color-text-secondary); background: var(--color-bg-alt); padding: 2px 8px; border-radius: 4px; }
    .done-text { text-decoration: line-through; color: var(--color-text-muted); }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .detail-grid { grid-template-columns: 1fr 1fr; gap: 1rem; }
      .detail-card { padding: 1rem; }
    }
    @media (max-width: 480px) {
      .detail-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class TaskDetailComponent implements OnInit {
  private taskService = inject(TaskService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  task = signal<Task | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.params['id'];
    try {
      this.task.set(await this.taskService.getById(id));
    } catch (err) {
      console.error('Failed to load task', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load task');
    }
  }

  formatStatus(s: string): string { return s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  getDone(): number { return this.task()!.subtasks.filter((s) => s.done).length; }

  async toggleSubtask(i: number): Promise<void> {
    const subtasks = [...this.task()!.subtasks];
    subtasks[i] = { ...subtasks[i], done: !subtasks[i].done };
    try {
      await this.taskService.toggleSubtask(this.task()!.id, subtasks);
      this.task.set({ ...this.task()!, subtasks });
    } catch (err) {
      console.error('Failed to update subtask', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to update subtask');
    }
  }

  edit(): void { this.router.navigate(['/tasks', this.task()!.id, 'edit']); }

  deleteTask(): void {
    const task = this.task()!;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Task',
        message: `Are you sure you want to delete "${task.title}"?`,
        confirmText: 'Delete',
        showDeleteOptions: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          if (result.deleteType === 'hard') {
            await this.taskService.delete(task.id);
          } else {
            await this.taskService.softDelete(task.id);
          }
          this.back();
        } catch (err) {
          console.error('Failed to delete task', err);
          this.toast.error(err instanceof Error ? err.message : 'Failed to delete task');
        }
      }
    });
  }

  back(): void { this.router.navigate(['/tasks']); }
}
