import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';

interface GuideSection {
  id: string;
  icon: string;
  title: string;
  route: string;
  overview: string;
  prerequisites: string[];
  steps: { action: string; detail: string }[];
  example: { title: string; scenario: string; steps: string[] };
  consequences: { skip: string; result: string }[];
  tips: string[];
}

@Component({
  selector: 'app-user-guide-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatExpansionModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="guide-container">
      <div class="guide-header">
        <div class="guide-title-row">
          <mat-icon class="guide-logo">menu_book</mat-icon>
          <div>
            <h2>Farm Tracker Guide</h2>
            <p class="subtitle">Learn how each feature works with real examples</p>
          </div>
        </div>
        <button mat-icon-button (click)="dialogRef.close()" class="close-btn" aria-label="Close guide">
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <div class="guide-nav">
        @for (s of sections; track s.id) {
          <button class="nav-chip" [class.active]="s.id === activeSection()"
                  (click)="scrollTo(s.id)">
            <mat-icon>{{ s.icon }}</mat-icon>
            <span>{{ s.title }}</span>
          </button>
        }
      </div>

      <div class="guide-body">
        <!-- Getting Started -->
        <div class="section" id="section-getting-started">
          <div class="section-header">
            <mat-icon>rocket_launch</mat-icon>
            <h3>Getting Started</h3>
          </div>
          <div class="section-content">
            <div class="overview-text">
              Farm Tracker helps you manage your entire farming operation — animals, crops, finances, loans, inventory, and team tasks — all in one app.
              Working offline? A chip appears in the header — your changes save locally and sync automatically when you're back online.
            </div>
            <div class="prereq-box">
              <div class="prereq-title">
                <mat-icon>checklist</mat-icon> Recommended Setup Order
              </div>
              <ol class="prereq-list">
                <li><strong>Segments & Categories</strong> first — everything else depends on them</li>
                <li><strong>Buyers & Suppliers</strong> next (optional but recommended) — so you can link them when recording transactions</li>
                <li><strong>Animals / Crops</strong> — register stock through <strong>Stock → Record Event</strong> (a purchase or birth creates the batch for you)</li>
                <li><strong>Transactions</strong> — start recording income & expenses</li>
                <li><strong>Consumables, Schedules, Tasks</strong> — add as needed</li>
              </ol>
            </div>
            <div class="consequence-box">
              <div class="consequence-title">
                <mat-icon>warning</mat-icon> What happens if you skip setup?
              </div>
              <div class="consequence-row">
                <span class="skip-label">Skip segments</span>
                <span class="skip-result">You can't add transactions, animals, or any data — segments are required everywhere</span>
              </div>
              <div class="consequence-row">
                <span class="skip-label">Skip categories</span>
                <span class="skip-result">Transaction form won't have category options — your dashboard breakdown will show "uncategorized"</span>
              </div>
              <div class="consequence-row">
                <span class="skip-label">Skip budgets</span>
                <span class="skip-result">No overspending alerts — budget widget on dashboard stays empty</span>
              </div>
            </div>
          </div>
        </div>

        @for (s of sections; track s.id) {
          <div class="section" [id]="'section-' + s.id">
            <div class="section-header">
              <mat-icon>{{ s.icon }}</mat-icon>
              <h3>{{ s.title }}</h3>
            </div>
            <div class="section-content">
              <div class="overview-text">{{ s.overview }}</div>

              @if (s.prerequisites.length) {
                <div class="prereq-box">
                  <div class="prereq-title">
                    <mat-icon>checklist</mat-icon> Before you start
                  </div>
                  <ul class="prereq-list">
                    @for (p of s.prerequisites; track p) {
                      <li [innerHTML]="p"></li>
                    }
                  </ul>
                </div>
              }

              <div class="how-to-box">
                <div class="how-to-title">How to use</div>
                @for (step of s.steps; track step.action) {
                  <div class="how-to-step">
                    <mat-icon class="step-icon">chevron_right</mat-icon>
                    <div>
                      <strong>{{ step.action }}</strong>
                      <span class="step-detail"> — {{ step.detail }}</span>
                    </div>
                  </div>
                }
              </div>

              <div class="example-box">
                <div class="example-title">
                  <mat-icon>lightbulb</mat-icon> Example: {{ s.example.title }}
                </div>
                <div class="example-scenario">{{ s.example.scenario }}</div>
                <ol class="example-steps">
                  @for (step of s.example.steps; track step) {
                    <li [innerHTML]="step"></li>
                  }
                </ol>
              </div>

              @if (s.consequences.length) {
                <div class="consequence-box">
                  <div class="consequence-title">
                    <mat-icon>warning</mat-icon> What if you skip a step?
                  </div>
                  @for (c of s.consequences; track c.skip) {
                    <div class="consequence-row">
                      <span class="skip-label">{{ c.skip }}</span>
                      <span class="skip-result">{{ c.result }}</span>
                    </div>
                  }
                </div>
              }

              @if (s.tips.length) {
                <div class="tips-box">
                  <div class="tips-title">
                    <mat-icon>tips_and_updates</mat-icon> Pro Tips
                  </div>
                  <ul class="tips-list">
                    @for (tip of s.tips; track tip) {
                      <li>{{ tip }}</li>
                    }
                  </ul>
                </div>
              }
            </div>
          </div>
        }

        <!-- Roles -->
        <div class="section" id="section-roles">
          <div class="section-header">
            <mat-icon>admin_panel_settings</mat-icon>
            <h3>User Roles</h3>
          </div>
          <div class="section-content">
            <div class="roles-grid">
              <div class="role-card">
                <div class="role-name admin">Admin</div>
                <div class="role-desc">Full access — manage users, setup segments/categories, all data operations, export reports</div>
              </div>
              <div class="role-card">
                <div class="role-name manager">Manager</div>
                <div class="role-desc">Create & edit transactions, animals, loans, crops, tasks within assigned segments</div>
              </div>
              <div class="role-card">
                <div class="role-name viewer">Viewer</div>
                <div class="role-desc">Dashboard analytics (read-only) and personal task management only</div>
              </div>
            </div>
            <div class="overview-text role-note">
              New users start as <strong>Viewer</strong> until an admin assigns their role. A role change takes effect after the user signs out and back in.
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .guide-container {
      display: flex;
      flex-direction: column;
      height: 85vh;
      max-height: 800px;
      width: 700px;
      max-width: 95vw;
    }

    .guide-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid var(--color-border);
      background: linear-gradient(135deg, var(--color-primary), #6366f1);
      color: white;
      border-radius: 4px 4px 0 0;
    }
    .guide-title-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .guide-logo { font-size: 32px; width: 32px; height: 32px; }
    .guide-header h2 { margin: 0; font-size: 1.25rem; font-weight: 600; }
    .subtitle { margin: 2px 0 0; font-size: 0.8rem; opacity: 0.85; }
    .close-btn { color: white; }

    .guide-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 12px 24px;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg);
      overflow-x: auto;
    }
    .nav-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-full);
      background: var(--color-surface);
      color: var(--color-text-secondary);
      font-size: 0.75rem;
      cursor: pointer;
      white-space: nowrap;
      transition: all var(--transition-fast);
    }
    .nav-chip mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .nav-chip:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .nav-chip.active {
      background: var(--color-primary);
      color: white;
      border-color: var(--color-primary);
    }

    .guide-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px 24px;
    }

    .section {
      margin-bottom: 24px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 16px;
      background: var(--color-bg-alt);
      border-bottom: 1px solid var(--color-border);
      font-weight: 600;
    }
    .section-header mat-icon { color: var(--color-primary); }
    .section-header h3 { margin: 0; font-size: 1rem; }
    .section-content { padding: 16px; }

    .overview-text {
      color: var(--color-text-secondary);
      font-size: 0.875rem;
      line-height: 1.5;
      margin-bottom: 14px;
    }

    .prereq-box {
      margin-bottom: 14px;
      padding: 12px;
      background: var(--color-purple-light);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--color-purple);
    }
    .prereq-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--color-purple);
      margin-bottom: 8px;
    }
    .prereq-title mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .prereq-list {
      margin: 0;
      padding-left: 20px;
      font-size: 0.83rem;
      line-height: 1.6;
      color: var(--color-text-secondary);
    }
    .prereq-list li { margin-bottom: 3px; }

    .how-to-box {
      margin-bottom: 14px;
      padding: 12px;
      background: var(--color-info-light);
      border-radius: var(--radius-md);
    }
    .how-to-title {
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--color-info);
      margin-bottom: 8px;
    }
    .how-to-step {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      margin-bottom: 6px;
      font-size: 0.85rem;
      line-height: 1.4;
    }
    .step-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--color-info);
      flex-shrink: 0;
      margin-top: 1px;
    }
    .step-detail { color: var(--color-text-secondary); }

    .example-box {
      margin-bottom: 14px;
      padding: 14px;
      background: var(--color-income-bg);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--color-income);
    }
    .example-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      color: var(--color-income);
      margin-bottom: 8px;
    }
    .example-title mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .example-scenario {
      font-size: 0.82rem;
      color: var(--color-text-secondary);
      font-style: italic;
      margin-bottom: 8px;
    }
    .example-steps {
      margin: 0;
      padding-left: 20px;
      font-size: 0.83rem;
      line-height: 1.6;
    }
    .example-steps li { margin-bottom: 4px; }

    .consequence-box {
      margin-bottom: 14px;
      padding: 12px;
      background: var(--color-danger-light);
      border-radius: var(--radius-md);
      border-left: 3px solid var(--color-danger);
    }
    .consequence-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      color: var(--color-danger);
      margin-bottom: 10px;
    }
    .consequence-title mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .consequence-row {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 0.83rem;
      line-height: 1.4;
      align-items: flex-start;
    }
    .skip-label {
      flex-shrink: 0;
      font-weight: 600;
      color: var(--color-danger);
      background: white;
      padding: 1px 8px;
      border-radius: var(--radius-sm);
      font-size: 0.78rem;
      white-space: nowrap;
    }
    .skip-result {
      color: var(--color-text-secondary);
    }

    .tips-box {
      padding: 12px;
      background: var(--color-warning-light);
      border-radius: var(--radius-md);
    }
    .tips-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 0.8rem;
      color: var(--color-warning);
      margin-bottom: 6px;
    }
    .tips-title mat-icon { font-size: 18px; width: 18px; height: 18px; }
    .tips-list {
      margin: 0;
      padding-left: 18px;
      font-size: 0.82rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
    }
    .tips-list li { margin-bottom: 3px; }

    .roles-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .role-card {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px;
      background: var(--color-bg-alt);
      border-radius: var(--radius-md);
    }
    .role-name {
      font-weight: 700;
      font-size: 0.8rem;
      padding: 3px 10px;
      border-radius: var(--radius-full);
      white-space: nowrap;
    }
    .role-name.admin { background: var(--color-primary-light); color: var(--color-primary); }
    .role-name.manager { background: var(--color-income-bg); color: var(--color-income); }
    .role-name.viewer { background: var(--color-info-light); color: var(--color-info); }
    .role-desc { font-size: 0.83rem; color: var(--color-text-secondary); line-height: 1.4; }
    .role-note { margin: 12px 0 0; }

    @media (max-width: 640px) {
      .guide-container { height: 95vh; width: 100vw; }
      .guide-header { padding: 16px; }
      .guide-nav { padding: 10px 16px; }
      .guide-body { padding: 12px 16px; }
      .section-content { padding: 12px; }
      .nav-chip span { display: none; }
      .nav-chip { padding: 6px; }
      .consequence-row { flex-direction: column; gap: 2px; }
    }
  `],
})
export class UserGuideDialogComponent implements OnInit {
  dialogRef = inject(MatDialogRef<UserGuideDialogComponent>);
  data = inject<{ currentRoute: string }>(MAT_DIALOG_DATA);
  activeSection = signal('');

  sections: GuideSection[] = [
    {
      id: 'dashboard',
      icon: 'dashboard',
      title: 'Dashboard',
      route: '/dashboard',
      overview: 'Your financial command center. See income, expenses, profit, and trends at a glance. Filter by date range, segment, or person. Money that has not actually changed hands is kept separate, so the profit number is always real cash.',
      prerequisites: [],
      steps: [
        { action: 'View summary cards', detail: 'Total Expense, Total Income and Net Profit/Loss count settled money only — cash that actually moved' },
        { action: 'Check Pending & Credit tiles', detail: '"Pending (To Receive)" is money buyers still owe you, "Credit (To Pay)" is what you still owe suppliers — tap either tile to open that Dues tab' },
        { action: 'Read person cards', detail: 'Each person shows expenses paid, income received, Cash in Hand, and loan holds. Money they spent out of farm cash they were already holding is shown as "…funded from farm cash" and is NOT counted as their own investment' },
        { action: 'Change date range', detail: 'Use the date filter to view any month or custom range' },
        { action: 'Check segment breakdown', detail: 'See which farm segment earns or costs the most' },
        { action: 'Monitor budgets', detail: 'Budget widget shows actual spending vs. your limits per segment' },
        { action: 'Export reports', detail: 'Download Excel, PDF, or share via WhatsApp using top-right buttons' },
      ],
      example: {
        title: 'Monthly Financial Review',
        scenario: 'It\'s month-end and you want to review June performance.',
        steps: [
          'Open <strong>Dashboard</strong> → set date range to <strong>June 2026</strong>',
          'Summary cards show settled cash: Income <strong>₹85,000</strong> | Expense <strong>₹42,000</strong> | Profit <strong>₹43,000</strong>',
          '<strong>Pending (To Receive)</strong> tile shows <strong>₹18,000</strong> — buyers who took goats on credit. Tap it → opens Dues "To Receive"',
          '<strong>Credit (To Pay)</strong> tile shows <strong>₹7,500</strong> — the feed bill you have not settled yet',
          'Segment breakdown shows Goats earned <strong>₹60,000</strong>, Dragon Fruit earned <strong>₹25,000</strong>',
          'Rahim\'s person card shows Expenses paid <strong>₹12,000</strong>, but <strong>₹9,000</strong> of it says "…funded from farm cash" → his own money in is only <strong>₹3,000</strong>',
          'Budget widget shows Chickens feed exceeded limit by <strong>₹3,000</strong> — investigate',
          'Click <strong>Excel</strong> icon → download full backup to share with your accountant',
        ],
      },
      consequences: [
        { skip: 'Don\'t check dashboard regularly', result: 'You miss overspending, pending collections pile up, and budget overruns go unnoticed until month-end' },
        { skip: 'Don\'t clear the Pending/Credit tiles', result: 'Old unpaid items keep sitting in Dues — the profit number stays right, but real money is stuck with buyers' },
        { skip: 'Don\'t set budget limits', result: 'Budget widget stays empty — no spending warnings, you discover overspending only after reviewing transactions manually' },
        { skip: 'Don\'t export monthly', result: 'No backup of your data — if something goes wrong, you lose records. Accountant has no data to work with' },
      ],
      tips: [
        'Profit here is cash-basis — a credit sale only lifts profit once you mark it received',
        'Export Excel monthly as a backup — you can always re-import if needed',
        'Use the WhatsApp share to quickly update partners on farm performance',
        'Cash in Hand on a person card is farm money they are still holding — settle it before it drifts',
      ],
    },
    {
      id: 'transactions',
      icon: 'receipt_long',
      title: 'Transactions',
      route: '/transactions',
      overview: 'Record every rupee coming in or going out. Link expenses to animals for cost tracking, link income to buyers, and distribute earnings among partners.',
      prerequisites: [
        '<strong>Segments</strong> must exist — you need to assign each transaction to a segment (Goats, Chickens, etc.)',
        '<strong>Categories</strong> must exist — Feed, Medicine, Labor for expenses; Animal Sales, Milk for income',
        '<strong>Buyers</strong> (optional) — add buyers first if you want to link income to specific buyers. <em>Benefit:</em> auto-tracks each buyer\'s purchase count, total paid, and average rate',
        '<strong>Suppliers</strong> (optional) — add suppliers first if you want to link expenses to suppliers. <em>Benefit:</em> auto-tracks each supplier\'s order count, total paid, and helps compare rates',
        '<strong>Animals</strong> (optional) — add animals first if you want to link expenses to specific animals. <em>Benefit:</em> per-animal cost tracking and accurate profit calculation on sale',
      ],
      steps: [
        { action: 'Switch Expense / Income tabs', detail: 'The list opens on Expense; the Income tab sits next to it. Both show a status column so you can see paid/credit and received/pending at a glance' },
        { action: 'Add Expense', detail: 'Amount, category (Feed/Medicine/Labor), segment, who paid, payment method (Cash/UPI), and status — Paid, or Pending if you bought on credit' },
        { action: 'Add Income', detail: 'Amount, category (Animal Sales/Milk), link buyer, set payment status (Received/Pending) and an expected payment date when pending' },
        { action: 'Record partial payments', detail: 'Buyer paid half? Record just that amount — the remainder keeps showing in Dues until it is fully settled' },
        { action: 'Link to animals', detail: 'When adding an expense, click "Link Animals" to split cost across specific animals or batches' },
        { action: 'Distribute income', detail: 'Split income among partners — set each person\'s share amount' },
        { action: 'Add tags', detail: 'Type tags like "vaccination-drive" or "eid-season" for easy filtering later' },
        { action: 'Filter & search', detail: 'Filter by date, type, segment, person, payment status, or tags' },
      ],
      example: {
        title: 'Buying Medicine (with Supplier linked)',
        scenario: 'You buy ₹3,000 worth of medicine from a supplier for your goats.',
        steps: [
          '<strong>First:</strong> Make sure supplier "Vet Pharma" exists in Suppliers page (optional but recommended)',
          'Go to <strong>Transactions → Add</strong> → select <strong>Expense</strong>',
          'Amount: <strong>₹3,000</strong> | Category: <strong>Medicine</strong> | Segment: <strong>Goats</strong>',
          'Supplier: <strong>Vet Pharma</strong> → their total orders and amount paid auto-update',
          'Click <strong>Link Animals</strong> → select goat <strong>G-042</strong> (₹3,000) → cost added to this goat\'s profile',
          'Add tag: <strong>deworming-july</strong> → Save',
          '<strong>Result:</strong> Vet Pharma\'s stats update (total: ₹3,000, 1 order) | Goat G-042\'s invested amount increases by ₹3,000',
          '<strong>Without supplier:</strong> Transaction still saves fine, but you lose supplier tracking — can\'t compare rates or see order history later',
        ],
      },
      consequences: [
        { skip: 'Don\'t link expenses to animals', result: 'Animal profit calculation is wrong — sale price minus purchase price only, ignoring feed/medicine/labor costs spent on that animal' },
        { skip: 'Don\'t link buyer to income', result: 'Buyer\'s purchase history won\'t update — you can\'t see how much Ahmed bought this year or his average rate' },
        { skip: 'Don\'t link supplier to expense', result: 'Supplier stats won\'t track — you can\'t compare which supplier is cheaper or see pending payments per supplier' },
        { skip: 'Don\'t add tags', result: 'No way to filter related transactions together — e.g., can\'t see "all vaccination costs" or "eid season spending" in one view' },
        { skip: 'Don\'t set payment status', result: 'Pending income/expenses won\'t show on the Dues page — you lose track of who owes you money, and the dashboard counts unpaid money as real cash' },
        { skip: 'Don\'t record partial payments', result: 'A half-paid bill still shows its full amount as outstanding — you chase money you already collected' },
        { skip: 'Don\'t distribute income', result: 'Partners don\'t know their share — dashboard shows undistributed income piling up' },
      ],
      tips: [
        'Always link expenses to animals — this is how per-animal profit is calculated',
        'Mark credit sales as "Pending" and flip to "Received" when buyer pays',
        'Use tags to group related transactions (e.g., all vaccination costs in one view)',
        'Adding suppliers/buyers is optional but highly recommended — it takes 30 seconds and gives you lifetime tracking',
      ],
    },
    {
      id: 'stock',
      icon: 'pets',
      title: 'Stock',
      route: '/stock',
      overview: 'One page for all live stock — the <strong>Animals</strong> tab lists your batches, the <strong>Stock Log</strong> tab shows every event that moved the count. Everything goes through a single "Record Event" dialog, so a purchase or sale can never be counted twice.',
      prerequisites: [
        '<strong>Segments</strong> must exist with type "animal" — e.g., Goats, Chickens',
        '<strong>Breeds</strong> (optional) — define breeds in segment settings for breed-wise analytics',
        '<strong>Buyers</strong> (optional) — add buyers before recording sales so you can link them. <em>Benefit:</em> auto-tracks buyer purchase history and average rate per head',
        '<strong>Categories</strong> — a purchase can auto-create its expense, so an expense category (e.g. Animal Purchase) should exist',
      ],
      steps: [
        { action: 'Record Event', detail: 'The only way stock counts change. Pick segment, event type (Birth / Hatched, Purchase, Sale, Death, Adjustment), count, breed and date' },
        { action: 'Purchase or Birth creates the batch', detail: 'The dialog registers a batch record automatically — batch label (auto-suggested, e.g. "Goats Jan-2026"), count and price. There is no separate "Add Animal" form' },
        { action: 'Let the purchase book its expense', detail: 'Enter the purchase price and the dialog also creates the linked expense — Expense Category, Paid By, Cash/UPI, Paid or Pending (+ expected payment date)' },
        { action: 'Track health', detail: 'Open a batch → add vaccination (with next-due date), medical record, or weight log. Entering a cost creates a Medicine expense attributed to that batch — just pick who paid, Cash/UPI and paid/pending' },
        { action: 'Sell', detail: 'From the batch detail page → the same dialog in sale mode: buyer (or "+ Add New Buyer"), price, Received By, received/pending. Creates the income transaction and updates the count' },
        { action: 'Record death', detail: 'Same dialog in death mode: cause and estimated value → decrements stock and feeds the mortality dashboard' },
        { action: 'Fix a mistake', detail: 'Stock Log tab → edit the event. Changing the count or the amount updates the batch and its linked expense/income in place — it never creates a second one' },
        { action: 'View analytics & mortality', detail: 'The Analytics link shows ROI and cost breakdown per batch; the Mortality link shows death rate, causes and estimated loss' },
      ],
      example: {
        title: 'Goat Batch — Purchase to Sale',
        scenario: 'You buy 10 goats, vaccinate them, lose one, and sell six four months later.',
        steps: [
          '<strong>Stock → Record Event</strong> → Segment: <strong>Goats</strong> | Type: <strong>Purchase</strong> | Count: <strong>10</strong> | Breed: <strong>Sirohi</strong>',
          'Purchase Price (total): <strong>₹50,000</strong> | Batch Label: left blank → auto-named <strong>Goats Jan-2026</strong>',
          'Expense Category: <strong>Animal Purchase</strong> | Paid By: <strong>Rahim</strong> | Status: <strong>Paid</strong> → expense created automatically',
          'Jan 20: open the batch → <strong>Add Vaccination</strong> → PPR, cost <strong>₹2,000</strong>, next due Jul 20 → Medicine expense attributed to this batch',
          'Feb 10: <strong>Add Medical</strong> → deworming, <strong>₹1,500</strong> | Feed expenses linked over 4 months: <strong>₹20,000</strong>',
          'Mar 2: <strong>Record Event → Death</strong> | Count: <strong>1</strong> | Cause: <strong>Bloat</strong> → count drops to 9, shows in Mortality',
          'May 15: from the batch → <strong>Sale</strong> | Count: <strong>6</strong> | Buyer: <strong>Ahmed</strong> | Price: <strong>₹78,000</strong> → income transaction created, 3 head still active',
          'Batch shows invested <strong>₹73,500</strong> against <strong>₹78,000</strong> realised so far, with 3 goats still in stock',
        ],
      },
      consequences: [
        { skip: 'Don\'t enter the purchase price', result: 'No expense is created and the batch looks free — profit shows the entire sale amount, which is misleading' },
        { skip: 'Record stock changes somewhere else', result: 'There is nowhere else — every count change is a Record Event. Editing a batch never touches the count, so numbers can\'t drift' },
        { skip: 'Re-record an event instead of editing it', result: 'You get the stock counted twice and two expenses for one purchase. Edit the original event — it corrects the batch and the money together' },
        { skip: 'Don\'t record vaccinations', result: 'No vaccination reminders — you may miss booster dates, risking animal health and potential disease outbreak' },
        { skip: 'Don\'t log weight', result: 'No growth chart — you can\'t spot underperforming batches or identify which feed works best' },
        { skip: 'Don\'t link buyer during sale', result: 'Buyer\'s purchase history doesn\'t update — can\'t see total business with that buyer' },
        { skip: 'Don\'t record deaths with cause', result: 'Mortality dashboard shows deaths but no cause breakdown — you miss patterns like "5 deaths from bloat = feeding problem"' },
      ],
      tips: [
        'Every new record is a batch — a batch of 1 is perfectly normal for a single high-value animal',
        'Older individual records (tag/name/gender) still open, edit and sell normally — only new entries are batches',
        'Leave the batch label blank and let the app name it — consistent names make the Stock Log readable',
        'Always record vaccinations with next-due date — the app will remind you',
        'Record death causes — the mortality dashboard helps prevent future losses',
        'Sales & Cost Analytics loads the last 12 months by default — tap "Load full history" for all-time figures',
      ],
    },
    {
      id: 'loans',
      icon: 'account_balance',
      title: 'Owe & Lent (Loans)',
      route: '/loans',
      overview: 'Track money you owe and money others owe you. Simple mode for personal IOUs, formal mode for bank/gold loans with EMI schedules — plus cash advances, so you always know who is holding loan money.',
      prerequisites: [
        '<strong>Segments</strong> — to assign which farm segment the loan is for (helps track borrowing per segment)',
        '<strong>Held By</strong> — every formal loan needs a holder, the person whose custody the disbursed cash sits in',
      ],
      steps: [
        { action: 'Add simple loan', detail: 'Quick entry: date, amount, person name, given or received, purpose' },
        { action: 'Add formal loan', detail: 'Full details: bank/gold/finance source, interest rate, tenure, EMI calculation, and Held By (required)' },
        { action: 'Edit later if needed', detail: 'Source, holder and segments stay editable after creation — sanctioned amount and disbursement date lock once saved' },
        { action: 'Track repayments', detail: 'Record each payment with principal/interest split' },
        { action: 'Give a cash advance', detail: 'Loan detail → Advances tab → hand unused loan cash to a person as a working float. It is custody, not their personal debt' },
        { action: 'Settle the advance', detail: 'Settle it as spent (books a business expense) or returned to the holder. The header shows "In hand (holder)" and "Advanced out to people"' },
        { action: 'Add collateral', detail: 'For formal loans: gold items (weight, purity), property, vehicle, FD' },
        { action: 'Store documents', detail: 'Add sanction letters, agreements, NOC references' },
      ],
      example: {
        title: 'Bank Loan with EMI',
        scenario: 'You take a ₹2,00,000 bank loan for farm expansion at 12% for 24 months.',
        steps: [
          '<strong>Loans → Add Formal Loan</strong> → Source: <strong>Bank</strong> | Name: <strong>SBI Farm Loan</strong>',
          'Amount: <strong>₹2,00,000</strong> | Interest: <strong>12% annual</strong> | Tenure: <strong>24 months</strong> | Held By: <strong>Kiran</strong>',
          'Add deduction: Processing fee <strong>₹4,000</strong> | Insurance <strong>₹2,500</strong>',
          'System calculates EMI: <strong>₹9,415/month</strong> and generates full schedule',
          'Hand <strong>₹30,000</strong> to Rahim to buy goats → <strong>Advances → Give Advance</strong> | Person: <strong>Rahim</strong> | Note: <strong>To buy goats</strong>',
          'Header now reads: In hand (holder) <strong>₹1,63,500</strong> · Advanced out to people <strong>₹30,000</strong>',
          'Rahim spends ₹26,000 and returns ₹4,000 → <strong>Settle</strong> the advance → expense booked, advance closes',
          'Each month: Record payment → system tracks principal vs interest split',
          'Dashboard loan widget shows: <strong>5 EMIs paid</strong>, <strong>₹1,62,000 outstanding</strong>, next EMI due <strong>Aug 5</strong>',
        ],
      },
      consequences: [
        { skip: 'Don\'t record deductions', result: 'Net disbursed amount looks wrong — you think you got ₹2,00,000 but actually received ₹1,93,500 after fees' },
        { skip: 'Don\'t track repayments', result: 'Outstanding balance stays at original amount — dashboard shows wrong loan position, can\'t track how much you\'ve paid' },
        { skip: 'Don\'t settle advances', result: 'The person keeps showing that cash in hand on the dashboard long after they spent it — your custody figures are overstated' },
        { skip: 'Treat an advance as a personal loan', result: 'Wrong picture entirely — an advance is farm money in someone\'s pocket, not money they owe you' },
        { skip: 'Don\'t add collateral details', result: 'Gold loan without weight/purity records — can\'t calculate LTV ratio or verify gold valuation at renewal' },
        { skip: 'Don\'t record EMI payments monthly', result: 'EMI schedule shows all future EMIs as unpaid — no way to know where you stand in the repayment plan' },
      ],
      tips: [
        'Use simple loans for personal lending — formal loans for banks/finance companies',
        'Use advances for anyone who buys on the farm\'s behalf — a manager, a worker, a family member',
        'Close a loan only after settling every advance — closing zeroes out any unused cash left in hand',
        'Gold loan? Track each gold item with weight and purity for accurate valuation',
        'Dashboard shows upcoming EMIs — never miss a payment',
      ],
    },
    {
      id: 'dues',
      icon: 'request_quote',
      title: 'Dues',
      route: '/dues',
      overview: 'Who owes you, and who you owe — in one place. <strong>To Receive</strong> lists unpaid income grouped by buyer, <strong>To Pay</strong> lists unpaid credit expenses grouped by supplier. Nothing to maintain: it is calculated live from your transactions.',
      prerequisites: [
        '<strong>Transactions marked pending</strong> — income saved as "Pending" or expenses saved as "Pending" (credit) are what appear here. Fully settled entries never show up',
        '<strong>Buyers & Suppliers</strong> (optional) — linking them groups dues by counterparty instead of by loose names',
      ],
      steps: [
        { action: 'Open To Receive', detail: 'Every buyer who still owes you, with the outstanding amount and how old the oldest item is' },
        { action: 'Open To Pay', detail: 'Every supplier you still owe for a credit purchase. Loan repayments are excluded — they live on the Loans page' },
        { action: 'Record a partial payment', detail: 'Tap the payment icon on a row and enter what was actually received or paid — the balance stays listed' },
        { action: 'Settle in full', detail: 'When the last rupee lands, mark it received/paid — the row disappears and the dashboard profit picks it up' },
        { action: 'Jump from the dashboard', detail: 'The "Pending (To Receive)" and "Credit (To Pay)" tiles open the matching tab directly' },
      ],
      example: {
        title: 'Chasing a Credit Sale',
        scenario: 'Ahmed took goats worth ₹40,000 and paid ₹15,000 up front.',
        steps: [
          'Record the sale as income <strong>₹40,000</strong>, buyer <strong>Ahmed</strong>, status <strong>Pending</strong>',
          'Open <strong>Dues → To Receive</strong> → Ahmed shows <strong>₹40,000</strong> outstanding',
          'He pays <strong>₹15,000</strong> → tap the payment icon → enter 15,000 → row now shows <strong>₹25,000</strong>',
          'Dashboard "Pending (To Receive)" tile drops by ₹15,000; profit rises only by the ₹15,000 actually collected',
          'Three weeks later the row shows an <strong>overdue</strong> flag with the age of the oldest item — time to call him',
          'He clears the rest → mark received → Ahmed disappears from To Receive, full ₹40,000 now counts as income',
        ],
      },
      consequences: [
        { skip: 'Save credit sales as "Received"', result: 'Dues stays empty and the dashboard counts money you never got — profit looks healthy while cash is missing' },
        { skip: 'Don\'t check Dues weekly', result: 'Old receivables quietly age past the point where buyers feel obliged to pay' },
        { skip: 'Don\'t link buyers/suppliers', result: 'Dues group by whatever name was typed — the same person can appear twice under two spellings' },
      ],
      tips: [
        'This page is computed, never edited — fix anything wrong on the transaction itself',
        'Sort your follow-up calls by the oldest-days column, not by amount',
        'Supplier credit sitting in To Pay is free working capital — but pay before it strains the relationship',
      ],
    },
    {
      id: 'buyers',
      icon: 'people',
      title: 'Buyers',
      route: '/buyers',
      overview: 'Maintain a buyer database. When you sell animals or harvests, link the buyer — the app auto-tracks their purchase history, total amount, and average rates.',
      prerequisites: [],
      steps: [
        { action: 'Add buyer', detail: 'Name, phone number, location' },
        { action: 'Link during sale', detail: 'When recording animal sale or harvest sale, select the buyer' },
        { action: 'View buyer detail', detail: 'See all purchases, total amount paid, average rate, segment breakdown' },
      ],
      example: {
        title: 'Tracking a Regular Buyer',
        scenario: 'Ahmed buys goats from you regularly.',
        steps: [
          '<strong>Buyers → Add</strong> → Name: <strong>Ahmed</strong> | Phone: <strong>9876543210</strong> | Location: <strong>Jaipur</strong>',
          'Sell goat G-042 to Ahmed for ₹12,000 (from Stock page)',
          'Sell goat G-045 to Ahmed for ₹15,000',
          'Open <strong>Ahmed\'s detail page</strong> → shows: Total purchases: <strong>2</strong> | Total paid: <strong>₹27,000</strong> | Avg rate: <strong>₹13,500/head</strong>',
          'Segment breakdown: Goats — 2 purchases, ₹27,000',
        ],
      },
      consequences: [
        { skip: 'Don\'t add buyers before selling', result: 'You can still sell, but the sale won\'t be linked to anyone — no purchase history, no average rate tracking, no way to see your best customer' },
        { skip: 'Don\'t add phone number', result: 'Buyer is saved but you can\'t quickly call them from the app when following up on pending payments' },
      ],
      tips: [
        'Add buyers BEFORE recording sales — it takes 10 seconds and gives you lifetime tracking',
        'Always link buyers to sales — it builds your customer history automatically',
        'Use buyer analytics to identify your best customers and offer them priority',
      ],
    },
    {
      id: 'breeding',
      icon: 'favorite',
      title: 'Breeding',
      route: '/breeding',
      overview: 'Record mating events, track pregnancies, and log deliveries with offspring details. Link vet costs to transactions.',
      prerequisites: [
        '<strong>Animals</strong> must exist — you need at least a dam (female) registered in stock to create a breeding record',
        '<strong>Segments</strong> with type "animal" — breeding is for animal segments only',
      ],
      steps: [
        { action: 'Add breeding record', detail: 'Select sire (male) and dam (female), mating date, method (natural/artificial)' },
        { action: 'Update status', detail: 'Progress through: Mated → Confirmed Pregnant → Delivered or Failed' },
        { action: 'Record delivery', detail: 'Enter offspring count, gender split, link newborn animals to the system' },
        { action: 'Track costs', detail: 'Link veterinary expenses to the breeding record' },
      ],
      example: {
        title: 'Goat Breeding Cycle',
        scenario: 'You mate your best Sirohi buck with a doe.',
        steps: [
          '<strong>Breeding → Add</strong> → Segment: <strong>Goats</strong> | Sire: <strong>G-001 Sultan</strong> | Dam: <strong>G-015 Lakshmi</strong>',
          'Method: <strong>Natural</strong> | Date: <strong>Jan 10</strong>',
          'Feb 15: Update status → <strong>Confirmed Pregnant</strong> | Expected delivery: <strong>Jun 10</strong>',
          'Jun 8: Update → <strong>Delivered</strong> | Offspring: <strong>2 kids</strong> (1 male, 1 female)',
          'Link offspring as new animals: <strong>G-050</strong> and <strong>G-051</strong>',
          'Add vet cost: <strong>₹1,500</strong> for delivery assistance → linked to expense transaction',
        ],
      },
      consequences: [
        { skip: 'Don\'t update status to "pregnant"', result: 'No expected delivery date — you won\'t get delivery reminders, might miss preparing for birth' },
        { skip: 'Don\'t link offspring', result: 'Newborn animals aren\'t connected to parents — can\'t trace lineage or see which sire produces best offspring' },
        { skip: 'Don\'t record vet costs', result: 'Breeding costs not tracked — you can\'t see true cost of breeding program vs. buying animals directly' },
      ],
      tips: [
        'Track which sire produces the best offspring for better breeding decisions',
        'Set expected delivery dates — the app will remind you when it\'s near',
      ],
    },
    {
      id: 'crops',
      icon: 'grass',
      title: 'Crops',
      route: '/crops',
      overview: 'Log all crop maintenance activities — irrigation, fertilizer, pruning, spraying, and more. Track labor, materials, weather, and costs. Enter a cost and the expense is created for you.',
      prerequisites: [
        '<strong>Segments</strong> with type "crop" — e.g., Dragon Fruit, Mango',
        '<strong>Categories</strong> — the cost picker uses your expense categories (Fertilizer, Medicine, Seeds, Labor…)',
        '<strong>Suppliers</strong> (optional) — add suppliers for fertilizer/pesticide purchases. <em>Benefit:</em> compare prices across suppliers for same product',
      ],
      steps: [
        { action: 'Add activity', detail: 'Select type (irrigation/fertilizer/spraying/etc.), segment, date' },
        { action: 'Record details', detail: 'Product used, quantity, duration, labor count, weather conditions' },
        { action: 'Enter the cost', detail: 'Any cost above zero automatically creates a linked expense in that crop segment — no separate transaction entry. Category defaults by activity type (fertilizer → Fertilizer, spraying → Medicine, planting → Seeds)' },
        { action: 'Say who paid', detail: 'Paid By (family member or "Other" + name), Cash/UPI, and Paid or Pending with an expected payment date' },
        { action: 'Using stock you already bought?', detail: 'Tick "Already purchased — don\'t create an expense" so applying bulk fertilizer you paid for last month is not charged twice' },
        { action: 'Edit or delete safely', detail: 'Changing the cost updates the linked expense, clearing it removes the expense, and deleting the activity removes it too' },
      ],
      example: {
        title: 'Dragon Fruit Fertilizer Application',
        scenario: 'Monthly fertilizer application to your dragon fruit plants.',
        steps: [
          '<strong>Crops → Add Activity</strong> → Type: <strong>Fertilizer</strong> | Segment: <strong>Dragon Fruit</strong>',
          'Date: <strong>Jun 15</strong> | Product: <strong>NPK 19-19-19</strong> | Quantity: <strong>25 kg</strong>',
          'Duration: <strong>3 hours</strong> | Labor: <strong>2 workers</strong>',
          'Weather: <strong>Cloudy</strong> | Temperature: <strong>32°C</strong>',
          'Cost: <strong>₹1,800</strong> | Category: <strong>Fertilizer</strong> (pre-filled) | Paid By: <strong>Rahim</strong> | Status: <strong>Paid</strong>',
          'Save → the expense appears in Transactions automatically, tagged <strong>crop-activity</strong>',
          '<strong>Next month:</strong> you apply fertilizer from the same 100 kg bag you already paid for → tick <strong>"Already purchased"</strong> → activity logged, no second expense',
        ],
      },
      consequences: [
        { skip: 'Don\'t log activities', result: 'No history of what was done when — if plants die or yield drops, you can\'t trace back to find what changed' },
        { skip: 'Don\'t record weather', result: 'Can\'t correlate yield with climate — miss patterns like "spraying before rain wastes pesticide"' },
        { skip: 'Don\'t enter a cost', result: 'Activity logged but no expense created — dashboard won\'t show true crop expenses' },
        { skip: 'Forget the "Already purchased" tick', result: 'The material is charged twice — once when you bought the bag, again when you applied it. Crop costs look far worse than reality' },
      ],
      tips: [
        'Log weather conditions — helps correlate yield with climate patterns over time',
        'Track labor hours to understand true cost per activity',
        'Never add the activity expense by hand in Transactions as well — the cost field already did it',
      ],
    },
    {
      id: 'harvests',
      icon: 'agriculture',
      title: 'Harvests',
      route: '/harvests',
      overview: 'Record harvests, track storage, sell incrementally to different buyers, and monitor wastage. Status auto-progresses as you sell.',
      prerequisites: [
        '<strong>Segments</strong> with type "crop" — harvests are linked to crop segments',
        '<strong>Buyers</strong> (optional but recommended) — add buyers before recording harvest sales. <em>Benefit:</em> auto-tracks which buyer pays best rate for each crop grade',
      ],
      steps: [
        { action: 'Record harvest', detail: 'Crop name, total quantity, grade (A/B/C), storage location' },
        { action: 'Enter harvest cost', detail: 'Picking labour, transport and the like — entering a cost creates the linked expense automatically, with category, Paid By, Cash/UPI and paid/pending' },
        { action: 'Sell portions', detail: 'Record each sale: buyer, quantity, rate → auto-creates income transaction' },
        { action: 'Log wastage', detail: 'Record spoiled quantity with a reason → remaining quantity drops and the status catches up on its own' },
        { action: 'Track status', detail: 'Harvested → In Storage → Partially Sold → Fully Sold (auto-updates)' },
      ],
      example: {
        title: 'Dragon Fruit Harvest & Sales',
        scenario: 'You harvest 500 kg of dragon fruit and sell to multiple buyers over 3 weeks.',
        steps: [
          '<strong>Harvests → Add</strong> → Crop: <strong>Dragon Fruit</strong> | Qty: <strong>500 kg</strong> | Grade: <strong>A</strong> | Storage: <strong>Cold Room</strong>',
          'Harvest cost: <strong>₹4,000</strong> picking labour | Paid By: <strong>Rahim</strong> → expense created automatically, tagged <strong>harvest-cost</strong>',
          'Week 1: <strong>Record Sale</strong> → Buyer: <strong>Raju</strong> | 100 kg at <strong>₹300/kg</strong> = ₹30,000',
          'Week 2: <strong>Record Sale</strong> → Buyer: <strong>Metro Store</strong> | 200 kg at <strong>₹350/kg</strong> = ₹70,000',
          'Week 2: <strong>Log Wastage</strong> → 30 kg spoiled (overripe)',
          'Remaining: <strong>170 kg</strong> in storage | Total revenue so far: <strong>₹1,00,000</strong>',
          'Status auto-updated to <strong>Partially Sold</strong>',
        ],
      },
      consequences: [
        { skip: 'Don\'t record sales individually', result: 'Can\'t compare buyer rates — you won\'t know Raju pays ₹300/kg but Metro pays ₹350/kg for same grade' },
        { skip: 'Don\'t log wastage', result: 'Remaining quantity is wrong — system thinks you have 200 kg but you actually have 170 kg (30 kg spoiled)' },
        { skip: 'Don\'t link buyer to sales', result: 'Income transaction created but buyer history not updated — can\'t see which buyer gives best price per crop' },
        { skip: 'Don\'t record grade', result: 'Can\'t analyze rate differences by quality — miss that Grade A sells at ₹350 but Grade B at only ₹200' },
        { skip: 'Don\'t enter the harvest cost', result: 'Revenue is tracked but picking/transport costs are not — the crop looks more profitable than it is' },
      ],
      tips: [
        'Record each sale separately (not one lump sum) — track buyer-wise performance',
        'The harvest cost field creates its own expense — don\'t also add it by hand in Transactions',
        'Log wastage honestly — it helps calculate true profitability and reduce future losses',
        'Compare rates across buyers to find who pays best for each grade',
      ],
    },
    {
      id: 'consumables',
      icon: 'inventory_2',
      title: 'Consumables',
      route: '/consumables',
      overview: 'Track inventory of farm supplies — feed, medicine, fertilizer, seeds, fuel. Know what you have, what you need, and what you spent.',
      prerequisites: [
        '<strong>Segments</strong> — to assign consumables to specific farm segments',
        '<strong>Suppliers</strong> (optional but recommended) — add suppliers before recording purchases. <em>Benefit:</em> track purchase history per supplier, compare rates, see who gives cheapest feed',
      ],
      steps: [
        { action: 'Add item', detail: 'Name, category (feed/medicine/fuel/etc.), unit, minimum stock threshold' },
        { action: 'Record purchase', detail: 'Quantity, unit cost, supplier → stock increases' },
        { action: 'Record usage', detail: 'Quantity used → stock decreases (validates availability)' },
        { action: 'Record wastage', detail: 'Expired or damaged quantity with reason' },
        { action: 'Monitor stock', detail: 'Low-stock alerts when below minimum threshold' },
      ],
      example: {
        title: 'Managing Cattle Feed Inventory',
        scenario: 'You track cattle feed to never run out.',
        steps: [
          '<strong>First:</strong> Make sure supplier "Agro Store" exists in Suppliers page (optional but recommended)',
          '<strong>Consumables → Add</strong> → Name: <strong>Cattle Feed Premium</strong> | Category: <strong>Feed</strong> | Unit: <strong>kg</strong>',
          'Minimum stock: <strong>50 kg</strong> (alert threshold)',
          'Purchase: <strong>200 kg</strong> at ₹45/kg from supplier <strong>Agro Store</strong> = ₹9,000',
          'Week 1 usage: <strong>40 kg</strong> | Week 2: <strong>40 kg</strong> | Week 3: <strong>40 kg</strong>',
          'Current stock: <strong>80 kg</strong> → still above minimum',
          'Week 4 usage: <strong>40 kg</strong> → stock drops to <strong>40 kg</strong> → <strong>Low Stock Alert</strong> appears',
          '<strong>With supplier linked:</strong> You see Agro Store avg rate ₹45/kg — can compare when Farm Direct offers ₹42/kg',
          '<strong>Without supplier:</strong> Purchase still records fine, but you lose per-supplier rate comparison',
        ],
      },
      consequences: [
        { skip: 'Don\'t set minimum stock', result: 'No low-stock alerts — you discover you\'re out of feed only when animals are hungry' },
        { skip: 'Don\'t record usage', result: 'Stock level stays at purchased amount forever — you think you have 200 kg but it\'s actually 40 kg' },
        { skip: 'Don\'t link supplier to purchase', result: 'Can\'t compare supplier rates — you keep buying from Agro Store at ₹45/kg without knowing Farm Direct sells at ₹42/kg' },
        { skip: 'Don\'t record wastage', result: 'Stock level is higher than reality — 20 kg of expired medicine still shows as available stock' },
      ],
      tips: [
        'Set realistic minimum stock levels — too high causes false alarms, too low causes stockouts',
        'Link purchases to suppliers — track which supplier gives best rates',
        'Adding a supplier takes 10 seconds but saves you money long-term through rate comparison',
      ],
    },
    {
      id: 'suppliers',
      icon: 'local_shipping',
      title: 'Suppliers',
      route: '/suppliers',
      overview: 'Maintain your supplier database. Track orders, payment history, and compare rates across suppliers. Add suppliers BEFORE buying consumables or recording expenses for best tracking.',
      prerequisites: [],
      steps: [
        { action: 'Add supplier', detail: 'Name, phone, location, GST number, item categories they supply' },
        { action: 'Link to purchases', detail: 'When buying consumables or recording expenses, select the supplier — stats auto-update' },
        { action: 'View history', detail: 'See total orders, amounts paid, pending payments, average rates' },
      ],
      example: {
        title: 'Comparing Feed Suppliers',
        scenario: 'You buy from two suppliers and want to compare.',
        steps: [
          'Add supplier <strong>Agro Store</strong> (feed, medicine) and <strong>Farm Direct</strong> (feed, fertilizer)',
          'Buy feed from Agro Store: 200 kg at <strong>₹45/kg</strong>',
          'Buy feed from Farm Direct: 200 kg at <strong>₹42/kg</strong>',
          'Open each supplier detail → compare: Agro Store avg <strong>₹45</strong> vs Farm Direct avg <strong>₹42</strong>',
          'Farm Direct is <strong>₹3/kg cheaper</strong> → switch primary supplier',
          'At 200 kg/month that\'s <strong>₹600 saved/month = ₹7,200/year</strong> just from tracking!',
        ],
      },
      consequences: [
        { skip: 'Don\'t add suppliers at all', result: 'Transactions and consumable purchases still work fine — but you lose all supplier tracking: no rate comparison, no order history, no pending payment tracking' },
        { skip: 'Don\'t add GST number', result: 'Works fine for daily use, but at tax time you\'ll have to dig through bills to find GST details' },
        { skip: 'Add supplier AFTER purchases', result: 'Past purchases won\'t be linked — only future ones will track. Better late than never, but best to add suppliers first' },
      ],
      tips: [
        'Add suppliers FIRST, before buying consumables — it takes 10 seconds per supplier',
        'Record GST numbers — useful at tax time',
        'Track pending payments to suppliers to avoid disputes',
        'Even if optional, supplier tracking pays for itself — knowing which supplier is cheapest saves real money',
      ],
    },
    {
      id: 'tasks',
      icon: 'view_kanban',
      title: 'Tasks',
      route: '/tasks',
      overview: 'Kanban board for farm task management. Drag cards between columns, assign to team members, set priorities and due dates.',
      prerequisites: [
        '<strong>Users</strong> (optional) — create team users if you want to assign tasks to specific people',
      ],
      steps: [
        { action: 'Create task', detail: 'Title, description, priority (low/medium/high/urgent), assignee, due date' },
        { action: 'Add subtasks', detail: 'Break down complex tasks into checkable subtasks' },
        { action: 'Move cards', detail: 'Drag from Backlog → Todo → In Progress → Done' },
        { action: 'Personal tasks', detail: 'Mark as "Personal" to keep visible only to you' },
        { action: 'Filter view', detail: 'Toggle "My Tasks" to see only tasks assigned to you' },
      ],
      example: {
        title: 'Managing Vaccination Drive',
        scenario: 'You need to vaccinate all goats this week.',
        steps: [
          '<strong>Tasks → Add</strong> → Title: <strong>Goat Vaccination Drive - PPR</strong>',
          'Priority: <strong>High</strong> | Assignee: <strong>Rahim</strong> | Due: <strong>Friday</strong>',
          'Add subtasks: <strong>Buy vaccines</strong> | <strong>Call vet</strong> | <strong>Vaccinate Batch A</strong> | <strong>Vaccinate Batch B</strong> | <strong>Record in health logs</strong>',
          'Mon: Move to <strong>In Progress</strong> → check off "Buy vaccines" and "Call vet"',
          'Wed: Check off "Vaccinate Batch A" and "Vaccinate Batch B"',
          'Fri: Check off "Record in health logs" → drag card to <strong>Done</strong>',
        ],
      },
      consequences: [
        { skip: 'Don\'t set due dates', result: 'No overdue notifications — tasks sit in "Todo" forever without anyone noticing' },
        { skip: 'Don\'t assign to someone', result: 'Nobody feels responsible — task stays undone because everyone thinks someone else will do it' },
        { skip: 'Don\'t use subtasks', result: 'Big tasks feel overwhelming — can\'t track partial progress or know what\'s left' },
        { skip: 'Don\'t move cards to Done', result: 'Board gets cluttered with finished work — hard to see what\'s actually pending' },
      ],
      tips: [
        'Use priorities wisely — Urgent tasks stand out visually on the board',
        'Personal tasks are great for your own reminders without cluttering the team board',
      ],
    },
    {
      id: 'schedules',
      icon: 'schedule',
      title: 'Reminders & Schedules',
      route: '/schedules',
      overview: 'Automate recurring transactions and set up reminders for farm activities. Never forget an EMI payment, vaccination, or monthly expense.',
      prerequisites: [
        '<strong>Segments & Categories</strong> — needed for recurring transaction templates',
        '<strong>Animals</strong> (optional) — link reminders to specific animals for vaccination/deworming alerts',
      ],
      steps: [
        { action: 'Add recurring transaction', detail: 'Set template (amount, category, segment) + frequency (daily/weekly/monthly/etc.)' },
        { action: 'Add reminder', detail: 'Type (vaccination/EMI/harvest/etc.), link to animals or segment, notify X days before' },
        { action: 'Auto-create tasks', detail: 'Enable auto-task to create a task card when reminder triggers' },
        { action: 'Toggle active', detail: 'Pause/resume any schedule without deleting it' },
      ],
      example: {
        title: 'Monthly Rent + Vaccination Reminder',
        scenario: 'You pay ₹5,000 rent monthly and need PPR boosters every 6 months.',
        steps: [
          '<strong>Reminders → Add Recurring</strong> → Amount: <strong>₹5,000</strong> | Category: <strong>Rent</strong> | Segment: <strong>Goats</strong>',
          'Frequency: <strong>Monthly</strong> | Start: <strong>Jan 1</strong> → auto-creates expense on the 1st of each month',
          '<strong>Reminders → Add Reminder</strong> → Type: <strong>Vaccination</strong> | Title: <strong>PPR Booster</strong>',
          'Link animals: <strong>All goats</strong> | Frequency: <strong>Every 6 months</strong> | Notify: <strong>7 days before</strong>',
          'Enable <strong>Auto-create task</strong> with priority <strong>High</strong>',
          'Result: 7 days before due date, a <strong>High priority task</strong> appears on your Kanban board + <strong>notification bell</strong> alerts you',
        ],
      },
      consequences: [
        { skip: 'Don\'t set up recurring transactions', result: 'You have to manually add rent/salary/EMI every month — easy to forget, dashboard shows incomplete data for months you missed' },
        { skip: 'Don\'t set notify-days-before', result: 'Reminder fires on the due date itself — no time to prepare (buy vaccines, arrange vet, etc.)' },
        { skip: 'Don\'t enable auto-create task', result: 'Reminder only shows as notification — no task card on Kanban board, easy to dismiss and forget' },
        { skip: 'Don\'t pause seasonal schedules', result: 'Irrigation reminders keep firing in dry season — notification fatigue makes you ignore real alerts too' },
      ],
      tips: [
        'Set up recurring expenses first (rent, salaries, EMIs) — saves daily data entry',
        'Use "notify days before" generously — vaccination reminders 7-14 days ahead give time to buy supplies',
        'Pause seasonal schedules (e.g., irrigation) during off-season instead of deleting them',
      ],
    },
  ];

  ngOnInit(): void {
    const route = this.data?.currentRoute || '';
    const match = this.sections.find(s => route.startsWith(s.route));
    if (match) {
      this.activeSection.set(match.id);
      setTimeout(() => this.scrollTo(match.id), 300);
    }
  }

  scrollTo(sectionId: string): void {
    this.activeSection.set(sectionId);
    const el = document.getElementById('section-' + sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
