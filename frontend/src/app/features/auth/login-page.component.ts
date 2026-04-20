import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatButtonModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly errorMessage = computed(() => {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'forbidden') {
      return 'Your account does not have access to this area. Contact an administrator.';
    }

    return this.auth.loginError();
  });

  readonly isLocalMode = computed(() => {
    const config = this.auth.authConfig();
    return !config || !config.clientId.trim() || !config.tenantId.trim() || !config.authority.trim();
  });

  readonly isSignedIn = computed(() => this.auth.isAuthenticated());

  constructor() {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    void this.auth.ensureReady().then(() => {
      if (this.auth.initialized() && this.isSignedIn() && reason !== 'forbidden') {
        void this.goToDashboard();
      }
    }).catch(() => void 0);
  }

  async signIn() {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || this.auth.consumeReturnUrl();
    try {
      await this.auth.login(returnUrl);
      if (this.auth.isAuthenticated()) {
        await this.router.navigateByUrl(returnUrl || '/');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Authentication could not be completed.';
      this.auth.setLoginError(message);
    }
  }

  async goToDashboard() {
    await this.router.navigateByUrl(this.auth.consumeReturnUrl());
  }
}
