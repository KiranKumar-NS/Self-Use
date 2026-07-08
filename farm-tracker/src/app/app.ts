import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [],
})
export class App implements OnInit, OnDestroy {
  private swUpdate = inject(SwUpdate);
  private snackBar = inject(MatSnackBar);
  private subscription?: Subscription;
  private updateInterval?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (this.swUpdate.isEnabled) {
      this.subscription = this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') {
          const ref = this.snackBar.open('A new version is available', 'Update', { duration: 0 });
          ref.onAction().subscribe(() => {
            this.swUpdate.activateUpdate().then(() => document.location.reload());
          });
        }
      });

      this.swUpdate.checkForUpdate();
      this.updateInterval = setInterval(() => this.swUpdate.checkForUpdate(), 30_000);
    }
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    if (this.updateInterval) clearInterval(this.updateInterval);
  }
}
