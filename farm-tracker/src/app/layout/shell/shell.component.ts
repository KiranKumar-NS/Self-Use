import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, BottomNavComponent],
  template: `
    <div class="app-layout">
      <app-sidebar [open]="sidebarOpen()" (closed)="sidebarOpen.set(false)" />
      <div class="main-area">
        <app-header (menuToggle)="sidebarOpen.set(!sidebarOpen())" />
        <main class="content">
          <router-outlet />
        </main>
      </div>
      <app-bottom-nav (moreClick)="sidebarOpen.set(!sidebarOpen())" />
    </div>
  `,
  styles: [`
    .app-layout {
      display: flex;
      min-height: 100vh;
    }
    .main-area {
      flex: 1;
      margin-left: 250px;
      display: flex;
      flex-direction: column;
    }
    .content {
      flex: 1;
      padding: 24px;
      background: #f8fafc;
    }
    @media (max-width: 768px) {
      .main-area { margin-left: 0; }
      .content { padding: 16px 16px 72px; }
    }
  `],
})
export class ShellComponent implements OnInit {
  private notificationService = inject(NotificationService);
  sidebarOpen = signal(false);

  ngOnInit(): void {
    this.notificationService.refresh().catch(() => {});
  }
}
