import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GoalService } from '../../../core/services/goal.service';
import { Goal, GoalType, Milestone } from '../../../core/models/goal.model';
import { Timestamp } from '@angular/fire/firestore';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

@Component({
  selector: 'app-goal-form',
  standalone: true,
  imports: [
    FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatDatepickerModule, MatNativeDateModule,
  ],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit' : 'New' }} Goal</h1>
    </div>

    <mat-card class="form-card">
      <form (ngSubmit)="save()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Goal Title</mat-label>
          <input matInput [(ngModel)]="title" name="title" required placeholder="What do you want to achieve?" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <textarea matInput [(ngModel)]="description" name="description" rows="2"></textarea>
        </mat-form-field>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Goal Type</mat-label>
            <mat-select [(ngModel)]="type" name="type">
              <mat-option value="daily">Daily</mat-option>
              <mat-option value="weekly">Weekly</mat-option>
              <mat-option value="monthly">Monthly</mat-option>
              <mat-option value="yearly">Yearly</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Due Date (optional)</mat-label>
            <input matInput [matDatepicker]="picker" [(ngModel)]="dueDate" name="dueDate" />
            <mat-datepicker-toggle matIconSuffix [for]="picker" />
            <mat-datepicker #picker />
          </mat-form-field>
        </div>

        <!-- Milestones -->
        <div class="milestones-section">
          <h3>Milestones / Steps</h3>
          @for (m of milestones; track m.id; let i = $index) {
            <div class="milestone-row">
              <input class="milestone-input" [(ngModel)]="m.title" [name]="'ms_' + i" placeholder="Step..." />
              <button mat-icon-button type="button" (click)="removeMilestone(i)">
                <mat-icon>close</mat-icon>
              </button>
            </div>
          }
          <button mat-button type="button" (click)="addMilestone()" class="add-btn">
            <mat-icon>add</mat-icon> Add Milestone
          </button>
        </div>

        <div class="form-actions">
          <button mat-button type="button" (click)="cancel()">Cancel</button>
          <button mat-flat-button color="primary" type="submit" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Goal' }}
          </button>
        </div>
      </form>
    </mat-card>
  `,
  styles: [`
    .page-header { margin-bottom: 1rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; color: #1e293b; }
    .form-card { max-width: 650px; padding: 1.5rem; }
    .form-row { display: flex; gap: 1rem; }
    .form-row mat-form-field { flex: 1; }
    .full-width { width: 100%; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
    .milestones-section { margin: 1rem 0; }
    .milestones-section h3 { font-size: 0.9rem; color: #475569; margin-bottom: 8px; }
    .milestone-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .milestone-input { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px; font-size: 0.85rem; }
    .milestone-input:focus { outline: none; border-color: #4f46e5; }
    .add-btn { color: #4f46e5; }
  `],
})
export class GoalFormComponent implements OnInit {
  private goalService = inject(GoalService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  saving = signal(false);

  title = '';
  description = '';
  type: GoalType = 'monthly';
  dueDate: Date | null = null;
  milestones: Milestone[] = [];
  private editId = '';

  async ngOnInit(): Promise<void> {
    this.editId = this.route.snapshot.params['id'];
    if (this.editId) {
      this.isEdit.set(true);
      const goal = await this.goalService.getById(this.editId);
      if (goal) {
        this.title = goal.title;
        this.description = goal.description;
        this.type = goal.type;
        this.dueDate = goal.dueDate?.toDate() || null;
        this.milestones = [...goal.milestones];
      }
    }
  }

  addMilestone(): void { this.milestones.push({ id: Date.now().toString(), title: '', done: false }); }
  removeMilestone(i: number): void { this.milestones.splice(i, 1); }

  async save(): Promise<void> {
    this.saving.set(true);
    const data: Partial<Goal> = {
      title: this.title,
      description: this.description,
      type: this.type,
      dueDate: this.dueDate ? Timestamp.fromDate(this.dueDate) : null,
      milestones: this.milestones.filter((m) => m.title.trim()),
    };

    if (this.isEdit()) {
      await this.goalService.update(this.editId, data);
    } else {
      await this.goalService.create(data);
    }
    this.router.navigate(['/goals']);
    this.saving.set(false);
  }

  cancel(): void { this.router.navigate(['/goals']); }
}
