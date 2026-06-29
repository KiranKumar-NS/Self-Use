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
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
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
  `],
})
export class ConfirmDialogComponent {
  data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  deleteType: 'hard' | 'soft' = 'hard';

  confirm(): void {
    if (this.data.showDeleteOptions) {
      this.dialogRef.close({ confirmed: true, deleteType: this.deleteType });
    } else {
      this.dialogRef.close(true);
    }
  }
}
