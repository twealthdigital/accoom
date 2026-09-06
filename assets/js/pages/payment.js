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
    var back = document.querySelector('[data-payment-back]');
    var backLabel = document.querySelector('[data-payment-back-label]');
    var returnPage = params.get('return');
    var methodInputs = document.querySelectorAll('[data-payment-method]');
    var methodFields = document.querySelectorAll('[data-payment-fields]');
    var submitButton = document.querySelector('[data-payment-submit]');
    var selectedMethod = 'card';

    if (propertyEl) propertyEl.textContent = propertyId || 'Selected property';
    if (amountEl) amountEl.textContent = '\u20A6' + amount.toLocaleString('en-NG');
    if (subtitle && mode === 'deposit') {
      subtitle.textContent = 'Add funds securely to continue with this property.';
    }
    if (back) {
      back.href = returnPage === 'contact-agent.html'
        ? 'contact-agent.html'
        : 'property.html?id=' + encodeURIComponent(propertyId);
      if (backLabel && returnPage === 'contact-agent.html') backLabel.textContent = 'Back to chat';
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
        'bank-name': 'Please enter the name of your bank.'
      };
      if (field.validity.typeMismatch) return 'Please enter a valid value in this field.';
      return messages[field.name] || 'Please complete this field before continuing.';
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

      return true;
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
        if (successEyebrow) successEyebrow.textContent = 'Payment received';
        if (successTitle) {
          successTitle.textContent = selectedMethod === 'card'
            ? 'Card payment received'
            : selectedMethod === 'transfer' ? 'Transfer received' : 'USSD payment received';
        }
        if (successCopy) {
          successCopy.textContent = selectedMethod === 'transfer'
            ? 'Your receipt has been saved for verification. You can review your purchases from your account.'
            : selectedMethod === 'ussd'
              ? 'Your USSD payment request has been recorded. You can review your purchases from your account.'
              : 'Your card payment request has been recorded. You can review your purchases from your account.';
        }
        if (successSpinner) successSpinner.hidden = true;
        if (successAction) {
          successAction.textContent = 'View purchases';
          successAction.classList.remove('is-loading');
          successAction.setAttribute('aria-disabled', 'false');
        }
      }, 2500);
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
