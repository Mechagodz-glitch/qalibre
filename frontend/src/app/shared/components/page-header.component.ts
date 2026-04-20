import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="page-header">
      <div>
        <p class="eyebrow">{{ eyebrow() }}</p>
        <h1>{{ title() }}</h1>
        @if (description()) {
          <p class="description">{{ description() }}</p>
        }
      </div>

      <div class="actions">
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    `
      .page-header {
        display: flex;
        justify-content: space-between;
        gap: 1.5rem;
        align-items: flex-start;
        padding: 1.5rem;
        border-radius: 1.5rem;
        background: linear-gradient(135deg, rgba(12, 32, 74, 0.96), rgba(24, 86, 117, 0.9));
        color: #f4f8ff;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .eyebrow {
        margin: 0 0 0.35rem;
        font-size: 0.78rem;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(240, 247, 255, 0.72);
      }

      h1 {
        margin: 0;
        font-size: clamp(1.8rem, 2.5vw, 2.7rem);
      }

      .description {
        margin: 0.75rem 0 0;
        max-width: 62rem;
        color: rgba(244, 248, 255, 0.86);
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }

      @media (max-width: 900px) {
        .page-header {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class PageHeaderComponent {
  readonly eyebrow = input('QA Dataset Workbench');
  readonly title = input.required<string>();
  readonly description = input('');
}
