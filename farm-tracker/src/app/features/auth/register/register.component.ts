import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { SegmentService } from '../../../core/services/segment.service';
import { Segment } from '../../../core/models/segment.model';
import { UserRole } from '../../../core/models/user.model';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-register',
  standalone: true,
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

            @if (role === 'manager') {
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Assigned Segments</mat-label>
                <mat-select [(ngModel)]="selectedSegments" name="segments" multiple>
                  @for (seg of segments(); track seg.id) {
                    <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
                  }
                </mat-select>
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
    .register-card { max-width: 500px; padding: 1.5rem; }
    .full-width { width: 100%; }
    .error-message {
      background: #fef2f2; color: #dc2626;
      padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem;
    }
    .success-message {
      background: #f0fdf4; color: #16a34a;
      padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem;
    }
  `],
})
export class RegisterComponent implements OnInit {
  private authService = inject(AuthService);
  private segmentService = inject(SegmentService);
  private router = inject(Router);

  displayName = '';
  email = '';
  password = '';
  role: UserRole = 'manager';
  selectedSegments: string[] = [];
  segments = signal<Segment[]>([]);
  error = signal('');
  success = signal('');
  loading = signal(false);

  async ngOnInit(): Promise<void> {
    this.segments.set(await this.segmentService.getAll());
  }

  async register(): Promise<void> {
    this.error.set('');
    this.success.set('');
    this.loading.set(true);
    try {
      const assignedSegments = this.role === 'admin'
        ? this.segments().map((s) => s.id)
        : this.selectedSegments;

      await this.authService.register(
        this.email, this.password, this.displayName,
        this.role, assignedSegments
      );
      this.success.set(`User "${this.displayName}" created successfully!`);
      this.displayName = '';
      this.email = '';
      this.password = '';
    } catch (err: any) {
      this.error.set(err.message || 'Registration failed');
    } finally {
      this.loading.set(false);
    }
  }
}
