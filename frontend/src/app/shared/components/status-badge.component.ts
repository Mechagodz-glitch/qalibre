import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="badge" [class]="variantClass()">{{ label() }}</span>`,
  styles: [
    `
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 0.3rem 0.75rem;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.03em;
      }

      .variant-draft {
        background: rgba(242, 174, 73, 0.18);
        color: #7b5200;
      }

      .variant-approved {
        background: rgba(29, 161, 123, 0.16);
        color: #0f6e58;
      }

      .variant-archived,
      .variant-rejected,
      .variant-failed {
        background: rgba(173, 41, 58, 0.14);
        color: #8b2231;
      }

      .variant-pending {
        background: rgba(40, 111, 190, 0.14);
        color: #1e5d9f;
      }

      .variant-inprogress {
        background: rgba(40, 111, 190, 0.14);
        color: #1e5d9f;
      }

      .variant-completed {
        background: rgba(29, 161, 123, 0.16);
        color: #0f6e58;
      }

      .variant-passed {
        background: rgba(29, 161, 123, 0.16);
        color: #0f6e58;
      }

      .variant-skipped {
        background: rgba(230, 170, 25, 0.18);
        color: #835700;
      }

      .variant-untested {
        background: rgba(110, 132, 147, 0.16);
        color: #506777;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  readonly status = input.required<string>();
  readonly label = input<string>();
  readonly variantClass = computed(() => `variant-${this.status().replace(/\s+/g, '').toLowerCase()}`);
}
