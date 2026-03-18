import { Component, inject, signal, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Toolbar } from '../toolbar/toolbar';
import { Sidebar } from '../sidebar/sidebar';
import { BottomNav } from '../bottom-nav/bottom-nav';
import { ConnectivityService } from '../../core/offline/connectivity.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, MatSidenavModule, Toolbar, Sidebar, BottomNav, TranslateModule],
  template: `
    @if (!connectivity.isOnline()) {
      <div class="offline-banner">
        <span>{{ 'APP.OFFLINE_MESSAGE' | translate }}</span>
      </div>
    }

    <app-toolbar (menuToggle)="toggleSidenav()" />

    <mat-sidenav-container class="sidenav-container">
      <mat-sidenav
        #sidenav
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
        class="sidenav">
        <app-sidebar />
      </mat-sidenav>

      <mat-sidenav-content [class.mobile-content]="isMobile()">
        <main class="main-content">
          <router-outlet />
        </main>
      </mat-sidenav-content>
    </mat-sidenav-container>

    @if (isMobile()) {
      <app-bottom-nav />
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; height: 100vh; }
    .offline-banner {
      background: #ff9800; color: white; text-align: center;
      padding: 4px 16px; font-size: 13px;
    }
    .sidenav-container { flex: 1; }
    .sidenav { width: 240px; }
    .main-content { padding: 16px; }
    .mobile-content { padding-bottom: 60px; }
  `,
})
export class MainLayout {
  readonly connectivity = inject(ConnectivityService);
  private readonly breakpoints = inject(BreakpointObserver);

  readonly sidenav = viewChild<MatSidenav>('sidenav');

  readonly isMobile = toSignal(
    this.breakpoints.observe([Breakpoints.Handset]).pipe(map((r) => r.matches)),
    { initialValue: false },
  );

  toggleSidenav(): void {
    this.sidenav()?.toggle();
  }
}
