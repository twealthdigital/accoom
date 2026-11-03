(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    var page = document.querySelector('.payout-page');
    if (!page) return;

    Accoom.PayoutService.initialize();

    var BANKS = [
      'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank', 'First Bank of Nigeria',
      'First City Monument Bank (FCMB)', 'Globus Bank', 'Guaranty Trust Bank (GTBank)', 'Heritage Bank',
      'Keystone Bank', 'Kuda Bank', 'Lotus Bank', 'Moniepoint Microfinance Bank', 'Opay',
      'Palmpay', 'Polaris Bank', 'PremiumTrust Bank', 'Providus Bank', 'Stanbic IBTC Bank',
      'Standard Chartered Bank Nigeria', 'Sterling Bank', 'SunTrust Bank', 'TAJBank', 'Titan Trust Bank',
      'Union Bank of Nigeria', 'United Bank for Africa (UBA)', 'Unity Bank', 'Wema Bank',
      'Zenith Bank'
    ];
    var STATUS_COPY = {
      pending: 'Your withdrawal request has been received and is awaiting processing.',
      successful: 'Your withdrawal has been completed successfully.',
      failed: 'Your withdrawal could not be completed. Please check the transaction details or contact support.'
    };
    var WITHDRAWAL_FEE = 25;
    var activeFilter = 'all';
    var editingAccountId = null;
    var isSubmitting = false;

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    }

    function money(value) {
      return Accoom.formatWalletAmount(value);
    }

    function setText(selector, value) {
      var element = document.querySelector(selector);
      if (element) element.textContent = value;
    }

    function dateTime(value) {
      var date = new Date(value);
      return isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
    }

    function renderIdentity() {
      var user = Accoom.getStorage('accoom-user', {});
      var name = user.name || user.email || 'Agent';
      var parts = String(name).trim().split(/\s+/);
      setText('[data-payout-name]', name);
      setText('[data-payout-role]', user.agentType || 'Agent account');
      setText('[data-payout-avatar]', ((parts[0] || 'A').charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase());
      var image = document.querySelector('[data-payout-avatar-img]');
      var initials = document.querySelector('[data-payout-avatar]');
      if (user.avatar && image) {
        image.src = user.avatar;
        image.alt = name;
        image.hidden = false;
        if (initials) initials.hidden = true;
      }
    }

    function renderDropdownOptions(root, items, selectedValue) {
      if (!root) return;
      var panel = root.querySelector('[data-dropdown-options]') || root.querySelector('[data-dropdown-panel]');
      var hiddenInput = root.querySelector('input[type="hidden"]');
      var label = root.querySelector('[data-dropdown-label]');
      var trigger = root.querySelector('.dropdown-trigger');
      if (!panel || !hiddenInput || !label || !trigger) return;

      panel.innerHTML = '';
      var selectedItem = null;
      items.forEach(function (item) {
        var option = document.createElement('li');
        option.setAttribute('role', 'option');
        option.setAttribute('data-value', item.value);
        option.setAttribute('aria-selected', item.value === selectedValue ? 'true' : 'false');
        option.setAttribute('tabindex', '-1');
        option.className = 'select-dropdown-option';
        option.textContent = item.label;
        if (item.value === selectedValue) {
          option.classList.add('is-active');
          selectedItem = item;
        }
        panel.appendChild(option);
      });

      hiddenInput.value = selectedItem ? selectedItem.value : '';
      label.textContent = selectedItem ? selectedItem.label : label.getAttribute('data-placeholder-text');
      trigger.setAttribute('data-placeholder', selectedItem ? 'false' : 'true');
    }

    function renderBankOptions(selectedBank) {
      renderDropdownOptions(document.querySelector('[data-payout-bank-select]'), BANKS.map(function (bank) {
        return { value: bank, label: bank };
      }), selectedBank || '');
    }

    function renderSummary() {
      var summary = Accoom.PayoutService.getSummary();
      setText('[data-payout-summary="availableBalance"]', money(summary.availableBalance));
      setText('[data-payout-summary="totalWithdrawn"]', money(summary.totalWithdrawn));
      setText('[data-payout-summary="pendingWithdrawals"]', money(summary.pendingWithdrawals));
      setText('[data-payout-summary="successfulCount"]', String(summary.successfulCount));
      setText('[data-payout-available-hint]', money(summary.availableBalance));
    }

    function statusClass(status) {
      return ['pending', 'successful', 'failed'].indexOf(status) !== -1 ? status : 'pending';
    }

    function renderAccounts() {
      var accounts = Accoom.PayoutService.getAccounts();
      var list = document.querySelector('[data-payout-account-list]');
      var empty = document.querySelector('[data-payout-accounts-empty]');
      var accountDropdown = document.querySelector('[data-payout-account-select]');
      var accountInput = accountDropdown && accountDropdown.querySelector('input[name="accountId"]');
      var accountTrigger = accountDropdown && accountDropdown.querySelector('.dropdown-trigger');
      var noAccount = document.querySelector('[data-payout-no-account]');
      var selectedId = accountInput ? accountInput.value : '';
      if (!list) return;

      if (empty) empty.hidden = accounts.length !== 0;
      if (noAccount) noAccount.hidden = accounts.length !== 0;
      list.innerHTML = accounts.map(function (account) {
        return '<article class="payout-account">' +
          '<div class="payout-account-top"><div class="payout-account-bank"><span class="payout-bank-icon" aria-hidden="true">₦</span>' +
            '<span>' + escapeHtml(account.bankName) + '</span></div></div>' +
          '<div><p class="payout-account-name">' + escapeHtml(account.accountName) + '</p>' +
            '<p class="payout-account-number">Account ending in ' + escapeHtml(account.last4) + '</p></div>' +
          '<div class="payout-status-line"><span class="payout-verification-badge">Verification unavailable</span></div>' +
          '<div class="payout-account-actions">' +
            '<button type="button" class="payout-text-button" data-payout-edit="' + escapeHtml(account.id) + '">Edit</button>' +
            '<button type="button" class="payout-text-button payout-text-button--danger" data-payout-remove="' + escapeHtml(account.id) + '">Remove</button>' +
          '</div>' +
        '</article>';
      }).join('');

      if (accountDropdown) {
        var options = accounts.map(function (account) {
          return {
            value: account.id,
            label: account.bankName + ' · ******' + account.last4
          };
        });
        var selectedAccountId = accounts.some(function (account) { return account.id === selectedId; }) ? selectedId : '';
        renderDropdownOptions(accountDropdown, options, selectedAccountId);
        if (accountTrigger) accountTrigger.disabled = accounts.length === 0;
      }
    }

    function renderTransactions() {
      var list = document.querySelector('[data-payout-transaction-list]');
      var empty = document.querySelector('[data-payout-transactions-empty]');
      if (!list) return;
      var transactions = Accoom.PayoutService.getTransactions().filter(function (transaction) {
        return activeFilter === 'all' || transaction.payoutStatus === activeFilter;
      });
      if (empty) empty.hidden = transactions.length !== 0;
      list.innerHTML = transactions.map(function (transaction) {
        var status = statusClass(transaction.payoutStatus);
        return '<article class="payout-transaction">' +
          '<div class="payout-transaction-main">' +
            '<p class="payout-transaction-reference">' + escapeHtml(String(transaction.reference || transaction.id).replace(/-DEMO-/g, '-')) + '</p>' +
            '<p class="payout-transaction-meta">' + escapeHtml(dateTime(transaction.createdAt)) + '</p>' +
            '<p class="payout-transaction-destination">' + escapeHtml(transaction.destinationBank || transaction.payoutMethod || 'Bank account') +
              ' · ' + escapeHtml(transaction.maskedAccount || 'Account masked') + '</p>' +
          '</div>' +
          '<div class="payout-transaction-side"><span class="payout-status payout-status--' + status + '">' +
            escapeHtml(status.charAt(0).toUpperCase() + status.slice(1)) + '</span>' +
            '<strong class="payout-transaction-amount">' + escapeHtml(money(transaction.amount)) + '</strong>' +
            '<button type="button" class="payout-text-button" data-payout-details="' + escapeHtml(String(transaction.id)) + '">View details</button>' +
          '</div>' +
          '<p class="payout-status-explanation">' + escapeHtml(STATUS_COPY[status]) + '</p>' +
        '</article>';
      }).join('');
    }

    function refresh() {
      renderSummary();
      renderAccounts();
      renderTransactions();
      updateEstimate();
    }

    function clearAccountErrors() {
      document.querySelectorAll('[data-payout-account-form] [data-payout-error]').forEach(function (element) {
        element.textContent = '';
      });
      document.querySelectorAll('[data-payout-account-form] [aria-invalid="true"]').forEach(function (element) {
        element.removeAttribute('aria-invalid');
      });
      var saveError = document.querySelector('[data-payout-account-save-error]');
      if (saveError) {
        saveError.hidden = true;
        saveError.textContent = '';
      }
    }

    function showAccountFeedback(message, isError) {
      var feedback = document.querySelector('[data-payout-account-feedback]');
      if (!feedback) return;
      feedback.hidden = false;
      feedback.classList.toggle('is-error', !!isError);
      feedback.textContent = message;
    }

    function setFieldError(form, name, message) {
      var field = form.elements[name];
      var error = form.querySelector('[data-payout-error="' + name + '"]');
      if (field) field.setAttribute('aria-invalid', 'true');
      var dropdown = form.querySelector('[data-payout-' + (name === 'accountId' ? 'account' : 'bank') + '-select] .dropdown-trigger');
      if (dropdown) dropdown.setAttribute('aria-invalid', 'true');
      if (error) error.textContent = message;
    }

    function updateDropdownPlaceholder(root, input) {
      var trigger = root && root.querySelector('.dropdown-trigger');
      if (trigger && input) trigger.setAttribute('data-placeholder', input.value ? 'false' : 'true');
    }

    function initializeDropdown(root) {
      if (!root) return;
      Accoom.initDropdown(root);
      var trigger = root.querySelector('.dropdown-trigger');
      var panel = root.querySelector('[data-dropdown-panel]');
      if (!trigger || !panel) return;

      function options() {
        return Accoom.$$('[role="option"]', panel).filter(function (option) {
          return getComputedStyle(option).display !== 'none';
        });
      }

      function focusOption(option) {
        if (option) option.focus();
      }

      Accoom.on(trigger, 'keydown', function (event) {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].indexOf(event.key) === -1) return;
        if (trigger.getAttribute('aria-expanded') === 'true') return;
        event.preventDefault();
        trigger.click();
        var choices = options();
        var firstOption = event.key === 'ArrowUp' ? choices[choices.length - 1] : choices[0];
        window.setTimeout(function () { focusOption(firstOption); }, 50);
      });

      Accoom.on(panel, 'keydown', function (event) {
        var choices = options();
        var current = event.target.closest('[role="option"]');
        var index = choices.indexOf(current);
        if (event.key === 'Escape') {
          event.preventDefault();
          trigger.click();
          trigger.focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          var direction = event.key === 'ArrowDown' ? 1 : -1;
          var nextIndex = index < 0 ? (direction > 0 ? 0 : choices.length - 1) :
            (index + direction + choices.length) % choices.length;
          focusOption(choices[nextIndex]);
        } else if (event.key === 'Home') {
          event.preventDefault();
          focusOption(choices[0]);
        } else if (event.key === 'End') {
          event.preventDefault();
          focusOption(choices[choices.length - 1]);
        } else if ((event.key === 'Enter' || event.key === ' ') && current) {
          event.preventDefault();
          current.click();
        }
      });

      Accoom.on(root, 'dropdown:select', function () {
        var selectedValue = root.querySelector('input[type="hidden"]').value;
        Accoom.$$('[role="option"]', panel).forEach(function (option) {
          option.setAttribute('aria-selected', option.getAttribute('data-value') === selectedValue ? 'true' : 'false');
        });
        trigger.focus();
      });
    }

    function openAccountForm(account) {
      var form = document.querySelector('[data-payout-account-form]');
      if (!form) return;
      editingAccountId = account ? account.id : null;
      form.hidden = false;
      renderBankOptions(account ? account.bankName : '');
      form.elements.accountNumber.value = '';
      form.elements.accountName.value = account ? account.accountName : '';
      setText('[data-payout-account-form-title]', account ? 'Edit payout account' : 'Add a bank account');
      setText('[data-payout-account-number-hint]', account
        ? 'Leave blank to keep the saved account number. Enter 10 digits to replace it; only the last four digits will be saved.'
        : 'Enter 10 digits. The full number is not stored.');
      clearAccountErrors();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.elements.bankName.focus();
    }

    function closeAccountForm() {
      var form = document.querySelector('[data-payout-account-form]');
      if (!form) return;
      form.reset();
      form.hidden = true;
      editingAccountId = null;
      renderBankOptions('');
      clearAccountErrors();
    }

    function handleAccountSubmit(event) {
      event.preventDefault();
      var form = event.currentTarget;
      clearAccountErrors();
      var bankName = form.elements.bankName.value.trim();
      var accountNumber = form.elements.accountNumber.value.trim();
      var accountName = form.elements.accountName.value.trim();
      var existing = editingAccountId ? Accoom.PayoutService.getAccounts().filter(function (account) {
        return account.id === editingAccountId;
      })[0] : null;
      var valid = true;

      if (BANKS.indexOf(bankName) === -1) {
        setFieldError(form, 'bankName', 'Choose a bank from the Nigerian bank suggestions.');
        valid = false;
      }
      if (accountNumber && !/^\d{10}$/.test(accountNumber)) {
        setFieldError(form, 'accountNumber', 'Enter exactly 10 digits.');
        valid = false;
      } else if (!accountNumber && (!existing || existing.bankName !== bankName)) {
        setFieldError(form, 'accountNumber', 'Enter the 10-digit account number.');
        valid = false;
      }
      if (!accountName) {
        setFieldError(form, 'accountName', 'Enter the account name.');
        valid = false;
      }
      if (!valid) return;

      var saved = Accoom.PayoutService.saveAccount({
        id: editingAccountId,
        bankName: bankName,
        accountNumber: accountNumber,
        accountName: accountName
      });
      if (!saved) {
        var saveError = form.querySelector('[data-payout-account-save-error]');
        if (saveError) {
          saveError.hidden = false;
          saveError.textContent = 'This account could not be saved in browser storage. Please try again.';
        }
        return;
      }
      closeAccountForm();
      refresh();
      showAccountFeedback('Payout account saved. Bank verification is unavailable.', false);
    }

    function updateEstimate() {
      var form = document.querySelector('[data-payout-withdraw-form]');
      if (!form) return;
      var amount = Number(form.elements.amount.value);
      var net = isFinite(amount) && amount > 0 ? Math.max(0, amount - WITHDRAWAL_FEE) : 0;
      setText('[data-payout-fee]', money(WITHDRAWAL_FEE));
      setText('[data-payout-net]', money(net));
    }

    function clearWithdrawalErrors() {
      var form = document.querySelector('[data-payout-withdraw-form]');
      if (!form) return;
      form.querySelectorAll('[data-payout-error]').forEach(function (element) { element.textContent = ''; });
      form.querySelectorAll('[aria-invalid="true"]').forEach(function (element) { element.removeAttribute('aria-invalid'); });
    }

    function prepareWithdrawal(event) {
      event.preventDefault();
      if (isSubmitting) return;
      var form = event.currentTarget;
      clearWithdrawalErrors();
      var amount = Number(form.elements.amount.value);
      var accountId = form.elements.accountId.value;
      var available = Accoom.PayoutService.getSummary().availableBalance;
      var valid = true;
      if (!form.elements.amount.value || !isFinite(amount) || amount <= 0) {
        setFieldError(form, 'amount', 'Enter an amount greater than zero.');
        valid = false;
      } else if (amount > available) {
        setFieldError(form, 'amount', 'This amount is more than your available balance.');
        valid = false;
      }
      if (!accountId || !Accoom.PayoutService.getAccounts().some(function (account) { return account.id === accountId; })) {
        setFieldError(form, 'accountId', 'Select a payout account before continuing.');
        valid = false;
      }
      if (!valid) return;

      var account = Accoom.PayoutService.getAccounts().filter(function (item) { return item.id === accountId; })[0];
      var dialog = document.querySelector('[data-payout-confirm-dialog]');
      setText('[data-payout-confirm="amount"]', money(amount));
      setText('[data-payout-confirm="fee"]', money(WITHDRAWAL_FEE));
      setText('[data-payout-confirm="net"]', money(Math.max(0, amount - WITHDRAWAL_FEE)));
      setText('[data-payout-confirm="bank"]', account.bankName);
      setText('[data-payout-confirm="account"]', '******' + account.last4);
      if (dialog) dialog.showModal();
    }

    function submitWithdrawal() {
      if (isSubmitting) return;
      var form = document.querySelector('[data-payout-withdraw-form]');
      var dialog = document.querySelector('[data-payout-confirm-dialog]');
      var submit = document.querySelector('[data-payout-confirm-submit]');
      var feedback = document.querySelector('[data-payout-request-feedback]');
      if (!form || !dialog || !submit) return;
      isSubmitting = true;
      submit.disabled = true;
      submit.textContent = 'Saving request…';
      window.setTimeout(function () {
        var transaction = Accoom.PayoutService.createWithdrawal(
          Number(form.elements.amount.value),
          form.elements.accountId.value,
          WITHDRAWAL_FEE
        );
        isSubmitting = false;
        submit.disabled = false;
        submit.textContent = 'Confirm withdrawal request';
        dialog.close();
        if (!transaction) {
          if (feedback) {
            feedback.hidden = false;
            feedback.textContent = 'The request could not be saved. Check your account and amount, then try again.';
          }
          return;
        }
        form.reset();
        clearWithdrawalErrors();
        if (feedback) {
          feedback.hidden = false;
          feedback.textContent = 'Withdrawal request recorded as pending. No bank transfer was made and your available balance was not changed.';
        }
        refresh();
        document.querySelector('[data-payout-history-title]').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 350);
    }

    function renderDetails(transactionId) {
      var transaction = Accoom.PayoutService.getTransactions().filter(function (item) {
        return String(item.id) === transactionId;
      })[0];
      var dialog = document.querySelector('[data-payout-details-dialog]');
      if (!transaction || !dialog) return;
      var status = statusClass(transaction.payoutStatus);
      var values = {
        reference: String(transaction.reference || transaction.id).replace(/-DEMO-/g, '-'),
        type: 'Withdrawal request',
        amount: money(transaction.amount),
        date: dateTime(transaction.createdAt),
        destination: (transaction.destinationBank || transaction.payoutMethod || 'Bank account') + ' · ' +
          (transaction.maskedAccount || 'Account masked'),
        status: status.charAt(0).toUpperCase() + status.slice(1),
        explanation: STATUS_COPY[status]
      };
      Object.keys(values).forEach(function (key) {
        var field = dialog.querySelector('[data-payout-detail="' + key + '"]');
        if (field) field.textContent = values[key];
      });
      dialog.showModal();
    }

    function handleAlternativeSubmit(event) {
      event.preventDefault();
      var form = event.currentTarget;
      var field = form.elements.preferredMethod;
      var error = form.querySelector('[data-payout-error="preferredMethod"]');
      var feedback = document.querySelector('[data-payout-alternative-feedback]');
      if (error) error.textContent = '';
      field.removeAttribute('aria-invalid');
      if (!field.value.trim()) {
        field.setAttribute('aria-invalid', 'true');
        if (error) error.textContent = 'Enter the bank or payment method you would like us to support.';
        field.focus();
        return;
      }
      form.reset();
      if (feedback) {
        feedback.hidden = false;
        feedback.textContent = 'Your request has not been sent to ACCOOM.';
      }
    }

    function setupDrawer() {
      var toggle = document.querySelector('[data-payout-mobile-toggle]');
      var sidebar = document.querySelector('[data-payout-sidebar]');
      var backdrop = document.querySelector('[data-payout-backdrop]');
      function close() {
        if (!sidebar || !backdrop) return;
        sidebar.classList.remove('is-open');
        backdrop.hidden = true;
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
      if (toggle && sidebar && backdrop) {
        Accoom.on(toggle, 'click', function () {
          sidebar.classList.add('is-open');
          backdrop.hidden = false;
          toggle.setAttribute('aria-expanded', 'true');
          document.body.style.overflow = 'hidden';
        });
        Accoom.on(backdrop, 'click', close);
        sidebar.querySelectorAll('a, [data-payout-signout]').forEach(function (link) {
          Accoom.on(link, 'click', close);
        });
        Accoom.on(document, 'keydown', function (event) {
          if (event.key === 'Escape') close();
        });
      }
      var signout = document.querySelector('[data-payout-signout]');
      if (signout) Accoom.on(signout, 'click', function () {
        Accoom.setStorage('accoom-user', null);
        window.location.href = 'home.html';
      });
      Accoom.$$('[data-payout-soon]').forEach(function (link) {
        Accoom.on(link, 'click', function (event) {
          event.preventDefault();
          if (Accoom.showToast) Accoom.showToast({ message: 'This section is coming soon.' });
        });
      });
    }

    initializeDropdown(document.querySelector('[data-payout-bank-select]'));
    initializeDropdown(document.querySelector('[data-payout-account-select]'));
    renderIdentity();
    renderBankOptions();
    refresh();
    setupDrawer();
    document.addEventListener(Accoom.WALLET_UPDATED_EVENT, refresh);

    Accoom.on(document.querySelector('[data-payout-jump-withdraw]'), 'click', function () {
      var form = document.querySelector('[data-payout-withdraw-form]');
      if (!form) return;
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.elements.amount.focus({ preventScroll: true });
    });

    var accountForm = document.querySelector('[data-payout-account-form]');
    if (accountForm) {
      var bankInput = accountForm.querySelector('[name="bankName"]');
      Accoom.on(accountForm, 'submit', handleAccountSubmit);
      Accoom.on(bankInput, 'change', function () {
        updateDropdownPlaceholder(document.querySelector('[data-payout-bank-select]'), bankInput);
        clearAccountErrors();
      });
    }
    Accoom.on(document.querySelector('[data-payout-add-method]'), 'click', function () { openAccountForm(null); });
    Accoom.on(document.querySelector('[data-payout-account-cancel]'), 'click', closeAccountForm);
    Accoom.delegate(document.querySelector('[data-payout-account-list]'), 'click', '[data-payout-edit]', function () {
      var id = this.getAttribute('data-payout-edit');
      var account = Accoom.PayoutService.getAccounts().filter(function (item) { return item.id === id; })[0];
      if (account) openAccountForm(account);
    });
    Accoom.delegate(document.querySelector('[data-payout-account-list]'), 'click', '[data-payout-remove]', function () {
      var id = this.getAttribute('data-payout-remove');
      var account = Accoom.PayoutService.getAccounts().filter(function (item) { return item.id === id; })[0];
      if (!account || !window.confirm('Remove the payout account ending in ' + account.last4 + '?')) return;
      if (Accoom.PayoutService.removeAccount(id)) {
        refresh();
        showAccountFeedback('Payout account removed.', false);
      } else {
        showAccountFeedback('The payout account could not be removed from browser storage. Please try again.', true);
      }
    });

    var withdrawalForm = document.querySelector('[data-payout-withdraw-form]');
    if (withdrawalForm) {
      var accountInput = withdrawalForm.querySelector('[name="accountId"]');
      Accoom.on(withdrawalForm, 'submit', prepareWithdrawal);
      Accoom.on(withdrawalForm.elements.amount, 'input', updateEstimate);
      Accoom.on(accountInput, 'change', function () {
        updateDropdownPlaceholder(document.querySelector('[data-payout-account-select]'), accountInput);
        clearWithdrawalErrors();
      });
    }
    Accoom.on(document.querySelector('[data-payout-confirm-submit]'), 'click', submitWithdrawal);
    Accoom.on(document.querySelector('[data-payout-cancel-confirm]'), 'click', function () {
      document.querySelector('[data-payout-confirm-dialog]').close();
    });
    Accoom.on(document.querySelector('[data-payout-confirm-close]'), 'click', function () {
      document.querySelector('[data-payout-confirm-dialog]').close();
    });

    Accoom.delegate(document.querySelector('.payout-filter-group'), 'click', '[data-payout-filter]', function () {
      activeFilter = this.getAttribute('data-payout-filter');
      document.querySelectorAll('[data-payout-filter]').forEach(function (button) {
        var selected = button === this;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      }, this);
      renderTransactions();
    });
    Accoom.delegate(document.querySelector('[data-payout-transaction-list]'), 'click', '[data-payout-details]', function () {
      renderDetails(this.getAttribute('data-payout-details'));
    });

    var detailsDialog = document.querySelector('[data-payout-details-dialog]');
    if (detailsDialog) {
      Accoom.on(document.querySelector('[data-payout-details-close]'), 'click', function () { detailsDialog.close(); });
      Accoom.on(detailsDialog, 'click', function (event) {
        if (event.target === detailsDialog) detailsDialog.close();
      });
    }
    var confirmDialog = document.querySelector('[data-payout-confirm-dialog]');
    if (confirmDialog) {
      Accoom.on(confirmDialog, 'click', function (event) {
        if (event.target === confirmDialog) confirmDialog.close();
      });
    }

    var alternativeForm = document.querySelector('[data-payout-alternative-form]');
    if (alternativeForm) Accoom.on(alternativeForm, 'submit', handleAlternativeSubmit);
  });
})(window.Accoom);
