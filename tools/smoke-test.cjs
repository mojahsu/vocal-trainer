// 冒煙測試：用假麥克風（固定 207.65 Hz ≈ G♯3）跑隨機測試與逐字練唱匯入。
// 用法：node tools/smoke-test.cjs
const { chromium } = require('playwright');
const path = require('path');
const url = 'file://' + path.resolve(__dirname, '..', 'index.html');

// 自編的測試旋律（非任何現成歌曲），兩種匯入格式各一份
const TSV = [
  '\t一\t二\t',
  '簡譜\t1\t2\t3',
  '音名\tG3#\tA3#\tC4',
  '頻率\t207.6\t233.1\t261.6',
  '',
  '\t四\t五',
  '音名\tD4#\tF4',
].join('\n');
const PLAIN = '甲 G#3 乙 B3 丙 E4\n丁 F#4 戊 G#4';

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let fail = 0;
  const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fail++; };

  const page = await browser.newPage();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 207.65;
      const d = c.createMediaStreamDestination(); o.connect(d); o.start(); return d.stream;
    };
  });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);

  // 隨機測試
  await page.click('[data-tab=rand]'); await page.selectOption('#rtN', '5');
  await page.click('#rtGo');
  await page.waitForSelector('#rtSum:not([hidden])', { timeout: 60000 });
  check((await page.$$('#rtRes tr')).length === 5, '隨機測試產生 5 列結果');
  await page.click('[data-tab=pitch]');
  check((await page.$$('#drillList .chip')).length > 0, '偏差大的音加入要加強清單');

  // 逐字練唱：表格格式
  await page.click('[data-tab=song]');
  await page.fill('#sgName', '表格測試'); await page.fill('#sgText', TSV); await page.click('#sgParse');
  check(/2 句、5 個音/.test(await page.textContent('#sgParseMsg')), '表格格式解析為 2 句 5 音');
  const strip = await page.$$eval('#sgStrip .sgn', x => x.map(e => e.innerText.replace('\n', ':')));
  check(strip.join(' ') === '一:G♯3 二:A♯3 ～:C4', '拖音顯示為 ～（實際：' + strip.join(' ') + '）');

  // 唱 G♯3 應過關並跳到下一字
  await page.click('#sgAutoPlay');
  await page.click('[data-tab=pitch]');
  if (await page.isEnabled('#micBtn')) await page.click('#micBtn');
  await page.click('[data-tab=song]');
  await page.waitForTimeout(2500);
  check((await page.textContent('#sgCh')) === '二', '唱準後自動跳到下一個字');

  // 純文字格式（儲存後匯入區會收起，先展開）
  await page.click('#sgImport summary');
  await page.fill('#sgName', '純文字測試'); await page.fill('#sgText', PLAIN); await page.click('#sgParse');
  check(/2 句、5 個音/.test(await page.textContent('#sgParseMsg')), '純文字格式解析為 2 句 5 音');

  check(errors.length === 0, '沒有 JS 錯誤' + (errors.length ? '：' + errors.join(' | ') : ''));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
