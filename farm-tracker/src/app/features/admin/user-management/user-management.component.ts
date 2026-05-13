import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService } from '../../../core/services/user.service';
import { AppUser } from '../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [LoadingSpinnerComponent, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatSlideToggleModule],
  template: `
    <div class="page-header">
      <h1>User Management</h1>
      <button mat-flat-button color="primary" (click)="addUser()">
        <mat-icon>person_add</mat-icon> Add User
      </button>
    </div>

    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Segments</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (user of users(); track user.uid) {
              <tr>
                <td>{{ user.displayName }}</td>
                <td>{{ user.email }}</td>
                <td>
                  <span class="role-badge" [class]="user.role">{{ user.role }}</span>
                </td>
                <td>
                  @for (seg of user.assignedSegments; track seg) {
                    <span class="segment-chip">{{ seg }}</span>
                  }
                </td>
                <td>
                  <mat-slide-toggle
                    [checked]="user.isActive"
                    (change)="toggleActive(user)"
                    color="primary" />
                </td>
                <td>
                  <button mat-icon-button (click)="editUser(user.uid)">
                    <mat-icon>edit</mat-icon>
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .table-container { background: white; border-radius: 8px; overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .data-table td { padding: 12px 16px; border-top: 1px solid #f1f5f9; font-size: 0.875rem; }
    .role-badge { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: capitalize; }
    .role-badge.admin { background: #fef3c7; color: #d97706; }
    .role-badge.manager { background: #dbeafe; color: #2563eb; }
    .role-badge.viewer { background: #f1f5f9; color: #64748b; }
    .segment-chip { background: #e0e7ff; color: #4338ca; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; margin-right: 4px; }
  `],
})
export class UserManagementComponent implements OnInit {
  private userService = inject(UserService);
  private router = inject(Router);

  users = signal<AppUser[]>([]);
  loading = signal(true);

  async ngOnInit(): Promise<void> {
    this.users.set(await this.userService.getAll());
    this.loading.set(false);
  }

  addUser(): void {
    this.router.navigate(['/admin/register']);
  }

  editUser(uid: string): void {
    this.router.navigate(['/admin/users', uid]);
  }

  async toggleActive(user: AppUser): Promise<void> {
    await this.userService.toggleActive(user.uid, !user.isActive);
    this.users.set(await this.userService.getAll());
  }
}
