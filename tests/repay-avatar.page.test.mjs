import fs from 'node:fs';
let pass = 0, fail = 0;
const t = (n, ok) => { console.log((ok ? '  PASS ' : '  FAIL ') + n); ok ? pass++ : fail++; };
const r = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const chat = r('assets/js/pages/contact-agent.js');
t('declined payment shows a Repay pay button', /status === 'declined' \? 'Repay' : 'Make Payment'/.test(chat) && /status !== 'idle' && status !== 'declined'\) \|\| blockedBySold/.test(chat));
t('declined button is hidden once Repay replaces it', /status === 'declined' && els\.propDeclineBtn\) els\.propDeclineBtn\.classList\.add\('is-hidden'\)/.test(chat));
const st = r('assets/js/core/storage.js');
t('shared Avatar helper shrinks uploads', /Avatar\.fromFile/.test(st) && /toDataURL\('image\/jpeg'/.test(st));
for (const f of ['account-settings', 'agent-account-settings']) {
  const s = r('assets/js/pages/' + f + '.js');
  t(f + ': photo upload uses helper and announces the change', /Accoom\.Avatar\.fromFile/.test(s) && /Accoom\.Avatar\.changed\(\)/.test(s));
}
t('agent photo travels with listings', /copy\.agentAvatar =/.test(r('assets/js/core/sync.js')));
t('catalogue agent carries avatar', /avatar: av, real: true/.test(r('assets/js/data/properties.js')));
t('home card uses the seller photo', /item\.agent\.avatar \|\|/.test(r('assets/js/pages/home.js')));
t('chat refreshes seller photos', /refreshSellerAvatars\(\);/.test(chat));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
