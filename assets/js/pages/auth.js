/* ==========================================================================
   ACCOOM — Auth Page (Login / Sign up / Forgot Password)
   No backend wired up yet — form submits just switch views / log intent.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.auth-page');
    if (!page) return;

    var tabsEl = document.querySelector('[data-auth-tabs]');
    var indicator = document.querySelector('[data-auth-indicator]');
    var tabButtons = Accoom.$$('.auth-tab');
    var gotoEls = Accoom.$$('[data-auth-goto]');
    var forms = Accoom.$$('[data-auth-form]');
    var switchSpans = Accoom.$$('[data-auth-switch]');

    var titleEl = document.querySelector('[data-auth-title]');
    var headlineEl = document.querySelector('[data-auth-headline]');
    var subheadEl = document.querySelector('[data-auth-subhead]');
    var dividerEl = document.querySelector('[data-auth-divider-label]');
    var sentCopyEl = document.querySelector('[data-auth-sent-copy]');

    var googleWrap = document.querySelector('.auth-google-btn');
    var dividerWrap = document.querySelector('.auth-divider');
    var headWrap = document.querySelector('.auth-card-head');

    var COPY = {
      login: {
        title: 'Welcome back',
        headline: 'Find <span class="accent">Accommodation</span>.<br>Connect. Secure. <span class="accent">Move in.</span>',
        subhead: 'Sign in to pick up where you left off and keep browsing verified accommodations.',
        divider: 'or continue with email'
      },
      signup: {
        title: 'Create Account',
        headline: 'Create <span class="accent">your</span> account.<br>Unlock the <span class="accent">perfect stay</span>.',
        subhead: 'Join thousands of users finding verified accommodations with trusted agents. Fast, secure, and hassle-free.',
        divider: 'or sign up with email'
      }
    };

    function setView(view, options) {
      options = options || {};
      var isAuthTabView = view === 'login' || view === 'signup';

      // Show only the matching form/panel
      forms.forEach(function (form) {
        form.hidden = form.getAttribute('data-auth-form') !== view;
      });

      // Tabs, Google button, divider and heading only belong to login/signup
      if (tabsEl) tabsEl.hidden = !isAuthTabView;
      if (googleWrap) googleWrap.hidden = !isAuthTabView;
      if (dividerWrap) dividerWrap.hidden = !isAuthTabView;
      if (headWrap) headWrap.hidden = view === 'reset-sent';

      if (isAuthTabView) {
        tabButtons.forEach(function (btn) {
          var active = btn.getAttribute('data-auth-tab') === view;
          btn.classList.toggle('is-active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        if (indicator) {
          indicator.style.transform = view === 'signup' ? 'translateX(100%)' : 'translateX(0)';
        }

        var copy = COPY[view];
        if (titleEl) titleEl.textContent = copy.title;
        if (headlineEl) headlineEl.innerHTML = copy.headline;
        if (subheadEl) subheadEl.textContent = copy.subhead;
        if (dividerEl) dividerEl.textContent = copy.divider;

        switchSpans.forEach(function (span) {
          span.hidden = span.getAttribute('data-auth-switch') !== view;
        });
      }

      if (view === 'reset-sent' && sentCopyEl) {
        sentCopyEl.textContent = options.email
          ? 'We\u2019ve sent a password reset link to ' + options.email + '.'
          : 'We\u2019ve sent a password reset link to your email address.';
      }

      page.setAttribute('data-current-view', view);
    }

    // Tab clicks
    tabButtons.forEach(function (btn) {
      Accoom.on(btn, 'click', function () {
        setView(this.getAttribute('data-auth-tab'));
      });
    });

    // Any "go to" link/button — switch account tab, open forgot password, back to login
    gotoEls.forEach(function (el) {
      Accoom.on(el, 'click', function (e) {
        e.preventDefault();
        setView(this.getAttribute('data-auth-goto'));
      });
    });

    // Password visibility toggles
    Accoom.$$('[data-auth-eye]').forEach(function (btn) {
      Accoom.on(btn, 'click', function () {
        var input = this.previousElementSibling;
        if (!input) return;
        var nowVisible = this.classList.toggle('is-visible');
        input.type = nowVisible ? 'text' : 'password';
        this.setAttribute('aria-label', nowVisible ? 'Hide password' : 'Show password');
      });
    });

    // Form submissions — no backend yet, so just route the UI forward
    forms.forEach(function (form) {
      if (form.tagName !== 'FORM') return;

      Accoom.on(form, 'submit', function (e) {
        e.preventDefault();
        var kind = form.getAttribute('data-auth-form');

        if (kind === 'forgot') {
          var emailInput = form.querySelector('input[type="email"]');
          setView('reset-sent', { email: emailInput ? emailInput.value : '' });
          return;
        }

        if (kind === 'signup') {
          var nameInput = form.querySelector('input[type="text"]');
          var signupEmailInput = form.querySelector('input[type="email"]');
          Accoom.setStorage('accoom-user', {
            name: nameInput ? nameInput.value : '',
            email: signupEmailInput ? signupEmailInput.value : '',
            createdAt: new Date().toISOString()
          });
          window.location.href = 'home.html';
          return;
        }

        console.log('ACCOOM auth: ' + kind + ' submitted (no backend wired up yet)');
      });
    });


    // Initial view: auth.html?mode=signup or ?mode=forgot, otherwise login
    var params = new URLSearchParams(window.location.search);
    var initial = params.get('mode');
    setView((initial === 'signup' || initial === 'forgot') ? initial : 'login');

  });

})(window.Accoom);