import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { BuyerService } from '../../../core/services/buyer.service';
import { Buyer } from '../../../core/models/buyer.model';

export interface BuyerFormDialogData {
  buyer?: Buyer;
}

@Component({
  selector: 'app-buyer-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.buyer ? 'Edit' : 'Add' }} Buyer</h2>
    <mat-dialog-content>
      <div class="form-grid">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name</mat-label>
          <input matInput [(ngModel)]="name" required />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Phone</mat-label>
          <input matInput [(ngModel)]="phone" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Location</mat-label>
          <input matInput [(ngModel)]="location" />
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Note</mat-label>
          <input matInput [(ngModel)]="note" />
        </mat-form-field>
      </div>

      @if (error()) {
        <div class="error-msg">{{ error() }}</div>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button color="primary" [disabled]="saving() || !name.trim()" (click)="save()">
        {{ saving() ? 'Saving...' : (data.buyer ? 'Update' : 'Add Buyer') }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
    .full-width { grid-column: 1 / -1; }
    .error-msg { background: var(--color-expense-bg); color: var(--color-danger); padding: 8px 16px; border-radius: 6px; margin-top: 8px; }
    @media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } }
  `],
})
export class BuyerFormDialogComponent implements OnInit {
  data = inject<BuyerFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<BuyerFormDialogComponent>);
  private buyerService = inject(BuyerService);

  saving = signal(false);
  error = signal('');

  name = '';
  phone = '';
  location = '';
  note = '';

  ngOnInit(): void {
    if (this.data?.buyer) {
      this.name = this.data.buyer.name;
      this.phone = this.data.buyer.phone || '';
      this.location = this.data.buyer.location || '';
      this.note = this.data.buyer.note || '';
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const formData = { name: this.name, phone: this.phone, location: this.location, note: this.note };
      if (this.data?.buyer) {
        await this.buyerService.update(this.data.buyer.id, formData);
      } else {
        await this.buyerService.create(formData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
