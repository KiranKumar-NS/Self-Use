import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="text-center py-12">
      <span class="text-4xl">{{ icon }}</span>
      <h3 class="mt-2 text-lg font-medium text-gray-900">{{ title }}</h3>
      <p class="mt-1 text-sm text-gray-500">{{ message }}</p>
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = '📭';
  @Input() title = 'No data';
  @Input() message = 'No records found.';
}
