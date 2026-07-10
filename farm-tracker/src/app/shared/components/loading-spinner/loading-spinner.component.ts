import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-loading-spinner',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="spinner-container">
      <div class="spinner"></div>
    </div>
  `,
  styles: [`
    .spinner-container {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class LoadingSpinnerComponent {}
