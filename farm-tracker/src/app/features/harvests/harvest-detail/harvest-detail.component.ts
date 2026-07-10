import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HarvestService } from '../../../core/services/harvest.service';
import { Harvest } from '../../../core/models/harvest.model';
import { CurrencyInrPipe } from '../../../shared/pipes/currency-inr.pipe';
import { LoadingSpinnerComponent } from '../../../shared/components/loading-spinner/loading-spinner.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { HarvestSaleDialogComponent } from '../harvest-sale-dialog/harvest-sale-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { safeLoad } from '../../../core/utils/async.utils';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-harvest-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, RouterLink, CurrencyInrPipe, LoadingSpinnerComponent,
    MatCardModule, MatButtonModule, MatIconModule, MatProgressBarModule,
    MatFormFieldModule, MatInputModule,
  ],
  template: `
    @if (loading()) {
      <app-loading-spinner />
    } @else if (harvest()) {
      <div class="page-header">
        <h1>{{ harvest()!.cropName }} Harvest</h1>
        <div class="header-actions">
          <button mat-flat-button color="primary" (click)="recordSale()" [disabled]="harvest()!.remainingQuantity <= 0">
            <mat-icon>sell</mat-icon> Record Sale
          </button>
          <button mat-stroked-button (click)="recordWastage()" [disabled]="harvest()!.remainingQuantity <= 0">
            <mat-icon>delete_sweep</mat-icon> Record Wastage
          </button>
          <button mat-button (click)="back()">Back</button>
        </div>
      </div>

      <!-- Harvest Info Card -->
      <mat-card class="info-card">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Crop</span>
            <span class="info-value">{{ harvest()!.cropName }}{{ harvest()!.variety ? ' (' + harvest()!.variety + ')' : '' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Harvest Date</span>
            <span class="info-value">{{ harvest()!.harvestDate.toDate() | date:'dd MMM yyyy' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Quantity</span>
            <span class="info-value">{{ harvest()!.totalQuantity }} {{ harvest()!.unit }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Status</span>
            <span class="status-badge" [attr.data-status]="harvest()!.status">{{ formatStatus(harvest()!.status) }}</span>
          </div>
          @if (harvest()!.grade) {
            <div class="info-item">
              <span class="info-label">Grade</span>
              <span class="info-value">{{ harvest()!.grade }}</span>
            </div>
          }
          @if (harvest()!.storageLocation) {
            <div class="info-item">
              <span class="info-label">Storage</span>
              <span class="info-value">{{ harvest()!.storageLocation }}</span>
            </div>
          }
        </div>
      </mat-card>

      <!-- Pipeline Progress -->
      <mat-card class="pipeline-card">
        <h3>Pipeline Progress</h3>
        <div class="pipeline">
          <div class="pipeline-stage active">
            <div class="stage-icon">🌾</div>
            <div class="stage-label">Harvested</div>
            <div class="stage-value">{{ harvest()!.totalQuantity }} {{ harvest()!.unit }}</div>
          </div>
          <div class="pipeline-arrow">→</div>
          <div class="pipeline-stage" [class.active]="harvest()!.storageLocation">
            <div class="stage-icon">📦</div>
            <div class="stage-label">Storage</div>
            <div class="stage-value">{{ harvest()!.remainingQuantity }} {{ harvest()!.unit }}</div>
          </div>
          <div class="pipeline-arrow">→</div>
          <div class="pipeline-stage" [class.active]="harvest()!.totalSold > 0">
            <div class="stage-icon">💰</div>
            <div class="stage-label">Sold</div>
            <div class="stage-value">{{ harvest()!.totalSold }} {{ harvest()!.unit }}</div>
          </div>
        </div>
        <mat-progress-bar mode="determinate" [value]="soldPercentage()"></mat-progress-bar>
      </mat-card>

      <!-- Summary Cards -->
      <div class="summary-grid">
        <mat-card class="summary-card">
          <div class="summary-label">Total Quantity</div>
          <div class="summary-value">{{ harvest()!.totalQuantity }} {{ harvest()!.unit }}</div>
        </mat-card>
        <mat-card class="summary-card">
          <div class="summary-label">Sold</div>
          <div class="summary-value sold">{{ harvest()!.totalSold }} {{ harvest()!.unit }}</div>
        </mat-card>
        <mat-card class="summary-card">
          <div class="summary-label">Wastage</div>
          <div class="summary-value wastage">{{ harvest()!.wastageQuantity }} {{ harvest()!.unit }}</div>
        </mat-card>
        <mat-card class="summary-card">
          <div class="summary-label">Remaining</div>
          <div class="summary-value remaining">{{ harvest()!.remainingQuantity }} {{ harvest()!.unit }}</div>
        </mat-card>
        <mat-card class="summary-card">
          <div class="summary-label">Revenue</div>
          <div class="summary-value revenue">{{ harvest()!.totalRevenue | currencyInr }}</div>
        </mat-card>
        <mat-card class="summary-card">
          <div class="summary-label">Average Rate</div>
          <div class="summary-value">{{ harvest()!.averageRate ? (harvest()!.averageRate! | currencyInr) + '/' + harvest()!.unit : '-' }}</div>
        </mat-card>
      </div>

      <!-- Sales Table -->
      @if (harvest()!.sales.length > 0) {
        <mat-card class="table-card">
          <h3 style="padding: 16px 16px 0;">Sales History</h3>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Quantity</th>
                  <th>Rate</th>
                  <th>Amount</th>
                  <th>Buyer</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                @for (sale of harvest()!.sales; track sale.id) {
                  <tr>
                    <td class="date-cell">{{ sale.date.toDate() | date:'dd MMM yyyy' }}</td>
                    <td>{{ sale.quantity }} {{ sale.unit }}</td>
                    <td>{{ sale.ratePerUnit | currencyInr }}</td>
                    <td class="amount-cell">{{ sale.totalAmount | currencyInr }}</td>
                    <td>{{ sale.buyerName || '-' }}</td>
                    <td>
                      @if (sale.linkedTransactionId) {
                        <a [routerLink]="['/transactions', sale.linkedTransactionId]" class="txn-link">
                          <mat-icon class="small-icon">receipt_long</mat-icon> View
                        </a>
                      } @else {
                        -
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </mat-card>
      }
    } @else {
      <mat-card>
        <p style="padding: 24px; text-align: center;">Harvest not found.</p>
        <div style="text-align: center; padding-bottom: 24px;">
          <button mat-flat-button (click)="back()">Back to Harvests</button>
        </div>
      </mat-card>
    }
  `,
  styles: [`
    .info-card { margin-bottom: 16px; padding: 20px; }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
    .info-item { display: flex; flex-direction: column; gap: 4px; }
    .info-label { font-size: 0.82rem; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
    .info-value { font-size: 1rem; font-weight: 600; }

    .status-badge {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 0.82rem;
      font-weight: 600;
      width: fit-content;
    }
    .status-badge[data-status="harvested"] { background: #e3f2fd; color: #1565c0; }
    .status-badge[data-status="in_storage"] { background: #fff3e0; color: #e65100; }
    .status-badge[data-status="partially_sold"] { background: #f3e5f5; color: #7b1fa2; }
    .status-badge[data-status="fully_sold"] { background: #e8f5e9; color: #2e7d32; }

    .pipeline-card { margin-bottom: 16px; padding: 20px; }
    .pipeline-card h3 { margin: 0 0 16px; }
    .pipeline { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .pipeline-stage { text-align: center; opacity: 0.4; transition: opacity 0.3s; min-width: 100px; }
    .pipeline-stage.active { opacity: 1; }
    .stage-icon { font-size: 2rem; margin-bottom: 4px; }
    .stage-label { font-size: 0.82rem; color: var(--color-text-secondary); text-transform: uppercase; }
    .stage-value { font-weight: 700; font-size: 1.1rem; }
    .pipeline-arrow { font-size: 1.5rem; color: var(--color-text-secondary); }

    .summary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .summary-card { padding: 16px; text-align: center; }
    .summary-label { font-size: 0.82rem; color: var(--color-text-secondary); text-transform: uppercase; margin-bottom: 4px; }
    .summary-value { font-size: 1.2rem; font-weight: 700; }
    .summary-value.sold { color: var(--color-primary); }
    .summary-value.wastage { color: var(--color-danger, #c62828); }
    .summary-value.remaining { color: var(--color-warning, #e65100); }
    .summary-value.revenue { color: var(--color-income); }

    .amount-cell { font-weight: 600; color: var(--color-income); }
    .txn-link { display: inline-flex; align-items: center; gap: 4px; color: var(--color-primary); text-decoration: none; }
    .txn-link:hover { text-decoration: underline; }
    .small-icon { font-size: 16px; width: 16px; height: 16px; }

    .header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  `],
})
export class HarvestDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private harvestService = inject(HarvestService);
  private dialog = inject(MatDialog);
  private toast = inject(ToastService);

  harvest = signal<Harvest | null>(null);
  loading = signal(true);

  wastageQuantity: number | null = null;
  wastageReason = '';

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      await this.loadData(id);
    } else {
      this.loading.set(false);
    }
  }

  async loadData(id: string): Promise<void> {
    await safeLoad(this.loading, async () => {
      this.harvest.set(await this.harvestService.getById(id));
    }, this.toast);
  }

  soldPercentage(): number {
    const h = this.harvest();
    if (!h || h.totalQuantity === 0) return 0;
    return Math.round((h.totalSold / h.totalQuantity) * 100);
  }

  formatStatus(status: string): string {
    return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  recordSale(): void {
    const h = this.harvest();
    if (!h) return;
    const ref = this.dialog.open(HarvestSaleDialogComponent, { width: '90vw', maxWidth: '500px', data: { harvest: h } });
    ref.afterClosed().subscribe(async (result) => {
      if (result) {
        this.toast.success('Sale recorded');
        await this.loadData(h.id);
      }
    });
  }

  recordWastage(): void {
    const h = this.harvest();
    if (!h) return;

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Record Wastage',
        message: `Enter wastage quantity (${h.remainingQuantity} ${h.unit} available):`,
        confirmText: 'Record',
        showInput: true,
        inputLabel: 'Quantity',
        inputType: 'number',
      } as ConfirmDialogData,
    });

    ref.afterClosed().subscribe(async (result) => {
      if (result?.confirmed && result?.inputValue) {
        const qty = parseFloat(result.inputValue);
        if (qty > 0 && qty <= h.remainingQuantity) {
          try {
            await this.harvestService.recordWastage(h.id, qty);
            this.toast.success('Wastage recorded');
          } catch (err) {
            console.error('Failed to record wastage', err);
            this.toast.error(err instanceof Error ? err.message : 'Failed to record wastage');
          }
          await this.loadData(h.id);
        } else {
          this.toast.error('Invalid quantity');
        }
      }
    });
  }

  back(): void { this.router.navigate(['/harvests']); }
}
