import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { UserRole } from '../../../core/models/user.model';
import { ToastService } from '../../../core/services/toast.service';
import { withTimeout } from '../../../core/utils/async.utils';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule, MatChipsModule],
  template: `
    <div class="register-container">
      <mat-card class="register-card">
        <mat-card-header>
          <mat-card-title>Register New User</mat-card-title>
          <mat-card-subtitle>Create a new team member account</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }
          @if (success()) {
            <div class="success-message">{{ success() }}</div>
          }
          <form (ngSubmit)="register()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Display Name</mat-label>
              <input matInput [(ngModel)]="displayName" name="displayName" required />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <input matInput type="email" [(ngModel)]="email" name="email" required />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput type="password" [(ngModel)]="password" name="password" required minlength="6" />
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Role</mat-label>
              <mat-select [(ngModel)]="role" name="role" required>
                <mat-option value="admin">Admin</mat-option>
                <mat-option value="manager">Manager</mat-option>
                <mat-option value="viewer">Viewer</mat-option>
              </mat-select>
            </mat-form-field>

            @if (role !== 'admin') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Assigned Segments</mat-label>
                <mat-select [(ngModel)]="selectedSegments" name="segments" multiple>
                  @for (seg of segments(); track seg.id) {
                    <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
                  }
                </mat-select>
                @if (role === 'viewer') {
                  <mat-hint>Viewer sees data only for these segments. No segments = no data.</mat-hint>
                } @else {
                  <mat-hint>Manager can view and record data only for these segments. No segments = no data.</mat-hint>
                }
              </mat-form-field>
            }

            <button mat-flat-button color="primary" class="full-width" type="submit" [disabled]="loading()">
              {{ loading() ? 'Creating...' : 'Create User' }}
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .register-container { padding: 24px; }
    .register-card { width: 100%; max-width: 500px; padding: 1.5rem; }
    @media (max-width: 480px) {
      .register-card { padding: 1rem; }
      .register-container { padding: 16px; }
    }
    .full-width { width: 100%; }
    .error-message {
      background: var(--color-expense-bg); color: var(--color-danger);
      padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem;
    }
    .success-message {
      background: var(--color-income-bg); color: var(--color-income);
      padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem;
    }
  `],
})
export class RegisterComponent implements OnInit {
  private authService = inject(AuthService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);
  private toast = inject(ToastService);

  displayName = signal('');
  email = signal('');
  password = signal('');
  role: UserRole = 'manager';
  selectedSegments: string[] = [];
  segments = signal<Segment[]>([]);
  error = signal('');
  success = signal('');
  loading = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.segments.set(await this.segmentService.getAll());
    } catch (err) {
      console.error('[Register] ngOnInit', err);
      this.toast.error('Failed to load data. Check your connection and try again.');
    }
  }

  async register(): Promise<void> {
    this.error.set('');
    this.success.set('');
    this.loading.set(true);
    try {
      const assignedSegments = this.role === 'admin'
        ? this.segments().map((s) => s.id)
        : this.selectedSegments;

      await withTimeout(this.authService.register(
        this.email(), this.password(), this.displayName(),
        this.role, assignedSegments
      ));
      this.success.set(`User "${this.displayName()}" created successfully!`);
      this.displayName.set('');
      this.email.set('');
      this.password.set('');
    } catch (err: any) {
      this.error.set(this.friendlyError(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Turn Firebase Auth/Firestore error codes into guidance an admin can act on. */
  private friendlyError(err: any): string {
    switch (err?.code) {
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. If this user was removed, delete the leftover login in Firebase Console → Authentication (or run firebase/delete-auth-user.js) before recreating.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is disabled in the Firebase console.';
      case 'permission-denied':
        return 'Your admin account is missing the admin claim — run set-custom-claims.js and log in again.';
      default:
        return err?.message || 'Registration failed';
    }
  }
}
