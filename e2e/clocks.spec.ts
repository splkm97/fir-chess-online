import { test, expect } from './fixtures.ts';
import { login, place, snapshot } from './helpers.ts';

test('커스텀 분·초·증가 설정을 두 참가자가 공유하고 확정 착수에 증가 시간을 더한다', async ({ page, browser }) => {
  await page.goto('/');
  await login(page, '커스텀 흑');
  await page.getByLabel('기본 분', { exact: true }).fill('1');
  await page.getByLabel('기본 초', { exact: true }).fill('5');
  await page.getByLabel('수당 증가 초', { exact: true }).fill('180');
  await page.getByRole('button', { name: '방 만들기', exact: true }).click();
  await expect(page).toHaveURL(/\/room\/[0-9A-Z]{12}$/);
  const whiteContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const white = await whiteContext.newPage();
    await white.goto(page.url());
    await login(white, '커스텀 백');
    await expect.poll(async () => (await snapshot(page)).players.white?.connected).toBe(true);
    for (const player of [page, white]) {
      const waiting = await snapshot(player);
      expect(waiting.timeControl).toEqual({ kind: 'fischer', baseMs: 65000, incrementMs: 180000 });
      expect(waiting.clockRemainingMs).toEqual({ black: 65000, white: 65000 });
      await expect(player.getByText(/19 × 19 · 피셔 1:05 \+ 180초/)).toBeVisible();
    }
    await page.getByRole('button', { name: '준비 완료', exact: true }).click();
    await expect.poll(async () => (await snapshot(white)).players.black?.ready).toBe(true);
    await white.getByRole('button', { name: '준비 완료', exact: true }).click();
    await place(page, 0, 'black');
    const first = await snapshot(page);
    expect(first.clockRemainingMs?.black).toBeGreaterThan(180000);
    expect(first.clockRemainingMs?.black).toBeLessThanOrEqual(245000);
    await place(white, 360, 'white');
    await expect(page.getByRole('timer', { name: '흑 남은 시간', exact: true })).toHaveText(/^\d+:\d{2}$/);
    await expect(page.getByRole('timer', { name: '백 남은 시간', exact: true })).toHaveText(/^\d+:\d{2}$/);
    const second = await snapshot(white);
    expect(second.clockRemainingMs?.white).toBeGreaterThan(180000);
    expect(second.clockRemainingMs?.white).toBeLessThanOrEqual(245000);
    expect(second.moveCount).toBe(2);
    await page.reload();
    await expect(page.getByText('흑의 차례', { exact: true })).toBeVisible();
    const reloaded = await snapshot(page);
    expect(reloaded.timeControl).toEqual(first.timeControl);
    expect(reloaded.clockRemainingMs?.white).toBe(second.clockRemainingMs?.white);
    await expect(page.locator('[data-cell="360"]')).toHaveAttribute('aria-label', /마지막 확정 착수/);
  } finally { await whiteContext.close(); }
});
