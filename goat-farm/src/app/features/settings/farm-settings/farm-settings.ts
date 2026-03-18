import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-farm-settings',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, PageHeader, TranslateModule],
  template: `
    <app-page-header titleKey="SETTINGS.FARM" icon="business">
      <a mat-button routerLink="/settings"><mat-icon>arrow_back</mat-icon>Back</a>
    </app-page-header>

    <mat-card>
      <mat-card-header>
        <mat-card-title>{{ 'SETTINGS.FARM' | translate }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="placeholder-text">Farm configuration: name, location, default breeds, notification preferences.</p>
      </mat-card-content>
    </mat-card>
  `,
  styles: `.placeholder-text { color: #999; padding: 24px; text-align: center; }`,
})
export class FarmSettings {}
