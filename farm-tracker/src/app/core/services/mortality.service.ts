import { Injectable, inject } from '@angular/core';
import { AnimalService } from './animal.service';
import { Animal } from '../models/animal.model';
import { SegmentService } from './segment.service';

export interface MortalityStats {
  totalAnimals: number;
  totalDeaths: number;
  mortalityRate: number;
  bySegment: { segment: string; segmentName: string; total: number; deaths: number; rate: number }[];
  byCause: { cause: string; count: number }[];
  estimatedLoss: number;
  averageAgeAtDeathDays: number;
  monthlyTrend: { month: string; deaths: number }[];
}

@Injectable({ providedIn: 'root' })
export class MortalityService {
  private animalService = inject(AnimalService);
  private segmentService = inject(SegmentService);

  async getMortalityStats(): Promise<MortalityStats> {
    const [allAnimals, segments] = await Promise.all([
      this.animalService.getAll({}, 500),
      this.segmentService.getAll(),
    ]);

    const animalSegments = segments.filter(s => s.segmentType === 'animal');
    const deadAnimals = allAnimals.filter(a => a.status === 'dead');
    const totalAnimals = allAnimals.length;
    const totalDeaths = deadAnimals.length;

    // By segment
    const bySegment = animalSegments.map(seg => {
      const segAnimals = allAnimals.filter(a => a.segment === seg.id);
      const segDeaths = segAnimals.filter(a => a.status === 'dead');
      return {
        segment: seg.id,
        segmentName: seg.name,
        total: segAnimals.length,
        deaths: segDeaths.length,
        rate: segAnimals.length > 0 ? Math.round((segDeaths.length / segAnimals.length) * 10000) / 100 : 0,
      };
    });

    // By cause
    const causeMap = new Map<string, number>();
    for (const animal of deadAnimals) {
      const cause = animal.deathCause || 'unknown';
      causeMap.set(cause, (causeMap.get(cause) || 0) + 1);
    }
    const byCause = Array.from(causeMap.entries())
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count);

    // Estimated financial loss
    const estimatedLoss = deadAnimals.reduce((sum, a) => sum + (a.totalInvested || 0), 0);

    // Average age at death
    const agesAtDeath = deadAnimals.filter(a => a.ageAtDeathDays != null).map(a => a.ageAtDeathDays!);
    const averageAgeAtDeathDays = agesAtDeath.length > 0
      ? Math.round(agesAtDeath.reduce((s, d) => s + d, 0) / agesAtDeath.length)
      : 0;

    // Monthly trend
    const monthMap = new Map<string, number>();
    for (const animal of deadAnimals) {
      if (animal.exitDate) {
        const d = animal.exitDate.toDate();
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        monthMap.set(key, (monthMap.get(key) || 0) + 1);
      }
    }
    const monthlyTrend = Array.from(monthMap.entries())
      .map(([month, deaths]) => ({ month, deaths }))
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      totalAnimals,
      totalDeaths,
      mortalityRate: totalAnimals > 0 ? Math.round((totalDeaths / totalAnimals) * 10000) / 100 : 0,
      bySegment,
      byCause,
      estimatedLoss,
      averageAgeAtDeathDays,
      monthlyTrend,
    };
  }
}
