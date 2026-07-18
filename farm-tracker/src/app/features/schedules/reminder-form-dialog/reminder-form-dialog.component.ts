import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Timestamp } from '@angular/fire/firestore';

import { ScheduleService } from '../../../core/services/schedule.service';
import { Schedule, RepeatFrequency, ReminderType } from '../../../core/models/schedule.model';
import { TaskPriority } from '../../../core/models/task.model';
import { SegmentService } from '../../../core/services/segment.service';
import { AnimalService } from '../../../core/services/animal.service';
import { Segment } from '../../../core/models/segment.model';
import { Animal } from '../../../core/models/animal.model';
import { ToastService } from '../../../core/services/toast.service';

export interface ReminderFormDialogData {
  schedule?: Schedule;
}

@Component({
  selector: 'app-reminder-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatDatepickerModule, MatCheckboxModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.schedule ? 'Edit' : 'Create' }} Reminder</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Title</mat-label>
          <input matInput [(ngModel)]="title" placeholder="e.g. Goat vaccination due" required />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description</mat-label>
          <input matInput [(ngModel)]="description" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Reminder Type</mat-label>
          <mat-select [(ngModel)]="reminderType">
            <mat-option value="vaccination">Vaccination</mat-option>
            <mat-option value="deworming">Deworming</mat-option>
            <mat-option value="spraying">Crop Spraying</mat-option>
            <mat-option value="fertilizer">Fertilizer</mat-option>
            <mat-option value="insurance">Insurance Renewal</mat-option>
            <mat-option value="loan_emi">Loan EMI</mat-option>
            <mat-option value="breeding_checkup">Breeding Checkup</mat-option>
            <mat-option value="harvest">Harvest</mat-option>
            <mat-option value="custom">Custom</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Frequency</mat-label>
          <mat-select [(ngModel)]="frequency">
            <mat-option value="daily">Daily</mat-option>
            <mat-option value="weekly">Weekly</mat-option>
            <mat-option value="biweekly">Biweekly</mat-option>
            <mat-option value="monthly">Monthly</mat-option>
            <mat-option value="quarterly">Quarterly</mat-option>
            <mat-option value="yearly">Yearly</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>First Due Date</mat-label>
          <input matInput [matDatepicker]="duePicker" [(ngModel)]="startDate" required />
          <mat-datepicker-toggle matSuffix [for]="duePicker" />
          <mat-datepicker #duePicker />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Notify Days Before</mat-label>
          <input matInput type="number" [(ngModel)]="notifyDaysBefore" min="0" max="30" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Segment</mat-label>
          <mat-select [(ngModel)]="selectedSegment" (selectionChange)="onSegmentChange()">
            <mat-option value="">None</mat-option>
            @for (seg of segments(); track seg.id) {
              <mat-option [value]="seg.id">{{ seg.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (animalSegment() && animals().length > 0) {
          <mat-form-field appearance="outline">
            <mat-label>Linked Animals</mat-label>
            <mat-select [(ngModel)]="selectedAnimalIds" multiple>
              @for (animal of animals(); track animal.id) {
                <mat-option [value]="animal.id">{{ getAnimalName(animal) }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <div class="full-width checkbox-row">
          <mat-checkbox [(ngModel)]="autoCreateTask">Auto-create task when due</mat-checkbox>
        </div>

        @if (autoCreateTask()) {
          <mat-form-field appearance="outline">
            <mat-label>Task Priority</mat-label>
            <mat-select [(ngModel)]="taskPriority">
              <mat-option value="low">Low</mat-option>
              <mat-option value="medium">Medium</mat-option>
              <mat-option value="high">High</mat-option>
              <mat-option value="urgent">Urgent</mat-option>
            </mat-select>
          </mat-form-field>
        }
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !title().trim()" (click)="save()">
        {{ saving() ? 'Saving...' : (data.schedule ? 'Update' : 'Create') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .checkbox-row { margin: 8px 0 16px; }
  `],
})
export class ReminderFormDialogComponent implements OnInit {
  data = inject<ReminderFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ReminderFormDialogComponent>);
  private scheduleService = inject(ScheduleService);
  private segmentService = inject(SegmentService);
  private animalService = inject(AnimalService);
  private toast = inject(ToastService);

  saving = signal(false);
  error = signal('');
  segments = signal<Segment[]>([]);
  animals = signal<Animal[]>([]);
  animalSegment = signal(false);

  // Fields
  title = signal('');
  description = signal('');
  reminderType = signal<ReminderType>('vaccination');
  frequency = signal<RepeatFrequency>('monthly');
  startDate = signal<Date>(new Date());
  notifyDaysBefore = signal(3);
  selectedSegment = signal('');
  selectedAnimalIds = signal<string[]>([]);
  autoCreateTask = signal(true);
  taskPriority = signal<TaskPriority>('medium');

  private segmentName = '';

  async ngOnInit(): Promise<void> {
    try {
      this.segments.set(await this.segmentService.getAll());
    } catch (err) {
      console.error('Failed to load segments', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load segments');
    }

    if (this.data?.schedule) {
      const s = this.data.schedule;
      this.title.set(s.title);
      this.description.set(s.description);
      this.frequency.set(s.frequency);
      this.startDate.set(s.startDate.toDate());

      if (s.reminderConfig) {
        this.reminderType.set(s.reminderConfig.reminderType);
        this.notifyDaysBefore.set(s.reminderConfig.notifyDaysBefore);
        this.autoCreateTask.set(s.reminderConfig.autoCreateTask);
        this.taskPriority.set(s.reminderConfig.taskPriority || 'medium');
        this.selectedSegment.set(s.reminderConfig.linkedSegment || '');
        this.selectedAnimalIds.set(s.reminderConfig.linkedAnimalIds || []);
        if (this.selectedSegment()) await this.loadAnimals();
      }
    }
  }

  async onSegmentChange(): Promise<void> {
    const seg = this.segments().find(s => s.id === this.selectedSegment());
    this.segmentName = seg?.name || '';
    this.animalSegment.set(seg?.segmentType === 'animal');
    this.selectedAnimalIds.set([]);
    if (this.animalSegment()) {
      await this.loadAnimals();
    } else {
      this.animals.set([]);
    }
  }

  private async loadAnimals(): Promise<void> {
    if (!this.selectedSegment()) return;
    try {
      const result = await this.animalService.getActiveBySegment(this.selectedSegment());
      this.animals.set(result);
    } catch (err) {
      console.error('Failed to load animals', err);
      this.toast.error(err instanceof Error ? err.message : 'Failed to load animals');
    }
  }

  getAnimalName(animal: Animal): string {
    return this.animalService.getDisplayName(animal);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const animalNames = this.selectedAnimalIds().map(id => {
        const a = this.animals().find(an => an.id === id);
        return a ? this.animalService.getDisplayName(a) : id;
      });

      const scheduleData: Partial<Schedule> = {
        type: 'reminder',
        title: this.title(),
        description: this.description(),
        frequency: this.frequency(),
        startDate: Timestamp.fromDate(this.startDate()),
        nextDueDate: Timestamp.fromDate(this.startDate()),
        reminderConfig: {
          reminderType: this.reminderType(),
          linkedSegment: this.selectedSegment() || undefined,
          linkedSegmentName: this.segmentName || undefined,
          linkedAnimalIds: this.selectedAnimalIds().length > 0 ? this.selectedAnimalIds() : undefined,
          linkedAnimalNames: animalNames.length > 0 ? animalNames : undefined,
          autoCreateTask: this.autoCreateTask(),
          taskPriority: this.autoCreateTask() ? this.taskPriority() : undefined,
          notifyDaysBefore: this.notifyDaysBefore(),
        },
      };

      if (this.data?.schedule) {
        await this.scheduleService.update(this.data.schedule.id, scheduleData);
      } else {
        await this.scheduleService.create(scheduleData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
