import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="empty-state">
      <span class="empty-icon">{{ icon }}</span>
      <h3 class="empty-title">{{ title }}</h3>
      <p class="empty-message">{{ message }}</p>
      @if (actionLabel) {
        <button mat-flat-button color="primary" class="empty-action" (click)="actionClick.emit()">{{ actionLabel }}</button>
      }
    </div>
  `,
  styles: [`
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
    }
    .empty-icon { font-size: 2.5rem; display: block; margin-bottom: 0.5rem; }
    .empty-title { margin: 0.5rem 0; font-size: 1.1rem; font-weight: 600; color: var(--color-text); }
    .empty-message { margin: 0; font-size: var(--font-base); color: var(--color-text-secondary); }
    .empty-action { margin-top: 1rem; }
  `],
})
export class EmptyStateComponent {
  @Input() icon = '📭';
  @Input() title = 'No data';
  @Input() message = 'No records found.';
  @Input() actionLabel = '';
  @Output() actionClick = new EventEmitter<void>();
}
