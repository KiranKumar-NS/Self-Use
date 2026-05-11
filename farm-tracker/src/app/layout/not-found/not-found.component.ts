import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, MatButtonModule],
  template: `
    <div class="not-found">
      <h1>404</h1>
      <p>Page not found</p>
      <a mat-flat-button color="primary" routerLink="/dashboard">Go to Dashboard</a>
    </div>
  `,
  styles: [`
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    h1 { font-size: 6rem; color: #4f46e5; margin: 0; }
    p { font-size: 1.25rem; color: #64748b; margin-bottom: 2rem; }
  `],
})
export class NotFoundComponent {}
