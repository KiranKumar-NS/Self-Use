import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../../core/services/task.service';
import { Task } from '../../../core/models/task.model';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-task-detail',
  standalone: true,
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
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; word-break: break-word; }
    .header-actions { display: flex; gap: 4px; flex-wrap: wrap; }
    .detail-card { padding: 1.5rem; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1.5rem; }
    .detail-item label { display: block; font-size: 0.7rem; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .detail-item.full { grid-column: 1 / -1; }
    .status-badge { padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; }
    .status-badge.backlog { background: #f1f5f9; color: #64748b; }
    .status-badge.todo { background: #dbeafe; color: #1d4ed8; }
    .status-badge.in_progress { background: #fef3c7; color: #d97706; }
    .status-badge.done { background: #dcfce7; color: #16a34a; }
    .priority-badge { padding: 3px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
    .priority-badge.low { background: #f1f5f9; color: #64748b; }
    .priority-badge.medium { background: #dbeafe; color: #2563eb; }
    .priority-badge.high { background: #fef3c7; color: #d97706; }
    .priority-badge.urgent { background: #fef2f2; color: #dc2626; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { background: #e0e7ff; color: #4338ca; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; }
    .subtasks-card { padding: 1rem; }
    .subtask-item { padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; justify-content: space-between; }
    .subtask-due { font-size: 0.7rem; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
    .done-text { text-decoration: line-through; color: #94a3b8; }
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

  task = signal<Task | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.params['id'];
    this.task.set(await this.taskService.getById(id));
  }

  formatStatus(s: string): string { return s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }
  getDone(): number { return this.task()!.subtasks.filter((s) => s.done).length; }

  async toggleSubtask(i: number): Promise<void> {
    const subtasks = [...this.task()!.subtasks];
    subtasks[i] = { ...subtasks[i], done: !subtasks[i].done };
    await this.taskService.toggleSubtask(this.task()!.id, subtasks);
    this.task.set({ ...this.task()!, subtasks });
  }

  edit(): void { this.router.navigate(['/tasks', this.task()!.id, 'edit']); }
  async deleteTask(): Promise<void> { await this.taskService.delete(this.task()!.id); this.back(); }
  back(): void { this.router.navigate(['/tasks']); }
}
