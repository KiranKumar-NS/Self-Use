import { Routes } from '@angular/router';

export const TASK_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./kanban-board/kanban-board.component').then(m => m.KanbanBoardComponent) },
  { path: 'new', loadComponent: () => import('./task-form/task-form.component').then(m => m.TaskFormComponent) },
  { path: ':id', loadComponent: () => import('./task-detail/task-detail.component').then(m => m.TaskDetailComponent) },
  { path: ':id/edit', loadComponent: () => import('./task-form/task-form.component').then(m => m.TaskFormComponent) },
];
