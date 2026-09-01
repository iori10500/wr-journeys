(function () {
  const copy = {
    zh: {
      sending: '正在发送…',
      success: '已收到。顾问会在工作时间内尽快回复您。',
      required: '请填写称呼、有效邮箱和旅程描述，并同意隐私政策。',
      verification: '请完成人机验证后再提交。',
      rate: '提交较频繁，请稍后再试。',
      unavailable: '通知通道尚未配置完成，请暂时通过页面上的邮箱联系我们。',
      failed: '暂时无法提交，请稍后再试或直接发送邮件。',
    },
    en: {
      sending: 'Sending…',
      success: 'Received. Your advisor will reply within 24 hours.',
      required: 'Please complete your name, a valid email, your journey notes, and privacy consent.',
      verification: 'Please complete the verification before submitting.',
      rate: 'Too many attempts. Please try again shortly.',
      unavailable: 'The notification channel is not configured yet. Please use the email shown on this page.',
      failed: 'We could not submit this right now. Please try again or email us directly.',
    },
  };

  function language(form) {
    return form.elements.lang && form.elements.lang.value === 'en' ? 'en' : 'zh';
  }

  function messageFor(error, lang) {
    if (['required_fields', 'invalid_email', 'privacy_consent', 'invalid_timing'].includes(error)) return copy[lang].required;
    if (error === 'verification_failed') return copy[lang].verification;
    if (error === 'rate_limited') return copy[lang].rate;
    if (error === 'delivery_unavailable') return copy[lang].unavailable;
    return copy[lang].failed;
  }

  function analyticsContext() {
    const context = window.WRAnalyticsContext || {};
    return {
      content_group: context.content_group || 'wr_journeys',
      landing_path: context.landing_path || location.pathname,
      page_path: context.page_path || location.pathname,
      page_language: context.page_language || document.documentElement.lang || 'zh',
    };
  }

  function trackedDestination(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) return { href, destination: href };
      const context = analyticsContext();
      if (!url.searchParams.has('landing_path')) url.searchParams.set('landing_path', context.landing_path);
      if (!url.searchParams.has('content_group')) url.searchParams.set('content_group', context.content_group);
      return { href: url.pathname + url.search + url.hash, destination: url.pathname + url.search };
    } catch (_) {
      return { href, destination: href };
    }
  }

  document.querySelectorAll('[data-enquiry-form]').forEach(function (form) {
    const started = form.elements.started_at;
    let formStarted = false;
    if (started) started.value = String(Date.now());

    form.addEventListener('focusin', function () {
      if (formStarted || typeof window.gtag !== 'function') return;
      formStarted = true;
      const context = analyticsContext();
      window.gtag('event', 'enquiry_form_start', Object.assign({
        enquiry_variant: form.elements.variant ? form.elements.variant.value : 'unknown',
        journey_route: form.elements.route ? form.elements.route.value || 'general' : 'general',
        lead_source: form.elements.source ? form.elements.source.value || 'unknown' : 'unknown',
      }, context));
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const lang = language(form);
      const status = form.querySelector('[data-enquiry-status]');
      const button = form.querySelector('button[type="submit"]');
      const label = button.querySelector('span');

      status.className = 'enquiry-status';
      status.textContent = '';
      if (!form.reportValidity()) return;

      const data = new FormData(form);
      const payload = Object.fromEntries(data.entries());
      Object.assign(payload, analyticsContext());
      payload.interests = data.getAll('interests').join(', ');
      const turnstileInput = form.querySelector('[name="cf-turnstile-response"]');
      payload.turnstile_token = turnstileInput ? turnstileInput.value : '';

      button.disabled = true;
      const original = label.textContent;
      label.textContent = copy[lang].sending;
      try {
        const response = await fetch((lang === 'en' ? '/en' : '') + '/api/enquiries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(function () { return {}; });
        if (!response.ok || !result.ok) throw new Error(result.error || 'failed');

        status.className = 'enquiry-status is-success';
        status.textContent = copy[lang].success + (result.id ? ' · ' + result.id : '');
        form.reset();
        if (started) started.value = String(Date.now());
        if (window.turnstile) window.turnstile.reset(form.querySelector('.cf-turnstile'));
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'generate_lead', Object.assign({
            currency: 'CNY', value: 0,
            enquiry_variant: payload.variant,
            journey_route: payload.route || 'general',
            lead_source: payload.source || 'unknown',
          }, analyticsContext()));
        }
      } catch (error) {
        status.className = 'enquiry-status is-error';
        status.textContent = messageFor(error.message, lang);
        if (window.turnstile) window.turnstile.reset(form.querySelector('.cf-turnstile'));
      } finally {
        button.disabled = false;
        label.textContent = original;
      }
    });
  });

  document.addEventListener('click', function (event) {
    const cta = event.target.closest('[data-enquiry-cta]');
    if (!cta || typeof window.gtag !== 'function') return;

    const originalHref = cta.href || cta.getAttribute('href') || '';
    const target = trackedDestination(originalHref);
    const href = target.href;
    if (href && href !== originalHref) cta.href = href;
    const isPlainSameTabClick = event.button === 0
      && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
      && (!cta.target || cta.target === '_self') && Boolean(href);
    let followed = false;
    function followLink() {
      if (followed) return;
      followed = true;
      window.location.assign(href);
    }

    const params = {
      cta_location: cta.dataset.enquiryCta || 'unknown',
      destination: target.destination || '',
      transport_type: 'beacon',
    };
    if (cta.dataset.journeyId) params.journey_id = cta.dataset.journeyId;
    Object.assign(params, analyticsContext());
    if (isPlainSameTabClick) {
      event.preventDefault();
      params.event_callback = followLink;
      params.event_timeout = 500;
    }
    window.gtag('event', 'advisor_cta_click', params);
    if (isPlainSameTabClick) window.setTimeout(followLink, 550);
  });
})();
