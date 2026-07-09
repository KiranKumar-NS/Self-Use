import { Component, inject, OnInit, signal } from '@angular/core';
import { ChildrenOutletContexts, RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';
import { NotificationService } from '../../core/services/notification.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { routeAnimation } from '../../core/utils/route-animations';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, BottomNavComponent],
  animations: [routeAnimation],
  template: `
    <div class="app-layout">
      <app-sidebar [open]="sidebarOpen()" (closed)="sidebarOpen.set(false)" />
      <div class="main-area">
        <app-header (menuToggle)="sidebarOpen.set(!sidebarOpen())" />
        <main class="content">
          <div [@routeAnimation]="getRouteAnimationData()">
            <router-outlet />
          </div>
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
      min-width: 0;
      margin-left: 250px;
      display: flex;
      flex-direction: column;
    }
    .content {
      flex: 1;
      min-width: 0;
      padding: 24px;
      background: var(--color-bg);
    }
    @media (max-width: 768px) {
      .main-area { margin-left: 0; }
      .content { padding: 16px 16px 72px; }
    }
  `],
})
export class ShellComponent implements OnInit {
  private notificationService = inject(NotificationService);
  private scheduleService = inject(ScheduleService);
  private contexts = inject(ChildrenOutletContexts);
  sidebarOpen = signal(false);

  getRouteAnimationData() {
    return this.contexts.getContext('primary')?.route?.snapshot?.url;
  }

  ngOnInit(): void {
    this.scheduleService.processOverdueSchedules().catch(() => {});
    this.notificationService.refresh().catch(() => {});
  }
}
