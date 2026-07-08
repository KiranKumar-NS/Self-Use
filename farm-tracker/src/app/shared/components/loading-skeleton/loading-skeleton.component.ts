import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  template: `
    @switch (type) {
      @case ('cards') {
        <div class="skeleton-grid">
          @for (i of items; track i) {
            <div class="skeleton-card">
              <div class="skeleton-line skeleton-icon"></div>
              <div class="skeleton-content">
                <div class="skeleton-line skeleton-label"></div>
                <div class="skeleton-line skeleton-value"></div>
              </div>
            </div>
          }
        </div>
      }
      @case ('table') {
        <div class="skeleton-table">
          <div class="skeleton-row skeleton-header">
            @for (i of [1,2,3,4,5]; track i) {
              <div class="skeleton-line skeleton-cell"></div>
            }
          </div>
          @for (i of items; track i) {
            <div class="skeleton-row">
              @for (j of [1,2,3,4,5]; track j) {
                <div class="skeleton-line skeleton-cell"></div>
              }
            </div>
          }
        </div>
      }
      @case ('chart') {
        <div class="skeleton-chart">
          <div class="skeleton-line skeleton-chart-title"></div>
          <div class="skeleton-line skeleton-chart-area"></div>
        </div>
      }
    }
  `,
  styles: [`
    @keyframes shimmer {
      0% { background-position: -200px 0; }
      100% { background-position: calc(200px + 100%) 0; }
    }
    .skeleton-line {
      background: linear-gradient(90deg, var(--color-bg-alt) 25%, var(--color-border-light) 50%, var(--color-bg-alt) 75%);
      background-size: 200px 100%;
      animation: shimmer 1.5s ease-in-out infinite;
      border-radius: var(--radius-sm);
    }
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .skeleton-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      background: var(--color-surface);
      border-radius: var(--radius-md);
      border-left: 4px solid var(--color-bg-alt);
    }
    .skeleton-icon { width: 2rem; height: 2rem; border-radius: var(--radius-md); flex-shrink: 0; }
    .skeleton-content { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .skeleton-label { width: 60%; height: 12px; }
    .skeleton-value { width: 80%; height: 20px; }
    .skeleton-table {
      background: var(--color-surface);
      border-radius: var(--radius-md);
      overflow: hidden;
    }
    .skeleton-row {
      display: flex;
      gap: 1rem;
      padding: 12px 16px;
      border-bottom: 1px solid var(--color-border-light);
    }
    .skeleton-header { background: var(--color-bg); }
    .skeleton-header .skeleton-cell { height: 12px; }
    .skeleton-cell { flex: 1; height: 16px; }
    .skeleton-chart {
      background: var(--color-surface);
      border-radius: var(--radius-md);
      padding: 1.5rem;
    }
    .skeleton-chart-title { width: 40%; height: 16px; margin-bottom: 1rem; }
    .skeleton-chart-area { width: 100%; height: 200px; border-radius: var(--radius-md); }
  `],
})
export class LoadingSkeletonComponent {
  @Input() type: 'cards' | 'table' | 'chart' = 'cards';
  @Input() count = 3;

  get items(): number[] {
    return Array.from({ length: this.count }, (_, i) => i);
  }
}
