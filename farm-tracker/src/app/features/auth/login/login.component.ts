import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <div class="branding">
          <div class="brand-icon">
            <mat-icon>agriculture</mat-icon>
          </div>
          <h1 class="brand-title">Farm Tracker</h1>
          <p class="brand-subtitle">Sign in to manage your farm finances</p>
        </div>
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
      background: linear-gradient(135deg, var(--color-income-bg) 0%, var(--color-bg-alt) 50%, var(--color-purple-light) 100%);
    }
    .login-card {
      width: 100%;
      max-width: 400px;
      padding: 2rem;
      margin: 0 1rem;
    }
    .branding {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .brand-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: 16px;
      background: var(--color-income);
      color: white;
      margin-bottom: 0.75rem;
    }
    .brand-icon mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }
    .brand-title {
      margin: 0;
      font-size: var(--font-2xl);
      font-weight: 700;
      color: var(--color-text);
    }
    .brand-subtitle {
      margin: 4px 0 0;
      font-size: var(--font-base);
      color: var(--color-text-secondary);
    }
    .full-width { width: 100%; }
    .error-message {
      background: var(--color-expense-bg);
      color: var(--color-expense);
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
      color: var(--color-primary);
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
