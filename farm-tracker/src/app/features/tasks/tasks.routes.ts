import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

export const TASK_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./kanban-board/kanban-board.component').then(m => m.KanbanBoardComponent) },
  { path: 'new', loadComponent: () => import('./task-form/task-form.component').then(m => m.TaskFormComponent), canDeactivate: [unsavedChangesGuard] },
  { path: ':id', loadComponent: () => import('./task-detail/task-detail.component').then(m => m.TaskDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./task-form/task-form.component').then(m => m.TaskFormComponent), canDeactivate: [unsavedChangesGuard] },
];
