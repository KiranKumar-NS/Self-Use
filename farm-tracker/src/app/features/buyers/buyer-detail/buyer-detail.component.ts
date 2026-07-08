import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { BuyerService } from '../../../core/services/buyer.service';
import { AnimalService } from '../../../core/services/animal.service';
import { Buyer } from '../../../core/models/buyer.model';
import { Animal } from '../../../core/models/animal.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { BuyerFormDialogComponent } from '../buyer-form-dialog/buyer-form-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-buyer-detail',
  standalone: true,
  imports: [DatePipe, CurrencyInrPipe, LoadingSpinnerComponent, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (buyer()) {
      <div class="page-header">
        <h1>{{ buyer()!.name }}</h1>
        <div class="header-actions">
          <button mat-stroked-button (click)="editBuyer()">
            <mat-icon>edit</mat-icon> Edit
          </button>
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <mat-card class="detail-card">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Phone</label>
            <span>{{ buyer()!.phone || 'Not provided' }}</span>
          </div>
          <div class="detail-item">
            <label>Location</label>
            <span>{{ buyer()!.location || 'Not provided' }}</span>
          </div>
          <div class="detail-item">
            <label>Total Purchases</label>
            <span class="stat-value">{{ buyer()!.totalPurchases }}</span>
          </div>
          <div class="detail-item">
            <label>Total Amount Paid</label>
            <span class="stat-value income">{{ buyer()!.totalAmountPaid | currencyInr }}</span>
          </div>
          <div class="detail-item">
            <label>Average Rate</label>
            <span>{{ buyer()!.averageRate ? (buyer()!.averageRate | currencyInr) : '-' }}</span>
          </div>
          <div class="detail-item">
            <label>Last Purchase</label>
            <span>{{ buyer()!.lastPurchaseDate ? (buyer()!.lastPurchaseDate!.toDate() | date:'dd MMM yyyy') : 'Never' }}</span>
          </div>
          @if (buyer()!.note) {
            <div class="detail-item full">
              <label>Note</label>
              <span>{{ buyer()!.note }}</span>
            </div>
          }
        </div>
      </mat-card>

      <!-- Purchase History -->
      <h3 class="section-title">Purchase History</h3>
      <mat-card class="table-card">
        @if (purchaseHistory().length === 0) {
          <div class="empty">No purchase history yet.</div>
        } @else {
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Animal</th>
                  <th>Segment</th>
                  <th>Sale Price</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                @for (animal of purchaseHistory(); track animal.id) {
                  <tr class="clickable-row" (click)="viewAnimal(animal.id)">
                    <td><strong>{{ animalService.getDisplayName(animal) }}</strong></td>
                    <td>{{ animal.segmentName }}</td>
                    <td class="amount-cell income">{{ animal.salePrice | currencyInr }}</td>
                    <td class="date-cell">{{ animal.exitDate?.toDate() | date:'dd MMM yyyy' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </mat-card>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.75rem; }
    .page-header h1 { margin: 0; font-size: 1.5rem; }
    .header-actions { display: flex; gap: 8px; }
    .detail-card { padding: 1.5rem; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; }
    .detail-item label { display: block; font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px; }
    .detail-item span { font-size: 1rem; color: var(--color-text); }
    .detail-item.full { grid-column: 1 / -1; }
    .stat-value { font-weight: 700; font-size: 1.25rem !important; }
    .stat-value.income { color: var(--color-income); }
    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; }
    .amount-cell.income { color: var(--color-income); font-weight: 600; }
    .empty { padding: 1.5rem; color: var(--color-text-secondary); }
    @media (max-width: 768px) {
      .detail-grid { grid-template-columns: 1fr 1fr; }
      .page-header { flex-direction: column; align-items: flex-start; }
    }
  `],
})
export class BuyerDetailComponent implements OnInit {
  private buyerService = inject(BuyerService);
  animalService = inject(AnimalService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  buyer = signal<Buyer | null>(null);
  purchaseHistory = signal<Animal[]>([]);
  loading = signal(true);
  private buyerId = '';

  async ngOnInit(): Promise<void> {
    this.buyerId = this.route.snapshot.params['id'];
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const [buyer, animals] = await Promise.all([
      this.buyerService.getById(this.buyerId),
      this.animalService.getAll({ status: 'sold' }),
    ]);
    this.buyer.set(buyer);
    this.purchaseHistory.set(animals.filter(a => a.buyerId === this.buyerId));
    this.loading.set(false);
  }

  editBuyer(): void {
    const ref = this.dialog.open(BuyerFormDialogComponent, {
      width: '90vw', maxWidth: '500px',
      data: { buyer: this.buyer() },
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Buyer updated', '', { duration: 2500 });
        await this.loadData();
      }
    });
  }

  viewAnimal(id: string): void { this.router.navigate(['/stock', id]); }
  back(): void { this.router.navigate(['/buyers']); }
}
