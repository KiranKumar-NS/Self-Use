import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { Segment } from '../../../core/models/segment.model';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-stock-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule],
  template: `
    <mat-card class="stock-card">
      <h3><mat-icon class="title-icon">inventory_2</mat-icon> Current Stock</h3>
      <div class="stock-items">
        @for (seg of animalSegments(); track seg.id) {
          @if (seg.currentStock != null) {
            <div class="stock-item">
              <span class="seg-icon">{{ seg.icon }}</span>
              <span class="seg-name">{{ seg.name }}</span>
              <span class="seg-count">{{ seg.currentStock }}</span>
            </div>
          }
        }
        @if (!hasStock()) {
          <p class="no-data">No stock data. Record inventory events to see counts.</p>
        }
      </div>
    </mat-card>
  `,
  styles: [`
    .stock-card { padding: 1.25rem; }
    h3 { margin: 0 0 1rem; font-size: 1rem; color: var(--color-text); display: flex; align-items: center; gap: 8px; }
    .title-icon { font-size: 20px; width: 20px; height: 20px; color: var(--color-text-secondary); }
    .stock-items { display: flex; gap: 1.5rem; flex-wrap: wrap; }
    .stock-item { display: flex; align-items: center; gap: 8px; }
    .seg-icon { font-size: 1.5rem; }
    .seg-name { font-size: 0.85rem; color: var(--color-text-secondary); }
    .seg-count { font-size: 1.5rem; font-weight: 700; color: var(--color-text); }
    .no-data { color: var(--color-text-muted); font-size: 0.85rem; margin: 0; }
  `],
})
export class StockWidgetComponent {
  @Input() segments: Segment[] = [];

  animalSegments(): Segment[] {
    return this.segments.filter(s => s.segmentType !== 'crop');
  }

  hasStock(): boolean {
    return this.animalSegments().some(s => s.currentStock != null);
  }
}
