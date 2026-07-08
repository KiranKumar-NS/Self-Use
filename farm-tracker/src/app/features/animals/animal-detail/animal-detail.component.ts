import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AnimalService } from '../../../core/services/animal.service';
import { AuthService } from '../../../core/services/auth.service';
import { Animal } from '../../../core/models/animal.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { SaleDialogComponent } from '../sale-dialog/sale-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

@Component({
  selector: 'app-animal-detail',
  standalone: true,
  imports: [DatePipe, CurrencyInrPipe, LoadingSpinnerComponent, RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (animal()) {
      <div class="page-header">
        <h1>{{ animalService.getDisplayName(animal()!) }}</h1>
        <div class="header-actions">
          @if (animal()!.status === 'active' && !auth.isViewer()) {
            <button mat-flat-button color="primary" (click)="openSaleDialog()">
              <mat-icon>sell</mat-icon> Record Sale
            </button>
            <button mat-stroked-button color="warn" (click)="recordDeath()">
              <mat-icon>heart_broken</mat-icon> Record Death
            </button>
          }
          <button mat-stroked-button (click)="edit()">
            <mat-icon>edit</mat-icon> Edit
          </button>
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <!-- Status & Info -->
      <mat-card class="detail-card">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Status</label>
            <span class="status-badge" [class]="animal()!.status">{{ animal()!.status }}</span>
          </div>
          <div class="detail-item">
            <label>Segment</label>
            <span>{{ animal()!.segmentName }}</span>
          </div>
          <div class="detail-item">
            <label>Tracking</label>
            <span>{{ animal()!.trackingMode === 'individual' ? 'Individual' : 'Batch' }}</span>
          </div>
          @if (animal()!.tag) {
            <div class="detail-item">
              <label>Tag / ID</label>
              <span>{{ animal()!.tag }}</span>
            </div>
          }
          @if (animal()!.breed) {
            <div class="detail-item">
              <label>Breed</label>
              <span class="breed-text">{{ animal()!.breed }}</span>
            </div>
          }
          @if (animal()!.gender) {
            <div class="detail-item">
              <label>Gender</label>
              <span>{{ animal()!.gender }}</span>
            </div>
          }
          @if (animal()!.trackingMode === 'batch') {
            <div class="detail-item">
              <label>Batch Size</label>
              <span>{{ animal()!.currentCount }} / {{ animal()!.batchSize }} remaining</span>
            </div>
          }
          <div class="detail-item">
            <label>Origin</label>
            <span>{{ animal()!.origin === 'birth' ? 'Born on farm' : 'Purchased' }}</span>
          </div>
          <div class="detail-item">
            <label>{{ animal()!.origin === 'birth' ? 'Birth Date' : 'Purchase Date' }}</label>
            <span>{{ animal()!.originDate.toDate() | date:'dd MMM yyyy' }}</span>
          </div>
          @if (animal()!.purchasePrice) {
            <div class="detail-item">
              <label>Purchase Price</label>
              <span>{{ animal()!.purchasePrice | currencyInr }}</span>
            </div>
          }
          @if (animal()!.note) {
            <div class="detail-item full">
              <label>Note</label>
              <span>{{ animal()!.note }}</span>
            </div>
          }
        </div>
      </mat-card>

      <!-- Profit Card -->
      @if (animal()!.status === 'sold') {
        <h3 class="section-title">Profit Summary</h3>
        <mat-card class="profit-card">
          <div class="profit-grid">
            <div class="profit-item">
              <label>Purchase Price</label>
              <span>{{ animal()!.purchasePrice || 0 | currencyInr }}</span>
            </div>
            <div class="profit-item">
              <label>Total Costs</label>
              <span>{{ animal()!.totalCosts | currencyInr }}</span>
            </div>
            <div class="profit-item">
              <label>Total Invested</label>
              <span class="invested">{{ animal()!.totalInvested | currencyInr }}</span>
            </div>
            <div class="profit-item">
              <label>Sale Price</label>
              <span class="sale-price">{{ animal()!.salePrice | currencyInr }}</span>
            </div>
            <div class="profit-item highlight">
              <label>Profit</label>
              <span class="profit-value" [class.positive]="(animal()!.profit || 0) > 0" [class.negative]="(animal()!.profit || 0) < 0">
                {{ animal()!.profit | currencyInr }}
                <small>({{ animal()!.profitMargin?.toFixed(1) }}%)</small>
              </span>
            </div>
          </div>
        </mat-card>
      } @else {
        <!-- Investment so far -->
        <h3 class="section-title">Investment So Far</h3>
        <mat-card class="profit-card">
          <div class="profit-grid">
            <div class="profit-item">
              <label>Purchase Price</label>
              <span>{{ animal()!.purchasePrice || 0 | currencyInr }}</span>
            </div>
            <div class="profit-item">
              <label>Total Costs</label>
              <span>{{ animal()!.totalCosts | currencyInr }}</span>
            </div>
            <div class="profit-item highlight">
              <label>Total Invested</label>
              <span class="invested">{{ animal()!.totalInvested | currencyInr }}</span>
            </div>
          </div>
        </mat-card>
      }

      <!-- Sale Info -->
      @if (animal()!.status === 'sold') {
        <h3 class="section-title">Sale Details</h3>
        <mat-card class="detail-card">
          <div class="detail-grid">
            <div class="detail-item">
              <label>Sale Date</label>
              <span>{{ animal()!.exitDate?.toDate() | date:'dd MMM yyyy' }}</span>
            </div>
            <div class="detail-item">
              <label>Sale Price</label>
              <span>{{ animal()!.salePrice | currencyInr }}</span>
            </div>
            @if (animal()!.buyerName) {
              <div class="detail-item">
                <label>Buyer</label>
                @if (animal()!.buyerId) {
                  <a [routerLink]="['/buyers', animal()!.buyerId]">{{ animal()!.buyerName }}</a>
                } @else {
                  <span>{{ animal()!.buyerName }}</span>
                }
              </div>
            }
            @if (animal()!.saleTransactionId) {
              <div class="detail-item">
                <label>Linked Transaction</label>
                <a [routerLink]="['/transactions', animal()!.saleTransactionId]">View Transaction</a>
              </div>
            }
          </div>
        </mat-card>
      }

      <!-- Cost Breakdown -->
      <h3 class="section-title">Cost Entries ({{ animal()!.costEntries.length }})</h3>
      <mat-card class="table-card">
        @if (animal()!.costEntries.length === 0) {
          <div class="empty-costs">
            <mat-icon>info_outline</mat-icon>
            <span>No costs attributed yet. Link expenses from the Transactions page.</span>
          </div>
        } @else {
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of animal()!.costEntries; track entry.transactionId) {
                  <tr>
                    <td class="date-cell">{{ entry.date.toDate() | date:'dd MMM' }}</td>
                    <td>{{ entry.categoryName }}</td>
                    <td class="amount-cell expense">{{ entry.amount | currencyInr }}</td>
                    <td class="desc-cell">{{ entry.description || '-' }}</td>
                    <td><a [routerLink]="['/transactions', entry.transactionId]">View</a></td>
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
    .header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .detail-card { padding: 1.5rem; margin-bottom: 0; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1.5rem; }
    .detail-item label { display: block; font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px; }
    .detail-item span { font-size: 1rem; color: var(--color-text); }
    .detail-item.full { grid-column: 1 / -1; }
    .breed-text { color: var(--color-purple); font-weight: 500; }

    .status-badge { padding: 3px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
    .status-badge.active { background: var(--color-income-bg); color: var(--color-income); }
    .status-badge.sold { background: var(--color-info-light); color: var(--color-info); }
    .status-badge.dead { background: var(--color-expense-bg); color: var(--color-expense); }

    .section-title { margin: 1.5rem 0 0.5rem; font-size: 1rem; color: var(--color-text); }

    .profit-card { padding: 1.5rem; }
    .profit-grid { display: flex; flex-wrap: wrap; gap: 2rem; align-items: flex-end; }
    .profit-item label { display: block; font-size: 0.75rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px; }
    .profit-item span { font-size: 1.1rem; font-weight: 600; }
    .profit-item.highlight { border-left: 3px solid var(--color-primary); padding-left: 1rem; }
    .invested { color: var(--color-text); }
    .sale-price { color: var(--color-income); }
    .profit-value.positive { color: var(--color-income); }
    .profit-value.negative { color: var(--color-expense); }
    .profit-value small { font-size: 0.8rem; font-weight: 500; }

    .empty-costs { display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); font-size: 0.9rem; padding: 1.5rem; }

    .amount-cell.expense { color: var(--color-expense); font-weight: 600; }
    .desc-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    @media (max-width: 768px) {
      .page-header { flex-direction: column; align-items: flex-start; }
      .detail-grid { grid-template-columns: 1fr 1fr; gap: 1rem; }
      .profit-grid { gap: 1rem; }
    }
    @media (max-width: 480px) {
      .detail-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class AnimalDetailComponent implements OnInit {
  animalService = inject(AnimalService);
  auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  animal = signal<Animal | null>(null);
  loading = signal(true);
  private animalId = '';

  async ngOnInit(): Promise<void> {
    this.animalId = this.route.snapshot.params['id'];
    await this.loadAnimal();
  }

  async loadAnimal(): Promise<void> {
    this.loading.set(true);
    this.animal.set(await this.animalService.getById(this.animalId));
    this.loading.set(false);
  }

  openSaleDialog(): void {
    const ref = this.dialog.open(SaleDialogComponent, {
      width: '90vw',
      maxWidth: '500px',
      data: { animal: this.animal() },
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.snackBar.open('Sale recorded', '', { duration: 2500 });
        await this.loadAnimal();
      }
    });
  }

  async recordDeath(): Promise<void> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Record Death',
        message: `Mark "${this.animalService.getDisplayName(this.animal()!)}" as dead?`,
        confirmText: 'Confirm',
      } as ConfirmDialogData,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        await this.animalService.recordDeath(this.animalId, new Date());
        this.snackBar.open('Death recorded', '', { duration: 2500 });
        await this.loadAnimal();
      }
    });
  }

  edit(): void { this.router.navigate(['/stock', this.animalId, 'edit']); }
  back(): void { this.router.navigate(['/stock']); }
}
