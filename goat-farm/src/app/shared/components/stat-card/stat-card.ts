import { Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-stat-card',
  imports: [MatCardModule, MatIconModule],
  template: `
    <mat-card class="stat-card" [style.border-left-color]="color()">
      <mat-card-content>
        <div class="stat-content">
          <div>
            <p class="stat-label">{{ label() }}</p>
            <p class="stat-value">{{ value() }}</p>
            @if (subtitle()) {
              <p class="stat-subtitle">{{ subtitle() }}</p>
            }
          </div>
          <mat-icon class="stat-icon" [style.color]="color()">{{ icon() }}</mat-icon>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .stat-card {
      border-left: 4px solid;
      transition: transform 0.2s;
    }
    .stat-card:hover { transform: translateY(-2px); }
    .stat-content { display: flex; justify-content: space-between; align-items: center; }
    .stat-label { margin: 0; color: #666; font-size: 13px; text-transform: uppercase; }
    .stat-value { margin: 4px 0; font-size: 28px; font-weight: 600; }
    .stat-subtitle { margin: 0; color: #999; font-size: 12px; }
    .stat-icon { font-size: 40px; height: 40px; width: 40px; opacity: 0.7; }
  `,
})
export class StatCard {
  label = input.required<string>();
  value = input.required<string | number>();
  icon = input('info');
  color = input('#2e7d32');
  subtitle = input('');
}
