import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent],
  template: `
    <div class="app-layout">
      <app-sidebar />
      <div class="main-area">
        <app-header />
        <main class="content">
          <router-outlet />
        </main>
      </div>
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
  `],
})
export class ShellComponent implements OnInit {
  private notificationService = inject(NotificationService);

  ngOnInit(): void {
    this.notificationService.refresh().catch(() => {});
  }
}
