import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-header>
          <mat-card-title>Farm Tracker Login</mat-card-title>
          <mat-card-subtitle>Sign in to manage your farm finances</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (error()) {
            <div class="error-message">{{ error() }}</div>
          }
          <form (ngSubmit)="login()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <input matInput type="email" [(ngModel)]="email" name="email" required />
              <mat-icon matPrefix>email</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Password</mat-label>
              <input matInput type="password" [(ngModel)]="password" name="password" required />
              <mat-icon matPrefix>lock</mat-icon>
            </mat-form-field>

            <button mat-flat-button color="primary" class="full-width" type="submit" [disabled]="loading()">
              {{ loading() ? 'Signing in...' : 'Sign In' }}
            </button>
          </form>
          <div class="forgot-link">
            <a routerLink="/auth/forgot-password">Forgot password?</a>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .login-container {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: #f1f5f9;
    }
    .login-card {
      width: 100%;
      max-width: 400px;
      padding: 2rem;
      margin: 0 1rem;
    }
    .full-width { width: 100%; }
    .error-message {
      background: #fef2f2;
      color: #dc2626;
      padding: 8px 16px;
      border-radius: 6px;
      margin-bottom: 1rem;
      font-size: 0.875rem;
    }
    .forgot-link {
      text-align: center;
      margin-top: 1rem;
    }
    .forgot-link a {
      color: #4f46e5;
      text-decoration: none;
      font-size: 0.875rem;
    }
  `],
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  error = signal('');
  loading = signal(false);

  async login(): Promise<void> {
    this.error.set('');
    this.loading.set(true);
    try {
      await this.authService.login(this.email, this.password);
      this.router.navigate(['/dashboard']);
    } catch (err: any) {
      this.error.set(err.message || 'Login failed');
    } finally {
      this.loading.set(false);
    }
  }
}
