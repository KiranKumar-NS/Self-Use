import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { AppUser } from '../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { sortData, toggleSortState, getSortIndicator, paginate, totalPages, pageStart, pageEnd, SortDirection } from '../../../core/utils/table.utils';
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
      <mat-card class="table-card">
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable" (click)="toggleSort('displayName')">Name <span class="sort-icon">{{ getSortIcon('displayName') }}</span></th>
              <th class="sortable" (click)="toggleSort('email')">Email <span class="sort-icon">{{ getSortIcon('email') }}</span></th>
              <th class="sortable" (click)="toggleSort('role')">Role <span class="sort-icon">{{ getSortIcon('role') }}</span></th>
              <th>Segments</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (user of paginatedUsers(); track user.uid) {
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
      </mat-card>
    }
  `,
  styles: [`
    .table-container { background: white; border-radius: var(--radius-md); overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .role-badge { padding: 2px 8px; border-radius: var(--radius-sm); font-size: var(--font-sm); font-weight: 600; text-transform: capitalize; }
    .role-badge.admin { background: var(--color-warning-light); color: var(--color-warning); }
    .role-badge.manager { background: var(--color-info-light); color: var(--color-info); }
    .role-badge.viewer { background: var(--color-bg-alt); color: var(--color-text-secondary); }
    .segment-chip { background: var(--color-primary-light); color: var(--color-primary); padding: 2px 6px; border-radius: var(--radius-sm); font-size: 0.7rem; margin-right: 4px; }
  `],
})
export class UserManagementComponent implements OnInit {
  private userService = inject(UserService);
  private router = inject(Router);

  users = signal<AppUser[]>([]);
  loading = signal(true);

  sortColumn = '';
  sortDirection: SortDirection = 'asc';
  pageSize = 20;
  currentPage = 1;

  async ngOnInit(): Promise<void> {
    this.users.set(await this.userService.getAll());
    this.loading.set(false);
  }

  sortedUsers(): AppUser[] {
    return sortData(this.users(), this.sortColumn, this.sortDirection);
  }

  paginatedUsers(): AppUser[] {
    return paginate(this.sortedUsers(), this.currentPage, this.pageSize);
  }

  totalPages(): number { return totalPages(this.sortedUsers().length, this.pageSize); }
  pageStart(): number { return pageStart(this.sortedUsers().length, this.currentPage, this.pageSize); }
  pageEnd(): number { return pageEnd(this.sortedUsers().length, this.currentPage, this.pageSize); }

  toggleSort(column: string): void {
    const state = toggleSortState({ column: this.sortColumn, direction: this.sortDirection }, column);
    this.sortColumn = state.column;
    this.sortDirection = state.direction;
    this.currentPage = 1;
  }

  getSortIcon(column: string): string {
    return getSortIndicator(this.sortColumn, this.sortDirection, column);
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
