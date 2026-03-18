import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { USER_ROLES } from '../../../core/constants/roles.constant';
import { UserRole } from '../../../core/models';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-register',
  imports: [
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  template: `
    <div class="auth-container">
      <mat-card class="auth-card">
        <mat-card-header>
          <mat-card-title>
            <mat-icon class="auth-icon">agriculture</mat-icon>
            <span>{{ 'AUTH.REGISTER_TITLE' | translate }}</span>
          </mat-card-title>
        </mat-card-header>

        <mat-card-content>
          <form (ngSubmit)="onRegister()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'AUTH.FULL_NAME' | translate }}</mat-label>
              <input matInput [(ngModel)]="displayName" name="displayName" required />
              <mat-icon matPrefix>person</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'AUTH.EMAIL' | translate }}</mat-label>
              <input matInput type="email" [(ngModel)]="email" name="email" required />
              <mat-icon matPrefix>email</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'AUTH.PHONE' | translate }}</mat-label>
              <input matInput type="tel" [(ngModel)]="phone" name="phone" />
              <mat-icon matPrefix>phone</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'AUTH.PASSWORD' | translate }}</mat-label>
              <input matInput type="password" [(ngModel)]="password" name="password" required minlength="6" />
              <mat-icon matPrefix>lock</mat-icon>
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'AUTH.ROLE' | translate }}</mat-label>
              <mat-select [(ngModel)]="role" name="role">
                @for (r of roles; track r.value) {
                  <mat-option [value]="r.value">{{ r.labelEn }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <button mat-raised-button color="primary" type="submit" class="full-width" [disabled]="loading()">
              @if (loading()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ 'AUTH.REGISTER' | translate }}
              }
            </button>
          </form>
        </mat-card-content>

        <mat-card-actions align="end">
          <a mat-button routerLink="/auth/login">{{ 'AUTH.HAVE_ACCOUNT' | translate }}</a>
        </mat-card-actions>
      </mat-card>
    </div>
  `,
  styles: `
    .auth-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #2e7d32 0%, #66bb6a 100%);
      padding: 16px;
    }
    .auth-card { max-width: 420px; width: 100%; }
    .auth-icon { font-size: 32px; height: 32px; width: 32px; margin-right: 8px; vertical-align: middle; }
    .full-width { width: 100%; }
  `,
})
export class Register {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notify = inject(NotificationService);

  readonly roles = USER_ROLES;
  displayName = '';
  email = '';
  phone = '';
  password = '';
  role: UserRole = 'admin';
  loading = signal(false);

  async onRegister(): Promise<void> {
    if (!this.email || !this.password || !this.displayName) return;
    this.loading.set(true);
    try {
      await this.auth.register(this.email, this.password, this.displayName, this.phone, this.role);
      this.notify.success('Account created successfully!');
      this.router.navigate(['/dashboard']);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      this.notify.error(message);
    } finally {
      this.loading.set(false);
    }
  }
}
