// マニュアル用スクリーンショットを取るスクリプト。
// dev サーバ (api: 3000, web: 5173) が動いている前提。
//
// 使い方:
//   node scripts/take-screenshots.mjs
//
// 出力: docs/screenshots/*.png

import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../docs/screenshots');
mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'http://localhost:5173';
const EMAIL = 'eishin.muraoka@gmail.com';
const PASSWORD = 'nagareyamajc2026';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  → ${name}.png`);
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0' });
  await sleep(400);
  await shot(page, '01-login');
  await page.type('#email', EMAIL);
  await page.type('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  await sleep(600);
}

async function clickByText(page, text, opts = {}) {
  const handle = await page.evaluateHandle((t) => {
    const all = Array.from(
      document.querySelectorAll('button, a, label, span'),
    );
    return all.find((el) => el.textContent?.trim().includes(t));
  }, text);
  const el = handle.asElement();
  if (!el) throw new Error(`Element with text "${text}" not found`);
  await el.click(opts);
  await handle.dispose();
}

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    defaultViewport: { width: 414, height: 896, deviceScaleFactor: 2 }, // iPhone 11 Pro Max 風
  });
  const page = await browser.newPage();

  try {
    // ── 1. ログイン画面
    console.log('1. ログイン');
    await login(page);

    // ── 2. ユーザーモードのイベント一覧
    console.log('2. イベント一覧 (ユーザーモード)');
    await page.goto(`${BASE}/events`, { waitUntil: 'networkidle0' });
    await sleep(800);
    await shot(page, '02-events-user-mode');

    // ── 3. ユーザーモードのイベント詳細
    console.log('3. イベント詳細 (ユーザーモード)');
    const eventLink = await page.$('.event-list a.event-card');
    if (eventLink) {
      await eventLink.click();
      await sleep(800);
      await shot(page, '03-event-detail-user');
      // RSVP ボタン押した状態
      const yesBtn = await page.$('.rsvp-btn');
      if (yesBtn) {
        await yesBtn.click();
        await sleep(300);
        await shot(page, '04-event-detail-rsvp-selected');
      }
    }

    // ── 4. 歯車メニュー (マイメニュー)
    console.log('5. マイメニュー');
    await page.goto(`${BASE}/events`, { waitUntil: 'networkidle0' });
    await sleep(400);
    const gear = await page.$('.user-menu-btn');
    if (gear) {
      await gear.click();
      await sleep(400);
      await shot(page, '05-user-menu');
    }

    // ── 5. 管理者モードに切替
    console.log('6. 管理者モードに切替');
    await clickByText(page, '管理者モードに切替');
    await sleep(800);
    await shot(page, '06-events-admin-mode');

    // ── 6. 管理者モードのイベント詳細
    console.log('7. イベント詳細 (管理者ビュー)');
    const eventLink2 = await page.$('.event-list a.event-card');
    if (eventLink2) {
      await eventLink2.click();
      await sleep(1500); // breakdown 取得待ち
      await shot(page, '07-event-detail-admin');

      // スクロールして breakdown / 参加者を見せる
      await page.evaluate(() => window.scrollBy(0, 500));
      await sleep(400);
      await shot(page, '08-event-detail-breakdown');

      await page.evaluate(() => window.scrollBy(0, 600));
      await sleep(400);
      await shot(page, '09-event-detail-attendees');
    }

    // ── 7. イベント作成画面
    console.log('10. イベント作成');
    await page.goto(`${BASE}/events`, { waitUntil: 'networkidle0' });
    await sleep(400);
    // + 新規作成 ボタンを探す
    const createLink = await page.$('a[href="/events/new"]');
    if (createLink) {
      await createLink.click();
      await sleep(800);
      await shot(page, '10-event-create-top');
      await page.evaluate(() => window.scrollBy(0, 500));
      await sleep(300);
      await shot(page, '11-event-create-attendees');
    }

    // ── 8. ユーザー管理
    console.log('12. ユーザー管理');
    await page.goto(`${BASE}/admin/users`, { waitUntil: 'networkidle0' });
    await sleep(800);
    await shot(page, '12-admin-users');

    // ユーザー編集モーダル
    const userRow = await page.$('.user-row');
    if (userRow) {
      await userRow.click();
      await sleep(500);
      await shot(page, '13-user-edit-modal');
      // close
      const close = await page.$('.modal-close');
      if (close) await close.click();
      await sleep(300);
    }

    // 設定モーダル
    console.log('14. 設定モーダル');
    const adminGear = await page.$('button.gear-btn');
    if (adminGear) {
      await adminGear.click();
      await sleep(400);
      await shot(page, '14-admin-settings-menu');

      // 委員会・役職マスター
      await clickByText(page, '委員会・役職マスター');
      await sleep(400);
      await shot(page, '15-masters-modal');
      // close
      const close2 = await page.$('.modal-close');
      if (close2) await close2.click();
      await sleep(300);
    }

    console.log('\n完了。保存先:', OUT_DIR);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
