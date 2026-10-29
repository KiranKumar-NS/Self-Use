import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

export const ADMIN_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./user-management/user-management.component').then(m => m.UserManagementComponent) },
  { path: 'users/:id', loadComponent: () => import('./user-form/user-form.component').then(m => m.UserFormComponent) },
  { path: 'register', loadComponent: () => import('../auth/register/register.component').then(m => m.RegisterComponent) },
  { path: 'data-setup', loadComponent: () => import('./data-setup/data-setup.component').then(m => m.DataSetupComponent) },
  { path: 'notes', loadComponent: () => import('../notes/notes-page/notes-page.component').then(m => m.NotesPageComponent), canDeactivate: [unsavedChangesGuard] },
];
