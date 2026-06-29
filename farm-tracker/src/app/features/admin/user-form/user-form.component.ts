import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../../core/services/user.service';
import { SegmentService } from '../../../core/services/segment.service';
import { AppUser, UserRole } from '../../../core/models/user.model';
import { Segment } from '../../../core/models/segment.model';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [
    FormsModule, LoadingSpinnerComponent,
    MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
  ],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else {
      <div class="page-header">
        <h1>Edit User</h1>
      </div>

      <mat-card class="form-card">
        @if (error()) {
          <div class="error-message">{{ error() }}</div>
        }
        @if (success()) {
          <div class="success-message">{{ success() }}</div>
        }

        <form (ngSubmit)="save()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Display Name</mat-label>
            <input matInput [(ngModel)]="displayName" name="displayName" required />
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Role</mat-label>
            <mat-select [(ngModel)]="role" name="role" required>
              <mat-option value="admin">Admin</mat-option>
              <mat-option value="manager">Manager</mat-option>
              <mat-option value="viewer">Viewer</mat-option>
            </mat-select>
          </mat-form-field>

          @if (role === 'manager') {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Assigned Segments</mat-label>
              <mat-select [(ngModel)]="assignedSegments" name="segments" multiple>
                @for (seg of segments(); track seg.id) {
                  <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }

          <div class="form-actions">
            <button mat-button type="button" (click)="cancel()">Cancel</button>
            <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'Saving...' : 'Save Changes' }}
            </button>
          </div>
        </form>
      </mat-card>
    }
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .form-card { width: 100%; max-width: 500px; padding: 1.5rem; }
    @media (max-width: 480px) {
      .form-card { padding: 1rem; }
    }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .error-message { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    .success-message { background: #f0fdf4; color: #16a34a; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
  `],
})
export class UserFormComponent implements OnInit {
  private userService = inject(UserService);
  private segmentService = inject(SegmentService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  loading = signal(true);
  saving = signal(false);
  error = signal('');
  success = signal('');
  segments = signal<Segment[]>([]);

  displayName = '';
  role: UserRole = 'manager';
  assignedSegments: string[] = [];
  private userId = '';

  async ngOnInit(): Promise<void> {
    this.userId = this.route.snapshot.params['id'];
    const [user, segments] = await Promise.all([
      this.userService.getById(this.userId),
      this.segmentService.getAll(),
    ]);

    this.segments.set(segments);
    if (user) {
      this.displayName = user.displayName;
      this.role = user.role;
      this.assignedSegments = user.assignedSegments || [];
    }
    this.loading.set(false);
  }

  async save(): Promise<void> {
    this.error.set('');
    this.success.set('');
    this.saving.set(true);
    try {
      await this.userService.update(this.userId, {
        displayName: this.displayName,
        role: this.role,
        assignedSegments: this.role === 'admin'
          ? this.segments().map((s) => s.id)
          : this.assignedSegments,
      });
      this.success.set('User updated successfully!');
    } catch (err: any) {
      this.error.set(err.message || 'Failed to update user');
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    this.router.navigate(['/admin']);
  }
}
