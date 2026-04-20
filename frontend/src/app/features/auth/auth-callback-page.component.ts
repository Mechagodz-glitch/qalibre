import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-auth-callback-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatCardModule, MatProgressSpinnerModule],
  templateUrl: './auth-callback-page.component.html',
  styleUrl: './auth-callback-page.component.scss',
})
export class AuthCallbackPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.complete();
  }

  private async complete() {
    try {
      await this.auth.completeRedirect();
      this.auth.consumeReturnUrl();
      await this.router.navigateByUrl('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication could not be completed.';
      this.error.set(message);
      this.auth.setLoginError(message);
      await this.router.navigate(['/login'], {
        queryParams: {
          reason: 'forbidden',
        },
      });
    } finally {
      this.loading.set(false);
    }
  }
}
