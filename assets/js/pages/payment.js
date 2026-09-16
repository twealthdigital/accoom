/* ========================================================================== 
   ACCOOM - Payment
   ========================================================================== */

(function (Accoom) {
  'use strict';

  Accoom.ready(function () {
    var params = new URLSearchParams(window.location.search);
    var propertyId = params.get('id') || params.get('property') || '';
    var amount = Number(params.get('amount')) || 0;
    var mode = params.get('mode') || 'checkout';
    var returnPage = params.get('return');
    // How much the buyer still needs to add to cover this property — only
    // relevant for a property-context deposit (mode=deposit + propertyId).
    // A plain wallet top-up asks for whatever amount the buyer types in.
    var depositNeeded = Math.max(0, amount - Accoom.getWalletBalance());
    // A wallet top-up is either explicitly flagged (context=wallet, used by
    // the profile "Deposit" button) or inferred: a deposit with no property
    // attached to it. Everything else is a normal property payment.
    var isWalletTopUp = params.get('context') === 'wallet' || (mode === 'deposit' && !propertyId);
    var form = document.querySelector('[data-payment-form]');
    var success = document.querySelector('[data-payment-success]');
    var successTitle = document.querySelector('[data-payment-success-title]');
    var successCopy = document.querySelector('[data-payment-success-copy]');
    var successEyebrow = document.querySelector('[data-payment-success-eyebrow]');
    var successSpinner = document.querySelector('[data-payment-processing-spinner]');
    var successAction = document.querySelector('[data-payment-success-action]');
    var error = document.querySelector('[data-payment-error]');
    var subtitle = document.querySelector('[data-payment-subtitle]');
    var propertyEl = document.querySelector('[data-payment-property]');
    var amountEl = document.querySelector('[data-payment-amount]');
    var amountEntry = document.querySelector('[data-payment-amount-entry]');
    var walletAmountInput = document.querySelector('[data-payment-wallet-amount]');
    var back = document.querySelector('[data-payment-back]');
    var backLabel = document.querySelector('[data-payment-back-label]');
    var methodInputs = document.querySelectorAll('[data-payment-method]');
    var methodFields = document.querySelectorAll('[data-payment-fields]');
    var submitButton = document.querySelector('[data-payment-submit]');
    var selectedMethod = 'card';

    function currentWalletAmount() {
      return Number(walletAmountInput && walletAmountInput.value) || 0;
    }

    if (isWalletTopUp) {
      if (amountEntry) amountEntry.hidden = false;
      if (walletAmountInput) walletAmountInput.required = true;
      if (propertyEl) propertyEl.textContent = 'Wallet top-up';
      if (amountEl) amountEl.textContent = Accoom.formatWalletAmount(0);
      if (subtitle) subtitle.textContent = 'Add funds securely to your ACCOOM wallet.';
      if (walletAmountInput) {
        walletAmountInput.addEventListener('input', function () {
          if (amountEl) amountEl.textContent = Accoom.formatWalletAmount(currentWalletAmount());
        });
      }
    } else {
      if (propertyEl) propertyEl.textContent = propertyId || 'Selected property';
      if (mode === 'deposit') {
        // Show/collect only the shortfall, not the full property price.
        if (amountEl) amountEl.textContent = Accoom.formatWalletAmount(depositNeeded);
        if (subtitle) {
          subtitle.textContent = 'Add ' + Accoom.formatWalletAmount(depositNeeded) +
            ' to cover this property, then you can pay immediately.';
        }
      } else if (amountEl) {
        amountEl.textContent = Accoom.formatWalletAmount(amount);
      }
    }

    if (back) {
      if (isWalletTopUp) {
        back.href = returnPage || 'profile.html';
        if (backLabel) backLabel.textContent = 'Back to profile';
      } else {
        back.href = returnPage === 'contact-agent.html'
          ? 'contact-agent.html?open=' + encodeURIComponent(propertyId)
          : 'property.html?id=' + encodeURIComponent(propertyId);
        if (backLabel && returnPage === 'contact-agent.html') backLabel.textContent = 'Back to chat';
      }
    }

    function updatePaymentMethod(method) {
      selectedMethod = method;
      methodFields.forEach(function (fields) {
        var active = fields.getAttribute('data-payment-fields') === method;
        fields.hidden = !active;
        fields.classList.toggle('is-hidden', !active);
        fields.querySelectorAll('input').forEach(function (input) {
          input.required = active && !input.hasAttribute('data-payment-optional');
        });
      });
      methodInputs.forEach(function (input) {
        input.closest('.payment-method').classList.toggle('is-selected', input.checked);
      });
      if (submitButton) {
        submitButton.textContent = method === 'card'
          ? 'Pay securely by card'
          : method === 'transfer' ? 'I have made the transfer' : 'Continue with USSD';
      }
    }

    methodInputs.forEach(function (input) {
      input.addEventListener('change', function () {
        updatePaymentMethod(input.value);
      });
    });
    updatePaymentMethod('card');

    if (!form) return;

    function setError(message) {
      if (!error) return;
      error.textContent = message;
      error.hidden = !message;
    }

    function fieldMessage(field) {
      var messages = {
        name: 'Please enter the name on the card.',
        number: 'Please enter your card number.',
        expiry: 'Please enter the card expiry date.',
        cvv: 'Please enter the card security code.',
        'transfer-receipt': 'Please upload the transaction receipt so we can verify your transfer.',
        'ussd-receipt': 'Please upload the transaction receipt so we can verify your USSD payment.',
        'bank-name': 'Please enter the name of your bank.',
        'wallet-amount': 'Please enter how much you want to deposit (minimum \u20A6100).'
      };
      if (field.validity.typeMismatch) return 'Please enter a valid value in this field.';
      return messages[field.name] || 'Please complete this field before continuing.';
    }

    function validateWalletAmount() {
      if (!isWalletTopUp || !walletAmountInput) return true;
      var invalid = !walletAmountInput.checkValidity() || currentWalletAmount() < 100;
      walletAmountInput.classList.toggle('is-invalid', invalid);
      walletAmountInput.setAttribute('aria-invalid', invalid ? 'true' : 'false');
      if (invalid) {
        setError(fieldMessage(walletAmountInput));
        walletAmountInput.focus();
      }
      return !invalid;
    }

    function validateFormFields() {
      var fields = form.querySelectorAll('input:not([type="radio"]):not([type="file"]):not([data-payment-optional])');
      var firstInvalid = null;
      var message = '';

      fields.forEach(function (field) {
        var invalid = !field.checkValidity();
        field.classList.toggle('is-invalid', invalid);
        field.setAttribute('aria-invalid', invalid ? 'true' : 'false');
        if (invalid && !firstInvalid) {
          firstInvalid = field;
          message = fieldMessage(field);
        }
      });

      if (firstInvalid) {
        setError(message);
        firstInvalid.focus();
        return false;
      }

      return validateWalletAmount();
    }

    function validateReceipt(file, done) {
      if (!file) {
        done('Please upload your transaction receipt before continuing.');
        return;
      }

      var allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowedTypes.indexOf(file.type) === -1) {
        done('Upload a JPG, PNG, WEBP or PDF receipt.');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        done('Your receipt must be 5MB or smaller.');
        return;
      }

      if (file.type === 'application/pdf') {
        done('');
        return;
      }

      var previewUrl = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        URL.revokeObjectURL(previewUrl);
        done(image.naturalWidth > 0 && image.naturalHeight > 0 ? '' : 'That image receipt could not be read. Please choose another file.');
      };
      image.onerror = function () {
        URL.revokeObjectURL(previewUrl);
        done('That image receipt could not be read. Please choose another file.');
      };
      image.src = previewUrl;
    }

    function showProcessingState() {
      if (!success) return;
      success.classList.add('is-open', 'is-processing');
      success.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      if (successEyebrow) successEyebrow.textContent = 'Processing payment';
      if (successTitle) successTitle.textContent = 'Processing payment...';
      if (successCopy) successCopy.textContent = 'We are securely checking your payment details. This may take a few seconds.';
      if (successSpinner) successSpinner.hidden = false;
      if (successAction) {
        successAction.textContent = 'Processing...';
        successAction.classList.add('is-loading');
        successAction.setAttribute('aria-disabled', 'true');
      }

      window.setTimeout(function () {
        success.classList.remove('is-processing');

        // Move the money in the mock wallet. In a real backend this happens
        // server-side once the payment/receipt is verified — here it's
        // applied client-side so the rest of the app has something to read.
        var walletMovedAmount = 0;
        if (mode === 'deposit') {
          walletMovedAmount = isWalletTopUp ? currentWalletAmount() : depositNeeded;
          Accoom.creditWallet(walletMovedAmount);
        } else if (mode === 'checkout') {
          Accoom.debitWallet(amount);
        }

        var pendingVerification = selectedMethod === 'transfer' || selectedMethod === 'ussd';
        var methodLabel = selectedMethod === 'transfer' ? 'Transfer' : selectedMethod === 'ussd' ? 'USSD payment' : 'Card payment';

        if (successEyebrow) successEyebrow.textContent = isWalletTopUp ? 'Wallet funded' : 'Payment received';

        if (isWalletTopUp) {
          if (successTitle) successTitle.textContent = pendingVerification ? 'Deposit submitted' : 'Wallet funded';
          if (successCopy) {
            successCopy.textContent = pendingVerification
              ? 'Your receipt has been saved for verification. ' + Accoom.formatWalletAmount(walletMovedAmount) + ' will reflect in your wallet once confirmed.'
              : Accoom.formatWalletAmount(walletMovedAmount) + ' has been added to your ACCOOM wallet balance.';
          }
          if (successAction) {
            successAction.textContent = 'Back to profile';
            successAction.href = returnPage || 'profile.html';
          }
        } else if (mode === 'deposit') {
          // Both card AND transfer/USSD deposit arrive here.
          // The wallet has already been credited above.
          // Show the same confirm dialog for all deposit methods — the user
          // should NEVER be bounced back to the payment options screen.

          // ── shared inner helper ──────────────────────────────────────────
          function showConfirmDialog(depositedAmount) {
            var newBalance = Accoom.getWalletBalance();
            var canPay    = newBalance >= amount && amount > 0;

            success.classList.add('is-pay-confirm');
            if (successEyebrow) successEyebrow.textContent = 'Balance ready';
            if (successTitle)   successTitle.textContent   = 'Your balance now covers this payment';
            if (successCopy) {
              successCopy.textContent = canPay
                ? 'Your wallet has been credited (' + Accoom.formatWalletAmount(depositedAmount) + '). ' +
                  'Proceed below to complete your payment securely.'
                : 'Your wallet has been credited, but the balance is still insufficient. Please deposit more funds.';
            }

            // Shield icon — signals "secure, waiting for your confirm".
            var iconEl = success.querySelector('.payment-success-icon');
            if (iconEl) {
              iconEl.innerHTML =
                '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
                'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>';
            }

            // Hide the original single action button.
            if (successAction) {
              successAction.classList.remove('is-loading');
              successAction.setAttribute('aria-disabled', 'false');
              successAction.style.display = 'none';
            }

            // Build Cancel + Proceed button row.
            var actionsWrap = document.createElement('div');
            actionsWrap.className = 'pay-confirm-actions';

            var cancelBtn = document.createElement('a');
            cancelBtn.className  = 'btn btn--ghost';
            cancelBtn.href       = returnPage === 'contact-agent.html'
              ? 'contact-agent.html?open=' + encodeURIComponent(propertyId)
              : ('property.html?id=' + encodeURIComponent(propertyId));
            cancelBtn.textContent = 'Cancel';

            var proceedBtn = document.createElement('button');
            proceedBtn.type      = 'button';
            proceedBtn.className = 'btn btn--primary';
            proceedBtn.textContent = canPay ? 'Make payment' : 'Deposit more';

            actionsWrap.appendChild(cancelBtn);
            actionsWrap.appendChild(proceedBtn);

            if (successCopy && successCopy.parentNode) {
              successCopy.parentNode.insertBefore(actionsWrap, successCopy.nextSibling);
            } else {
              success.appendChild(actionsWrap);
            }

            if (canPay) {
              var proceedLocked = false;
              proceedBtn.addEventListener('click', function () {
                if (proceedLocked) return;
                proceedLocked = true;
                proceedBtn.textContent = 'Making payment...';
                proceedBtn.classList.add('is-loading');
                proceedBtn.disabled = true;
                cancelBtn.style.pointerEvents = 'none';
                cancelBtn.style.opacity = '0.5';

                // Re-read balance immediately before debiting — guards against
                // the user having the page open in multiple tabs.
                var latestBalance = Accoom.getWalletBalance();
                if (latestBalance < amount) {
                  proceedBtn.classList.remove('is-loading');
                  proceedBtn.disabled   = false;
                  proceedBtn.textContent = 'Deposit more';
                  cancelBtn.style.pointerEvents = '';
                  cancelBtn.style.opacity = '';
                  proceedLocked = false;
                  if (successTitle) successTitle.textContent = 'Balance changed';
                  if (successCopy)  successCopy.textContent  = 'Your wallet balance is no longer sufficient. Please deposit more funds.';
                  proceedBtn.addEventListener('click', function () {
                    window.location.href = 'payment.html?id=' + encodeURIComponent(propertyId)
                      + '&amount=' + encodeURIComponent(amount)
                      + '&mode=deposit'
                      + '&return=' + encodeURIComponent(returnPage || '');
                  }, { once: true });
                  return;
                }

                window.setTimeout(function () {
                  Accoom.debitWallet(amount);

                  var backHref = returnPage || ('property.html?id=' + encodeURIComponent(propertyId));
                  backHref += (backHref.indexOf('?') === -1 ? '?' : '&') + 'paid=' + encodeURIComponent(propertyId);

                  if (successEyebrow) successEyebrow.textContent = 'Payment complete';
                  if (successTitle)   successTitle.textContent   = 'Payment successful!';
                  if (successCopy)    successCopy.textContent    = 'Your payment has been processed. Redirecting you now\u2026';
                  proceedBtn.textContent = 'Done';
                  cancelBtn.style.display = 'none';

                  window.setTimeout(function () { window.location.href = backHref; }, 1200);
                }, 3000);
              });
            } else {
              proceedBtn.addEventListener('click', function () {
                window.location.href = 'payment.html?id=' + encodeURIComponent(propertyId)
                  + '&amount=' + encodeURIComponent(amount)
                  + '&mode=deposit'
                  + '&return=' + encodeURIComponent(returnPage || '');
              });
            }
          }
          // ── end helper ───────────────────────────────────────────────────

          if (pendingVerification) {
            // Transfer/USSD: show "Deposit submitted" note briefly, then wire
            // "Continue to payment" to open the confirm dialog in-place.
            if (successTitle) successTitle.textContent = 'Deposit submitted';
            if (successCopy) {
              successCopy.textContent = 'Your receipt has been saved. ' +
                'Click below to confirm your payment '+ 'funds will be deducted from your wallet.';
            }
            if (successAction) {
              successAction.textContent = 'Continue to payment';
              successAction.removeAttribute('href');
              successAction.setAttribute('role', 'button');
              successAction.addEventListener('click', function (e) {
                e.preventDefault();
                showConfirmDialog(walletMovedAmount);
              }, { once: true });
            }
          } else {
            // Card: transition directly to the confirm dialog.
            showConfirmDialog(walletMovedAmount);
          }
        } else {
          if (successTitle) successTitle.textContent = methodLabel + ' received';
          if (successCopy) {
            successCopy.textContent = pendingVerification
              ? 'Your receipt has been saved for verification. You can review your purchases from your account.'
              : 'Your card payment request has been recorded. You can review your purchases from your account.';
          }
          if (successAction) {
            if (returnPage === 'contact-agent.html') {
              successAction.textContent = 'Back to chat';
              successAction.href = 'contact-agent.html?paid=' + encodeURIComponent(propertyId);
            } else {
              successAction.textContent = 'View purchases';
              successAction.href = 'purchases.html';
            }
          }
        }

        if (successSpinner) successSpinner.hidden = true;
        // Restore the default action button for all non-deposit flows,
        // and for the transfer/USSD deposit "Continue" button specifically.
        if (successAction && (mode !== 'deposit' || pendingVerification)) {
          successAction.classList.remove('is-loading');
          successAction.setAttribute('aria-disabled', 'false');
        }
      }, 3000);
    }

    if (successAction) {
      successAction.addEventListener('click', function (event) {
        if (successAction.getAttribute('aria-disabled') === 'true') event.preventDefault();
      });
    }

    form.querySelectorAll('input').forEach(function (input) {
      input.addEventListener('input', function () {
        input.classList.remove('is-invalid');
        input.setAttribute('aria-invalid', 'false');
        if (error && error.textContent) setError('');
      });
      input.addEventListener('change', function () {
        input.classList.remove('is-invalid');
        input.setAttribute('aria-invalid', 'false');
      });
    });

    if (walletAmountInput) {
      walletAmountInput.addEventListener('input', function () {
        walletAmountInput.classList.remove('is-invalid');
        walletAmountInput.setAttribute('aria-invalid', 'false');
        if (error && error.textContent) setError('');
      });
    }

    // ------------------------------------------------------------
    // Receipt upload feedback — the file input itself is visually
    // hidden, so without this the control looked identical whether
    // or not a file had actually been chosen.
    // ------------------------------------------------------------
    function formatFileSize(bytes) {
      if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }

    document.querySelectorAll('[data-payment-upload]').forEach(function (control) {
      var input = control.querySelector('[data-payment-receipt]');
      var label = control.querySelector('[data-payment-receipt-label]');
      var meta = control.querySelector('[data-payment-receipt-meta]');
      var removeBtn = control.querySelector('[data-payment-receipt-remove]');
      var defaultLabel = label ? label.textContent : 'Upload receipt';
      var defaultMeta = meta ? meta.textContent : '';
      if (!input) return;

      function showFile(file) {
        if (label) label.textContent = file.name;
        if (meta) meta.textContent = formatFileSize(file.size) + ' \u2022 Tap to replace';
        control.classList.add('is-selected');
        control.classList.remove('is-invalid');
      }

      function clearFile() {
        input.value = '';
        if (label) label.textContent = defaultLabel;
        if (meta) meta.textContent = defaultMeta;
        control.classList.remove('is-selected');
      }

      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (file) showFile(file); else clearFile();
      });

      if (removeBtn) {
        removeBtn.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();
          clearFile();
        });
      }
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!validateFormFields()) return;

      var receipt = selectedMethod === 'card'
        ? null
        : form.querySelector('[data-payment-fields="' + selectedMethod + '"] [data-payment-receipt]');
      var receiptFile = receipt && receipt.files ? receipt.files[0] : null;

      validateReceipt(receiptFile, function (receiptError) {
        if (receiptError) {
          setError(receiptError);
          if (receipt) {
            var invalidControl = receipt.closest('.payment-upload-control');
            if (invalidControl) invalidControl.classList.add('is-invalid');
          }
          return;
        }

        setError('');
        if (receiptFile) {
          try {
            sessionStorage.setItem('accoom-last-receipt', JSON.stringify({
              name: receiptFile.name,
              type: receiptFile.type,
              size: receiptFile.size,
              savedAt: new Date().toISOString(),
              propertyId: propertyId
            }));
          } catch (storageError) {
            // Receipt metadata is helpful locally, but payment must not fail if storage is unavailable.
          }
        }
      form.hidden = true;
        showProcessingState();
      });
    });
  });
})(window.Accoom);
