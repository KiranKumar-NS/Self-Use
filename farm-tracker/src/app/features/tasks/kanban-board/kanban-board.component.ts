import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { TaskService } from '../../../core/services/task.service';
import { Task, TaskStatus } from '../../../core/models/task.model';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-kanban-board',
  standalone: true,
  imports: [DragDropModule, FormsModule, DatePipe, MatCardModule, MatButtonModule, MatIconModule, MatButtonToggleModule],
  template: `
    <div class="page-header">
      <div>
        <h1>Tasks</h1>
        <p class="subtitle">Drag cards to change status</p>
      </div>
      <div class="header-actions">
        <mat-button-toggle-group [(ngModel)]="viewFilter" (change)="loadTasks()">
          <mat-button-toggle value="all">All Tasks</mat-button-toggle>
          <mat-button-toggle value="mine">My Tasks</mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-flat-button color="primary" (click)="addTask()">
          <mat-icon>add</mat-icon> New Task
        </button>
      </div>
    </div>

    <div class="kanban-container">
      @for (col of columnDefs; track col.id) {
        <div class="kanban-column">
          <div class="column-header" [class]="col.id">
            <span class="column-title">{{ col.label }}</span>
            <span class="count">{{ getColumn(col.id).length }}</span>
          </div>
          <div class="card-list"
            cdkDropList [cdkDropListData]="getColumn(col.id)"
            [id]="col.id" [cdkDropListConnectedTo]="connectedLists(col.id)"
            (cdkDropListDropped)="drop($event, col.id)">
            @for (task of getColumn(col.id); track task.id) {
              <mat-card class="task-card" [class.done-card]="col.id === 'done'" [class.personal-card]="task.visibility === 'personal'" cdkDrag (click)="openTask(task.id)">
                <div class="task-top">
                  <span class="priority-dot" [class]="task.priority"></span>
                  @if (task.visibility === 'personal') {
                    <span class="personal-badge">Personal</span>
                  }
                </div>
                <div class="task-title">{{ task.title }}</div>
                <div class="task-meta">
                  @if (task.dueDate) {
                    <span class="due-date">
                      <mat-icon class="meta-icon">event</mat-icon>
                      {{ task.dueDate.toDate() | date:'dd MMM' }}
                    </span>
                  }
                  @if (task.subtasks.length > 0) {
                    <span class="subtask-count">
                      <mat-icon class="meta-icon">checklist</mat-icon>
                      {{ getDone(task) }}/{{ task.subtasks.length }}
                    </span>
                  }
                </div>
                @if (task.assigneeName) {
                  <span class="assignee">{{ task.assigneeName }}</span>
                }
              </mat-card>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .subtitle { margin: 4px 0 0; color: #94a3b8; font-size: 0.8rem; }
    .header-actions { display: flex; gap: 12px; align-items: center; }
    .kanban-container { display: flex; gap: 1rem; overflow-x: auto; min-height: 70vh; padding-bottom: 1rem; }
    .kanban-column { flex: 1; min-width: 240px; max-width: 300px; }
    .column-header {
      display: flex; align-items: center; gap: 8px; padding: 10px 14px;
      border-radius: 8px 8px 0 0; font-weight: 700; font-size: 0.85rem;
    }
    .column-header.backlog { background: #f1f5f9; color: #64748b; }
    .column-header.todo { background: #dbeafe; color: #1d4ed8; }
    .column-header.in_progress { background: #fef3c7; color: #d97706; }
    .column-header.done { background: #dcfce7; color: #16a34a; }
    .count { background: rgba(0,0,0,0.1); padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; }
    .card-list {
      min-height: 200px; background: #f8fafc; border-radius: 0 0 8px 8px;
      padding: 8px; display: flex; flex-direction: column; gap: 8px;
    }
    .task-card { padding: 12px; cursor: grab; transition: box-shadow 0.2s; }
    .task-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .task-card.done-card { opacity: 0.6; }
    .task-card.personal-card { border-left: 3px solid #7c3aed; }
    .task-top { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .personal-badge { font-size: 0.6rem; font-weight: 700; color: #7c3aed; background: #ede9fe; padding: 1px 6px; border-radius: 4px; }
    .task-title { font-size: 0.85rem; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
    .task-meta { display: flex; align-items: center; gap: 10px; font-size: 0.75rem; color: #64748b; }
    .meta-icon { font-size: 14px; width: 14px; height: 14px; vertical-align: middle; margin-right: 2px; }
    .priority-dot { width: 8px; height: 8px; border-radius: 50%; }
    .priority-dot.low { background: #94a3b8; }
    .priority-dot.medium { background: #3b82f6; }
    .priority-dot.high { background: #f59e0b; }
    .priority-dot.urgent { background: #dc2626; }
    .due-date { display: flex; align-items: center; }
    .subtask-count { display: flex; align-items: center; color: #4f46e5; font-weight: 600; }
    .assignee { font-size: 0.7rem; color: #94a3b8; margin-top: 6px; display: block; }
    .cdk-drag-preview { box-shadow: 0 8px 24px rgba(0,0,0,0.15); border-radius: 8px; }
    .cdk-drag-placeholder { opacity: 0.3; border: 2px dashed #94a3b8; border-radius: 8px; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
      .header-actions { flex-wrap: wrap; gap: 8px; }
      .kanban-container { padding-bottom: 0.5rem; }
      .kanban-column { min-width: 80vw; max-width: none; }
    }
  `],
})
export class KanbanBoardComponent implements OnInit {
  private taskService = inject(TaskService);
  private router = inject(Router);

  columns = signal<Record<TaskStatus, Task[]>>({ backlog: [], todo: [], in_progress: [], done: [] });
  viewFilter: 'all' | 'mine' = 'all';

  columnDefs = [
    { id: 'backlog' as TaskStatus, label: 'Backlog' },
    { id: 'todo' as TaskStatus, label: 'To Do' },
    { id: 'in_progress' as TaskStatus, label: 'In Progress' },
    { id: 'done' as TaskStatus, label: 'Done' },
  ];

  async ngOnInit(): Promise<void> {
    await this.loadTasks();
  }

  async loadTasks(): Promise<void> {
    this.columns.set(await this.taskService.getByStatus(this.viewFilter));
  }

  getColumn(status: TaskStatus): Task[] {
    return this.columns()[status];
  }

  connectedLists(current: string): string[] {
    return this.columnDefs.map((c) => c.id).filter((id) => id !== current);
  }

  async drop(event: CdkDragDrop<Task[]>, newStatus: TaskStatus): Promise<void> {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(event.previousContainer.data, event.container.data, event.previousIndex, event.currentIndex);
      const task = event.container.data[event.currentIndex];
      await this.taskService.updateStatus(task.id, newStatus);
    }
    this.columns.set({ ...this.columns() });
  }

  addTask(): void { this.router.navigate(['/tasks/new']); }
  openTask(id: string): void { this.router.navigate(['/tasks', id]); }
  getDone(task: Task): number { return task.subtasks.filter((s) => s.done).length; }
}
