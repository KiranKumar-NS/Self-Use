import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
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
  imports: [FormsModule, LoadingSpinnerComponent, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatSlideToggleModule],
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
              <th class="sortable" (click)="toggleSort('displayName')">Name <span class="sort-icon">{{ getSortIcon('displayName') }}</span></th>
              <th class="sortable hide-mobile" (click)="toggleSort('email')">Email <span class="sort-icon">{{ getSortIcon('email') }}</span></th>
              <th class="sortable" (click)="toggleSort('role')">Role <span class="sort-icon">{{ getSortIcon('role') }}</span></th>
              <th class="hide-mobile">Segments</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (user of paginatedUsers(); track user.uid) {
              <tr>
                <td>{{ user.displayName }}</td>
                <td class="hide-mobile">{{ user.email }}</td>
                <td>
                  <span class="role-badge" [class]="user.role">{{ user.role }}</span>
                </td>
                <td class="hide-mobile">
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
        @if (users().length > 0) {
          <div class="pagination">
            <div class="page-size">
              <span>Rows per page:</span>
              <select [(ngModel)]="pageSize" (change)="currentPage = 1">
                <option [ngValue]="10">10</option>
                <option [ngValue]="20">20</option>
                <option [ngValue]="50">50</option>
              </select>
            </div>
            <span class="page-info">{{ pageStart() }}–{{ pageEnd() }} of {{ sortedUsers().length }}</span>
            <div class="page-buttons">
              <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = 1"><mat-icon>first_page</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage === 1" (click)="currentPage = currentPage - 1"><mat-icon>chevron_left</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = currentPage + 1"><mat-icon>chevron_right</mat-icon></button>
              <button mat-icon-button [disabled]="currentPage >= totalPages()" (click)="currentPage = totalPages()"><mat-icon>last_page</mat-icon></button>
            </div>
          </div>
        }
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
    .sortable { cursor: pointer; user-select: none; }
    .sortable:hover { color: #1e293b; }
    .sort-icon { font-size: 0.7rem; color: #94a3b8; }
    .pagination {
      display: flex; align-items: center; justify-content: flex-end; gap: 1rem;
      padding: 8px 16px; border-top: 1px solid #e2e8f0; font-size: 0.8rem; color: #64748b;
    }
    .page-size { display: flex; align-items: center; gap: 6px; }
    .page-size select { border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 6px; font-size: 0.8rem; background: white; color: #334155; }
    .page-info { font-size: 0.8rem; }
    .page-buttons { display: flex; align-items: center; }
    .page-buttons button { width: 32px; height: 32px; }
    @media (max-width: 768px) {
      .page-header { flex-direction: column; gap: 0.75rem; align-items: flex-start; }
    }
    @media (max-width: 640px) {
      .hide-mobile { display: none; }
    }
  `],
})
export class UserManagementComponent implements OnInit {
  private userService = inject(UserService);
  private router = inject(Router);

  users = signal<AppUser[]>([]);
  loading = signal(true);

  sortColumn = '';
  sortDirection: 'asc' | 'desc' = 'asc';
  pageSize = 20;
  currentPage = 1;

  async ngOnInit(): Promise<void> {
    this.users.set(await this.userService.getAll());
    this.loading.set(false);
  }

  sortedUsers(): AppUser[] {
    let data = this.users();
    if (this.sortColumn) {
      data = [...data].sort((a, b) => {
        let valA: any = (a as any)[this.sortColumn];
        let valB: any = (b as any)[this.sortColumn];
        if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = (valB || '').toLowerCase(); }
        const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
        return this.sortDirection === 'asc' ? cmp : -cmp;
      });
    }
    return data;
  }

  paginatedUsers(): AppUser[] {
    const all = this.sortedUsers();
    const start = (this.currentPage - 1) * this.pageSize;
    return all.slice(start, start + this.pageSize);
  }

  totalPages(): number { return Math.max(1, Math.ceil(this.sortedUsers().length / this.pageSize)); }
  pageStart(): number { return this.sortedUsers().length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1; }
  pageEnd(): number { return Math.min(this.currentPage * this.pageSize, this.sortedUsers().length); }

  toggleSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.currentPage = 1;
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return '↕';
    return this.sortDirection === 'asc' ? '↑' : '↓';
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
