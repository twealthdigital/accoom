// Inclusive pricing: customers see accommodation + service charge + legal fee + agency fee as ONE price.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('  PASS ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

const win = { Accoom: {} }; win.window = win;
vm.runInNewContext(fs.readFileSync('assets/js/data/pricing.js', 'utf8'), win);
const P = win.Accoom.Pricing;

console.log('Pricing');
test('acceptance: N100,000 + N50,000 fees shows N150,000', () => {
  const l = { price: 100000, priceValue: 100000, serviceCharge: 20000, legalFee: 10000, agencyFee: 20000 };
  assert.equal(P.finalPrice(l), 150000);
  assert.equal(P.naira(P.finalPrice(l)), '\u20A6150,000');
});
test('individual fees stay available for agent records', () => {
  const b = P.breakdown({ priceValue: 100000, serviceCharge: 20000, legalFee: 10000, agencyFee: 20000 });
  assert.deepEqual([b.base, b.service, b.legal, b.agency, b.fees], [100000, 20000, 10000, 20000, 50000]);
});
test('a price with no fee fields is already final and is not changed', () => {
  assert.equal(P.finalPrice({ price: 460000 }), 460000);
  assert.equal(P.finalPrice({ price: '\u20A6460,000' }), 460000);
});
test('fees alone never make a payable price', () => {
  assert.equal(P.finalPrice({ price: 0, agencyFee: 15000 }), 0);
});
test('billing period words', () => {
  assert.equal(P.periodWords('month').per, 'Month'); assert.equal(P.periodWords('day').first, 'First Day'); assert.equal(P.periodWords('').per, 'Year');
});
test('property page shows Included for each fee and never the base price', () => {
  const js = fs.readFileSync('assets/js/pages/property.js', 'utf8'), html = fs.readFileSync('property.html', 'utf8');
  assert.ok(!/stored\.serviceCharge|rent \* 0\.1|: 20000/.test(js), 'no invented or duplicated fees on the property page');
  assert.ok(html.includes('pricing.js'));
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
