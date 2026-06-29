import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TaskService } from '../../../core/services/task.service';
import { UserService } from '../../../core/services/user.service';
import { AuthService } from '../../../core/services/auth.service';
import { Task, TaskPriority, TaskStatus, TaskVisibility, Subtask } from '../../../core/models/task.model';
import { AppUser } from '../../../core/models/user.model';
import { Timestamp } from '@angular/fire/firestore';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule, MatCheckboxModule,
  ],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit' : 'New' }} Task</h1>
    </div>

    <mat-card class="form-card">
      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }

      <form (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Task Title</mat-label>
          <input matInput [(ngModel)]="title" name="title" required placeholder="What needs to be done?" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description (optional)</mat-label>
          <textarea matInput [(ngModel)]="description" name="description" rows="3"></textarea>
        </mat-form-field>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Priority</mat-label>
            <mat-select [(ngModel)]="priority" name="priority">
              <mat-option value="low">Low</mat-option>
              <mat-option value="medium">Medium</mat-option>
              <mat-option value="high">High</mat-option>
              <mat-option value="urgent">Urgent</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Status</mat-label>
            <mat-select [(ngModel)]="status" name="status">
              <mat-option value="backlog">Backlog</mat-option>
              <mat-option value="todo">To Do</mat-option>
              <mat-option value="in_progress">In Progress</mat-option>
              <mat-option value="done">Done</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Assign To</mat-label>
            <mat-select [(ngModel)]="assignee" name="assignee">
              @for (u of users(); track u.uid) {
                <mat-option [value]="u.uid">{{ u.displayName }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Visibility</mat-label>
            <mat-select [(ngModel)]="visibility" name="visibility">
              <mat-option value="shared">Shared (everyone sees)</mat-option>
              <mat-option value="personal">Personal (only me)</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Due Date (optional)</mat-label>
            <input matInput [matDatepicker]="picker" [(ngModel)]="dueDate" name="dueDate" />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>

        </div>

        <!-- Subtasks -->
        <div class="subtasks-section">
          <h3>Subtasks / Checklist</h3>
          @for (sub of subtasks; track sub.id; let i = $index) {
            <div class="subtask-row">
              <mat-checkbox [(ngModel)]="sub.done" [name]="'sub_' + i" />
              <input class="subtask-input" [(ngModel)]="sub.title" [name]="'subtitle_' + i" />
              <input type="date" class="subtask-date" [(ngModel)]="sub.dueDate" [name]="'subdate_' + i" title="Due date" />
              <button mat-icon-button type="button" (click)="removeSubtask(i)">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
          <button mat-button type="button" (click)="addSubtask()" class="add-btn">
            <mat-icon>add</mat-icon> Add Subtask
          </button>
        </div>

        <!-- Tags -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Tags (comma separated)</mat-label>
          <input matInput [(ngModel)]="tagsInput" name="tags" placeholder="e.g. farm, urgent, weekly" />
        </mat-form-field>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Task' }}
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .form-card { max-width: 700px; padding: 1.5rem; }
    .form-row { display: flex; gap: 1rem; }
    .form-row mat-form-field { flex: 1; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .error-msg { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    .subtasks-section { margin: 1rem 0; }
    .subtasks-section h3 { font-size: 0.9rem; color: #475569; margin-bottom: 8px; }
    .subtask-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
    .subtask-input { flex: 1; min-width: 0; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 0.85rem; }
    .subtask-input:focus { outline: none; border-color: #4f46e5; }
    .subtask-date { border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; font-size: 0.8rem; color: #475569; width: 140px; }
    .subtask-date:focus { outline: none; border-color: #4f46e5; }
    .add-btn { color: #4f46e5; font-size: 0.85rem; }
    @media (max-width: 640px) {
      .form-row { flex-direction: column; gap: 0; }
      .form-card { padding: 1rem; }
      .subtask-row { flex-wrap: wrap; }
      .subtask-date { width: 100%; }
    }
  `],
})
export class TaskFormComponent implements OnInit {
  private taskService = inject(TaskService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  error = signal('');
  saving = signal(false);
  users = signal<AppUser[]>([]);

  title = '';
  description = '';
  priority: TaskPriority = 'medium';
  status: TaskStatus = 'todo';
  visibility: TaskVisibility = 'shared';
  assignee = '';
  dueDate: Date | null = null;
  subtasks: Subtask[] = [];
  tagsInput = '';
  private editId = '';

  async ngOnInit(): Promise<void> {
    const allUsers = await this.userService.getAll();
    this.users.set(allUsers.filter((u) => u.isActive));
    this.assignee = this.authService.currentUser()?.uid || '';

    this.editId = this.route.snapshot.params['id'];
    if (this.editId) {
      this.isEdit.set(true);
      const task = await this.taskService.getById(this.editId);
      if (task) {
        this.title = task.title;
        this.description = task.description;
        this.priority = task.priority;
        this.status = task.status;
        this.visibility = task.visibility || 'shared';
        this.assignee = task.assignee || '';
        this.dueDate = task.dueDate?.toDate() || null;
        this.subtasks = [...task.subtasks];
        this.tagsInput = task.tags.join(', ');
      }
    }
  }

  addSubtask(): void { this.subtasks.push({ id: Date.now().toString(), title: '', done: false, dueDate: null }); }
  removeSubtask(i: number): void { this.subtasks.splice(i, 1); }

  async save(): Promise<void> {
    if (!this.title.trim()) { this.error.set('Title is required'); return; }
    this.error.set('');
    this.saving.set(true);

    const tags = this.tagsInput ? this.tagsInput.split(',').map((t) => t.trim()).filter(Boolean) : [];
    const assigneeUser = this.users().find((u) => u.uid === this.assignee);
    const data: Partial<Task> = {
      title: this.title,
      description: this.description,
      priority: this.priority,
      status: this.status,
      visibility: this.visibility,
      assignee: this.assignee || null,
      assigneeName: assigneeUser?.displayName || null,
      dueDate: this.dueDate ? Timestamp.fromDate(this.dueDate) : null,
      subtasks: this.subtasks.filter((s) => s.title.trim()),
      tags,
    };

    try {
      if (this.isEdit()) {
        await this.taskService.update(this.editId, data);
      } else {
        await this.taskService.create(data);
      }
      this.router.navigate(['/tasks']);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void { this.router.navigate(['/tasks']); }
}
