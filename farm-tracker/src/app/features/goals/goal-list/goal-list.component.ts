import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GoalService } from '../../../core/services/goal.service';
import { Goal } from '../../../core/models/goal.model';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCheckboxModule } from '@angular/material/checkbox';

@Component({
  selector: 'app-goal-list',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, MatProgressBarModule, MatCheckboxModule],
  template: `
    <div class="page-header">
      <h1>Goals</h1>
      <button mat-flat-button color="primary" (click)="addGoal()">
        <mat-icon>add</mat-icon> New Goal
      </button>
    </div>

    @if (goals().length === 0) {
      <div class="empty">
        <p>No goals yet. Set your first goal to start tracking progress!</p>
      </div>
    } @else {
      <div class="goals-grid">
        @for (goal of goals(); track goal.id) {
          <mat-card class="goal-card" [class]="goal.status">
            <div class="goal-header">
              <span class="goal-type">{{ goal.type }}</span>
              <span class="goal-status" [class]="goal.status">{{ formatStatus(goal.status) }}</span>
            </div>
            <h3 class="goal-title">{{ goal.title }}</h3>
            @if (goal.description) {
              <p class="goal-desc">{{ goal.description }}</p>
            }
            <div class="progress-section">
              <div class="progress-info"><span>{{ goal.progress }}%</span></div>
              <mat-progress-bar mode="determinate" [value]="goal.progress" />
            </div>
            @if (goal.milestones.length > 0) {
              <div class="milestones">
                @for (m of goal.milestones; track m.id; let i = $index) {
                  <div class="milestone-item">
                    <mat-checkbox [checked]="m.done" (change)="toggleMilestone(goal, i)">
                      <span [class.done-text]="m.done">{{ m.title }}</span>
                    </mat-checkbox>
                  </div>
                }
              </div>
            }
            <div class="goal-actions">
              <button mat-button (click)="editGoal(goal.id)"><mat-icon>edit</mat-icon></button>
              <button mat-button color="warn" (click)="deleteGoal(goal.id)"><mat-icon>delete</mat-icon></button>
            </div>
          </mat-card>
        }
      </div>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .empty { text-align: center; padding: 3rem; color: #64748b; }
    .goals-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
    .goal-card { padding: 1.25rem; border-left: 4px solid #e2e8f0; }
    .goal-card.in_progress { border-color: #f59e0b; }
    .goal-card.completed { border-color: #16a34a; }
    .goal-header { display: flex; justify-content: space-between; margin-bottom: 8px; }
    .goal-type { font-size: 0.7rem; font-weight: 700; color: #4f46e5; text-transform: uppercase; background: #e0e7ff; padding: 2px 8px; border-radius: 4px; }
    .goal-status { font-size: 0.7rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
    .goal-status.not_started { background: #f1f5f9; color: #64748b; }
    .goal-status.in_progress { background: #fef3c7; color: #d97706; }
    .goal-status.completed { background: #dcfce7; color: #16a34a; }
    .goal-title { margin: 0 0 6px; font-size: 1rem; color: #1e293b; }
    .goal-desc { margin: 0 0 12px; font-size: 0.8rem; color: #64748b; }
    .progress-section { margin-bottom: 12px; }
    .progress-info { display: flex; justify-content: flex-end; font-size: 0.75rem; color: #64748b; margin-bottom: 4px; }
    .milestones { margin-top: 8px; }
    .milestone-item { padding: 2px 0; }
    .done-text { text-decoration: line-through; color: #94a3b8; }
    .goal-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
  `],
})
export class GoalListComponent implements OnInit {
  private goalService = inject(GoalService);
  private router = inject(Router);
  goals = signal<Goal[]>([]);

  async ngOnInit(): Promise<void> {
    this.goals.set(await this.goalService.getAll());
  }

  formatStatus(s: string): string { return s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

  async toggleMilestone(goal: Goal, i: number): Promise<void> {
    const milestones = [...goal.milestones];
    milestones[i] = { ...milestones[i], done: !milestones[i].done };
    await this.goalService.updateProgress(goal.id, milestones);
    this.goals.set(await this.goalService.getAll());
  }

  addGoal(): void { this.router.navigate(['/goals/new']); }
  editGoal(id: string): void { this.router.navigate(['/goals', id, 'edit']); }

  async deleteGoal(id: string): Promise<void> {
    await this.goalService.delete(id);
    this.goals.set(await this.goalService.getAll());
  }
}
