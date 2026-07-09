import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  showDeleteOptions?: boolean;
  showInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputType?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
      @if (data.showInput) {
        <div class="input-row">
          <label>{{ data.inputLabel || 'Details' }}</label>
          <input [(ngModel)]="inputValue" [placeholder]="data.inputPlaceholder || ''" [type]="data.inputType || 'text'" class="dialog-input" />
        </div>
      }
      @if (data.showDeleteOptions) {
        <mat-radio-group [(ngModel)]="deleteType" class="delete-options">
          <mat-radio-button value="hard">Permanently delete</mat-radio-button>
          <mat-radio-button value="soft">Soft delete (keep in records)</mat-radio-button>
        </mat-radio-group>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)">{{ data.cancelText || 'Cancel' }}</button>
      <button mat-flat-button color="warn" (click)="confirm()">{{ data.confirmText || 'Confirm' }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .delete-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }
    .input-row { margin-top: 12px; }
    .input-row label { display: block; font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 4px; }
    .dialog-input { width: 100%; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: 6px; font-size: 0.9rem; }
  `],
})
export class ConfirmDialogComponent {
  data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  deleteType: 'hard' | 'soft' = 'hard';
  inputValue = '';

  confirm(): void {
    if (this.data.showDeleteOptions) {
      this.dialogRef.close({ confirmed: true, deleteType: this.deleteType });
    } else if (this.data.showInput) {
      this.dialogRef.close({ confirmed: true, inputValue: this.inputValue });
    } else {
      this.dialogRef.close(true);
    }
  }
}
