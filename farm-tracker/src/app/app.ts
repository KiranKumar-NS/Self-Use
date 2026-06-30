import { Component, inject, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  styles: [],
})
export class App implements OnInit {
  private swUpdate = inject(SwUpdate);

  ngOnInit(): void {
    if (this.swUpdate.isEnabled) {
      // Check for updates every 30 seconds
      setInterval(() => this.swUpdate.checkForUpdate(), 30_000);

      // When a new version is ready, activate it and reload
      this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') {
          this.swUpdate.activateUpdate().then(() => document.location.reload());
        }
      });
    }
  }
}
