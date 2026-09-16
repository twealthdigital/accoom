/* ==========================================================================
   ACCOOM — Onboarding (role selection + follow-up question)

   IMPORTANT — security note:
   This is a static front-end prototype with no server/session backend, so
   every check in this file is a client-side convenience gate, not real
   security. It stops normal navigation (reloading here, deep-linking to
   this page, going back after finishing), but anyone with devtools open
   can still edit localStorage directly and bypass it. Real enforcement —
   "this account has actually finished onboarding as an agent" — has to be
   verified server-side once there's a backend. Don't treat this file as a
   substitute for that.
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {

    var page = document.querySelector('.onboarding-page');
    if (!page) return;

    var user = Accoom.getStorage('accoom-user', null);
    var isAgentUpgrade = /[?&]upgrade=agent\b/.test(window.location.search);

    // Defense in depth: the inline <head> script already redirects
    // synchronously before paint. This re-check covers the case where this
    // script runs after localStorage changed (e.g. another tab logged out).
    if (!user || !user.email) {
      window.location.replace('auth.html');
      return;
    }
    // isAgentUpgrade must win over the role check below — otherwise
    // "Become an Agent" on an already-agent account silently redirects
    // straight to agent-details instead of showing this screen.
    if (!isAgentUpgrade) {
      if (user.role === 'agent') {
        window.location.replace('agent-details.html');
        return;
      }
      if (user.role === 'customer') {
        window.location.replace('home.html');
        return;
      }
    }

    var state = {
      role: isAgentUpgrade ? 'agent' : null,
      customerPrefs: [],
      agentType: null
    };

    function setStep(step) {
      page.setAttribute('data-onboarding-step', step);
    }

    // Arriving via "Become an Agent" as an existing customer: skip the role
    // picker (role is already decided) and go straight to the agent question.
    if (isAgentUpgrade) {
      setStep('agent-intent');
      Accoom.$$('[data-onboarding-back]').forEach(function (btn) {
        btn.classList.add('is-hidden');
      });
    }

    function mergeUser(extra) {
      var merged = {};
      var key;
      for (key in user) {
        if (Object.prototype.hasOwnProperty.call(user, key)) merged[key] = user[key];
      }
      for (key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) merged[key] = extra[key];
      }
      return merged;
    }

    // ---- Step 1: role selection ----
    Accoom.$$('[data-role-card]').forEach(function (card) {
      Accoom.on(card, 'click', function () {
        state.role = this.getAttribute('data-role-card');
        Accoom.$$('[data-role-card]').forEach(function (c) {
          c.setAttribute('aria-pressed', c === card ? 'true' : 'false');
        });
        setStep(state.role === 'agent' ? 'agent-intent' : 'customer-pref');
      });
    });

    // ---- Back to role step ----
    Accoom.$$('[data-onboarding-back]').forEach(function (btn) {
      Accoom.on(btn, 'click', function () {
        setStep('role');
      });
    });

    // ---- Step 2a: customer preferences (multi-select, skippable) ----
    var prefContinueBtn = document.querySelector('[data-customer-continue]');
    var skipBtn = document.querySelector('[data-customer-skip]');

    Accoom.$$('[data-pref-chip]').forEach(function (chip) {
      Accoom.on(chip, 'click', function () {
        var val = this.getAttribute('data-pref-chip');
        var idx = state.customerPrefs.indexOf(val);
        var nowSelected = this.classList.toggle('is-selected');
        this.setAttribute('aria-pressed', nowSelected ? 'true' : 'false');
        if (nowSelected && idx === -1) state.customerPrefs.push(val);
        if (!nowSelected && idx !== -1) state.customerPrefs.splice(idx, 1);
      });
    });

    // ---- Step 2b: agent type (single-select, required — no skip button exists) ----
    var agentContinueBtn = document.querySelector('[data-agent-continue]');

    Accoom.$$('[data-agent-option]').forEach(function (opt) {
      Accoom.on(opt, 'click', function () {
        state.agentType = this.getAttribute('data-agent-option');
        Accoom.$$('[data-agent-option]').forEach(function (o) {
          var selected = o === opt;
          o.classList.toggle('is-selected', selected);
          o.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
        if (agentContinueBtn) agentContinueBtn.removeAttribute('disabled');
      });
    });

    // ---- Finish: persist the choice, show the loading state, then redirect ----
    function finish() {
      var extra = {
        role: state.role,
        onboardingCompletedAt: new Date().toISOString()
      };
      if (state.role === 'customer') extra.customerPreferences = state.customerPrefs;
      if (state.role === 'agent') extra.agentType = state.agentType;

      Accoom.setStorage('accoom-user', mergeUser(extra));
      setStep('loading');

      // Use replace() (not href) so the finished onboarding step never sits
      // in browser history — pressing "back" from home/agent-details can't
      // land the user back in the middle of onboarding.
      setTimeout(function () {
        window.location.replace(state.role === 'agent' ? 'agent-details.html' : 'home.html');
      }, 900);
    }

    if (prefContinueBtn) Accoom.on(prefContinueBtn, 'click', finish);
    if (skipBtn) Accoom.on(skipBtn, 'click', finish);

    if (agentContinueBtn) {
      Accoom.on(agentContinueBtn, 'click', function () {
        // Guard mirrors the disabled attribute — belt and braces in case the
        // attribute is removed via devtools without a real selection made.
        if (!state.agentType) return;
        finish();
      });
    }

  });

})(window.Accoom);
