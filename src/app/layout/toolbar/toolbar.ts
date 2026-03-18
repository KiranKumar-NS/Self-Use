import { Component, inject, output } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ConnectivityService } from '../../core/offline/connectivity.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-toolbar',
  imports: [UpperCasePipe, MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule, MatDividerModule, TranslateModule],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button (click)="menuToggle.emit()">
        <mat-icon>menu</mat-icon>
      </button>
      <span class="toolbar-title">{{ 'APP.TITLE' | translate }}</span>

      <span class="spacer"></span>

      @if (!connectivity.isOnline()) {
        <mat-icon class="offline-icon" matTooltip="Offline">cloud_off</mat-icon>
      }

      <button mat-icon-button [matMenuTriggerFor]="langMenu">
        <mat-icon>language</mat-icon>
      </button>
      <mat-menu #langMenu="matMenu">
        <button mat-menu-item (click)="setLanguage('en')">English</button>
        <button mat-menu-item (click)="setLanguage('ta')">தமிழ்</button>
      </mat-menu>

      <button mat-icon-button [matMenuTriggerFor]="userMenu">
        <mat-icon>account_circle</mat-icon>
      </button>
      <mat-menu #userMenu="matMenu">
        <div mat-menu-item disabled>
          <mat-icon>person</mat-icon>
          <span>{{ auth.currentUser()?.displayName }}</span>
        </div>
        <div mat-menu-item disabled>
          <mat-icon>badge</mat-icon>
          <span>{{ auth.currentUser()?.role | uppercase }}</span>
        </div>
        <mat-divider></mat-divider>
        <button mat-menu-item (click)="logout()">
          <mat-icon>logout</mat-icon>
          <span>{{ 'AUTH.LOGOUT' | translate }}</span>
        </button>
      </mat-menu>
    </mat-toolbar>
  `,
  styles: `
    .spacer { flex: 1; }
    .toolbar-title { margin-left: 8px; font-size: 18px; }
    .offline-icon { color: #ffca28; margin-right: 8px; }
    mat-toolbar { position: sticky; top: 0; z-index: 1000; }
  `,
})
export class Toolbar {
  readonly auth = inject(AuthService);
  readonly connectivity = inject(ConnectivityService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  menuToggle = output<void>();

  setLanguage(lang: string): void {
    this.translate.use(lang);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/auth/login']);
  }
}
