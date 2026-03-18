import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-user-management',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, PageHeader, TranslateModule],
  template: `
    <app-page-header titleKey="SETTINGS.TITLE" icon="settings">
      <a mat-stroked-button routerLink="/settings/farm">
        <mat-icon>business</mat-icon>
        {{ 'SETTINGS.FARM' | translate }}
      </a>
    </app-page-header>

    <mat-card>
      <mat-card-header>
        <mat-card-title>{{ 'SETTINGS.USERS' | translate }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="placeholder-text">User management interface. Admin can add/edit/deactivate users, assign roles, and manage farm access.</p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `.placeholder-text { color: #999; padding: 24px; text-align: center; }`,
})
export class UserManagement {}
