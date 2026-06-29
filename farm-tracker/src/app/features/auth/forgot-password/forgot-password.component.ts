import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <div class="forgot-container">
      <mat-card class="forgot-card">
        <mat-card-header>
          <mat-card-title>Reset Password</mat-card-title>
          <mat-card-subtitle>Enter your email to receive a reset link</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }
          @if (success()) {
            <div class="success-message">{{ success() }}</div>
          }
          <form (ngSubmit)="reset()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <input matInput type="email" [(ngModel)]="email" name="email" required />
            </mat-form-field>
            <button mat-flat-button color="primary" class="full-width" type="submit" [disabled]="loading()">
              Send Reset Link
            </button>
          </form>
          <div class="back-link">
            <a routerLink="/auth/login">Back to Login</a>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .forgot-container {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f1f5f9;
    }
    .forgot-card { width: 100%; max-width: 400px; padding: 2rem; margin: 0 1rem; }
    @media (max-width: 480px) {
      .forgot-card { padding: 1rem; }
    }
    .full-width { width: 100%; }
    .error-message { background: #fef2f2; color: #dc2626; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    .success-message { background: #f0fdf4; color: #16a34a; padding: 8px 16px; border-radius: 6px; margin-bottom: 1rem; }
    .back-link { text-align: center; margin-top: 1rem; }
    .back-link a { color: #4f46e5; text-decoration: none; }
  `],
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);
  email = '';
  error = signal('');
  success = signal('');
  loading = signal(false);

  async reset(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.authService.resetPassword(this.email);
      this.success.set('Password reset email sent! Check your inbox.');
    } catch (err: any) {
      this.error.set(err.message || 'Failed to send reset email');
    } finally {
      this.loading.set(false);
    }
  }
}
