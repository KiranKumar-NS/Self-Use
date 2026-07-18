import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { SupplierService } from '../../../core/services/supplier.service';
import { Supplier } from '../../../core/models/supplier.model';

export interface SupplierFormDialogData {
  supplier?: Supplier;
}

@Component({
  selector: 'app-supplier-form-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ data.supplier ? 'Edit' : 'Add' }} Supplier</h2>
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

        <mat-form-field appearance="outline">
          <mat-label>GST Number</mat-label>
          <input matInput [(ngModel)]="gstNumber" />
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Item Categories</mat-label>
          <input matInput [(ngModel)]="itemCategoriesStr" placeholder="feed, medicine, tools..." />
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
        {{ saving() ? 'Saving...' : (data.supplier ? 'Update' : 'Add Supplier') }}
      </button>
    </mat-dialog-actions>
  `,
})
export class SupplierFormDialogComponent implements OnInit {
  data = inject<SupplierFormDialogData>(MAT_DIALOG_DATA);
  dialogRef = inject(MatDialogRef<SupplierFormDialogComponent>);
  private supplierService = inject(SupplierService);

  saving = signal(false);
  error = signal('');

  name = '';
  phone = '';
  location = '';
  gstNumber = '';
  itemCategoriesStr = '';
  note = '';

  ngOnInit(): void {
    if (this.data?.supplier) {
      this.name = this.data.supplier.name;
      this.phone = this.data.supplier.phone || '';
      this.location = this.data.supplier.location || '';
      this.gstNumber = this.data.supplier.gstNumber || '';
      this.itemCategoriesStr = (this.data.supplier.itemCategories || []).join(', ');
      this.note = this.data.supplier.note || '';
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const itemCategories = this.itemCategoriesStr
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const formData: Partial<Supplier> = {
        name: this.name,
        phone: this.phone,
        location: this.location,
        gstNumber: this.gstNumber,
        itemCategories,
        note: this.note,
      };

      if (this.data?.supplier) {
        await this.supplierService.update(this.data.supplier.id, formData);
      } else {
        await this.supplierService.create(formData);
      }
      this.dialogRef.close(true);
    } catch (err: any) {
      this.error.set(err.message || 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }
}
