import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-forgot-password',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  template: `
    <div class="auth-container">
      <mat-card class="auth-card">
        <mat-card-header>
          <mat-card-title>{{ 'AUTH.RESET_PASSWORD' | translate }}</mat-card-title>
          <mat-card-subtitle>{{ 'AUTH.RESET_SUBTITLE' | translate }}</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form (ngSubmit)="onReset()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'AUTH.EMAIL' | translate }}</mat-label>
              <input matInput type="email" [(ngModel)]="email" name="email" required />
              <mat-icon matPrefix>email</mat-icon>
            </mat-form-field>

            <button mat-raised-button color="primary" type="submit" class="full-width" [disabled]="loading()">
              @if (loading()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ 'AUTH.SEND_RESET_LINK' | translate }}
              }
            </button>
          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <a mat-button routerLink="/auth/login">{{ 'AUTH.BACK_TO_LOGIN' | translate }}</a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: `
    .auth-container {
      display: flex; justify-content: center; align-items: center;
      min-height: 100vh; background: linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%); padding: 16px;
    }
    .auth-card { max-width: 420px; width: 100%; }
    .full-width { width: 100%; }
  `,
})
export class ForgotPassword {
  private readonly auth = inject(AuthService);
  private readonly notify = inject(NotificationService);

  email = '';
  loading = signal(false);

  async onReset(): Promise<void> {
    if (!this.email) return;
    this.loading.set(true);
    try {
      await this.auth.resetPassword(this.email);
      this.notify.success('Password reset email sent!');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Reset failed';
      this.notify.error(message);
    } finally {
      this.loading.set(false);
    }
  }
}
