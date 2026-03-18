import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { GoatService } from '../services/goat.service';
import { Goat } from '../../../core/models';
import { GOAT_BREEDS } from '../../../core/constants/breeds.constant';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { TranslateModule } from '@ngx-translate/core';
import { DatePipe, UpperCasePipe } from '@angular/common';

@Component({
  selector: 'app-goat-profile',
  imports: [
    RouterLink,
    DatePipe,
    UpperCasePipe,
    MatCardModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatListModule,
    MatProgressSpinnerModule,
    PageHeader,
    TranslateModule,
  ],
  template: `
    @if (loading()) {
      <div class="loading"><mat-spinner diameter="40"></mat-spinner></div>
    } @else if (goat()) {
      <app-page-header titleKey="GOATS.PROFILE" icon="pets">
        <a mat-raised-button color="primary" [routerLink]="['/goats', goat()!.id, 'edit']">
          <mat-icon>edit</mat-icon>
          {{ 'COMMON.EDIT' | translate }}
        </a>
      </app-page-header>

      <mat-card class="profile-header">
        <mat-card-content>
          <div class="profile-top">
            <div class="profile-avatar">
              <mat-icon>pets</mat-icon>
            </div>
            <div class="profile-info">
              <h2>{{ goat()!.tagNumber }}</h2>
              @if (goat()!.name) { <p class="goat-name">{{ goat()!.name }}</p> }
              <div class="profile-chips">
                <span class="chip breed">{{ getBreedLabel(goat()!.breed) }}</span>
                <span class="chip gender">{{ goat()!.gender | uppercase }}</span>
                <span class="chip status" [class]="goat()!.status">{{ goat()!.status | uppercase }}</span>
                <span class="chip health" [class]="goat()!.healthStatus">{{ goat()!.healthStatus }}</span>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-tab-group class="profile-tabs">
        <mat-tab [label]="'GOATS.OVERVIEW' | translate">
          <div class="tab-content">
            <mat-card>
              <mat-card-content>
                <mat-list>
                  <mat-list-item>
                    <mat-icon matListItemIcon>cake</mat-icon>
                    <span matListItemTitle>{{ 'GOATS.DATE_OF_BIRTH' | translate }}</span>
                    <span matListItemLine>{{ goat()!.dateOfBirth.toDate() | date:'mediumDate' }}</span>
                  </mat-list-item>
                  <mat-list-item>
                    <mat-icon matListItemIcon>monitor_weight</mat-icon>
                    <span matListItemTitle>{{ 'GOATS.WEIGHT' | translate }}</span>
                    <span matListItemLine>{{ goat()!.weight }} kg</span>
                  </mat-list-item>
                  <mat-list-item>
                    <mat-icon matListItemIcon>category</mat-icon>
                    <span matListItemTitle>{{ 'GOATS.ACQUISITION' | translate }}</span>
                    <span matListItemLine>{{ goat()!.acquisitionType === 'purchased' ? 'Purchased' : 'Born on Farm' }}</span>
                  </mat-list-item>
                  @if (goat()!.purchasePrice) {
                    <mat-list-item>
                      <mat-icon matListItemIcon>currency_rupee</mat-icon>
                      <span matListItemTitle>{{ 'GOATS.PURCHASE_PRICE' | translate }}</span>
                      <span matListItemLine>₹{{ goat()!.purchasePrice }}</span>
                    </mat-list-item>
                  }
                  @if (goat()!.notes) {
                    <mat-list-item>
                      <mat-icon matListItemIcon>notes</mat-icon>
                      <span matListItemTitle>{{ 'GOATS.NOTES' | translate }}</span>
                      <span matListItemLine>{{ goat()!.notes }}</span>
                    </mat-list-item>
                  }
                </mat-list>
              </mat-card-content>
            </mat-card>

            @if (offspring().length > 0) {
              <mat-card class="offspring-card">
                <mat-card-header>
                  <mat-card-title>{{ 'GOATS.OFFSPRING' | translate }} ({{ offspring().length }})</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  <mat-list>
                    @for (kid of offspring(); track kid.id) {
                      <a mat-list-item [routerLink]="['/goats', kid.id]">
                        <mat-icon matListItemIcon>pets</mat-icon>
                        <span matListItemTitle>{{ kid.tagNumber }} {{ kid.name ? '- ' + kid.name : '' }}</span>
                        <span matListItemLine>{{ kid.breed }} | {{ kid.gender }}</span>
                      </a>
                    }
                  </mat-list>
                </mat-card-content>
              </mat-card>
            }
          </div>
        </mat-tab>

        <mat-tab [label]="'GOATS.BREEDING_HISTORY' | translate">
          <div class="tab-content">
            <mat-card>
              <mat-card-content>
                <p class="placeholder-text">Breeding records will appear here</p>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>

        <mat-tab [label]="'GOATS.YIELD_HISTORY' | translate">
          <div class="tab-content">
            <mat-card>
              <mat-card-content>
                <p class="placeholder-text">Yield records will appear here</p>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>

        <mat-tab [label]="'GOATS.FEED_HISTORY' | translate">
          <div class="tab-content">
            <mat-card>
              <mat-card-content>
                <p class="placeholder-text">Feed records will appear here</p>
              </mat-card-content>
            </mat-card>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  `,
  styles: `
    .loading { display: flex; justify-content: center; padding: 40px; }
    .profile-header { margin-bottom: 16px; }
    .profile-top { display: flex; gap: 16px; align-items: center; }
    .profile-avatar {
      width: 64px; height: 64px; border-radius: 50%; background: #e8f5e9;
      display: flex; align-items: center; justify-content: center;
    }
    .profile-avatar mat-icon { font-size: 32px; height: 32px; width: 32px; color: #2e7d32; }
    .profile-info h2 { margin: 0; }
    .goat-name { margin: 4px 0; color: #666; }
    .profile-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .chip {
      padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 500;
    }
    .chip.breed { background: #e8f5e9; color: #2e7d32; }
    .chip.gender { background: #e3f2fd; color: #1565c0; }
    .chip.status.active { background: #c8e6c9; color: #2e7d32; }
    .chip.status.sold { background: #fff3e0; color: #e65100; }
    .chip.health.healthy { background: #c8e6c9; color: #2e7d32; }
    .chip.health.sick { background: #ffcdd2; color: #c62828; }
    .profile-tabs { margin-top: 16px; }
    .tab-content { padding: 16px 0; }
    .offspring-card { margin-top: 16px; }
    .placeholder-text { color: #999; text-align: center; padding: 24px; }
  `,
})
export class GoatProfile implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly goatService = inject(GoatService);

  goat = signal<Goat | null>(null);
  offspring = signal<Goat[]>([]);
  loading = signal(true);

  async ngOnInit(): Promise<void> {
    const goatId = this.route.snapshot.params['goatId'];
    if (goatId) {
      const goat = await this.goatService.getGoatById(goatId);
      this.goat.set(goat);
      if (goat) {
        const kids = await this.goatService.getOffspring(goatId);
        this.offspring.set(kids);
      }
    }
    this.loading.set(false);
  }

  getBreedLabel(breed: string): string {
    return GOAT_BREEDS.find((b) => b.value === breed)?.labelEn || breed;
  }
}
