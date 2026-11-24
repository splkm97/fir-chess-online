import { test, expect } from './fixtures.ts';
import { startMatch, place, snapshot } from './helpers.ts';
import type { Page } from '@playwright/test';
import { commandSchema, serverMessageSchema } from '../src/protocol/messages.ts';

async function assertViewportFit(page: Page) {
  const geometry = await page.evaluate(() => {
    const bounds = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing visible layout region: ${selector}`);
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const scroll = document.querySelector('[data-testid="board"]');
    if (!(scroll instanceof HTMLElement)) throw new Error('Board scroll region missing');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      pageWidth: document.documentElement.scrollWidth,
      pageHeight: document.documentElement.scrollHeight,
      resources: bounds('.cockpit-resources'), board: bounds('.game-board'), command: bounds('.cockpit-command'),
      confirm: bounds('.confirm-buttons button.primary'),
      tray: Array.from(document.querySelectorAll('.piece-options button'), element => {
        const box = element.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      }),
      scroll: { width: scroll.clientWidth, height: scroll.clientHeight, scrollWidth: scroll.scrollWidth, scrollHeight: scroll.scrollHeight },
    };
  });
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.pageHeight).toBeLessThanOrEqual(geometry.viewport.height + 1);
  for (const region of [geometry.resources, geometry.board, geometry.command, geometry.confirm, ...geometry.tray]) {
    expect(region.left).toBeGreaterThanOrEqual(0);
    expect(region.top).toBeGreaterThanOrEqual(0);
    expect(region.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
    expect(region.bottom).toBeLessThanOrEqual(geometry.viewport.height + 1);
  }
  expect(geometry.resources.right).toBeLessThanOrEqual(geometry.board.left);
  expect(geometry.board.right).toBeLessThanOrEqual(geometry.command.left);
  expect(Math.abs(geometry.board.width - geometry.board.height)).toBeLessThanOrEqual(1);
  expect(geometry.board.width).toBeGreaterThan(420);
  expect(geometry.scroll.scrollWidth).toBeLessThanOrEqual(geometry.scroll.width + 1);
  expect(geometry.scroll.scrollHeight).toBeLessThanOrEqual(geometry.scroll.height + 1);
}

test('PC 전체 보기에서 판 전체·자원·확정이 창 안에 들어온다', async ({ page, browser }, testInfo) => {
  test.skip(Boolean(testInfo.project.use.isMobile), 'Desktop viewport contract');
  const fontRequests: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'font') fontRequests.push(request.url()); });
  const { whiteContext } = await startMatch(page, browser);
  try {
    await page.evaluate(() => document.fonts.ready);
    for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width: width!, height: height! });
      await assertViewportFit(page);
    }
    expect(await page.evaluate(() => [...document.fonts].some(font => font.family.includes('IBM Plex Sans KR') && font.status === 'loaded'))).toBe(true);
    expect(fontRequests.length).toBeGreaterThan(0);
    expect(fontRequests.every(url => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
    await page.setViewportSize({ width: 1366, height: 768 });
    await place(page, 360, 'black');
    expect((await snapshot(page)).game?.board[360]).toEqual({ color: 'black', kind: 'soldier' });
    await expect(page.getByText('백의 차례', { exact: true })).toBeVisible();
    await expect(page.locator('.pending-summary')).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('cockpit-desktop.png'), fullPage: true });
  } finally { await whiteContext.close(); }
});

test('장목 구간을 선택해도 확정 버튼의 위치와 판 전체 보기가 유지된다', async ({ page, browser }, testInfo) => {
  test.skip(Boolean(testInfo.project.use.isMobile), 'Desktop confirmation anchor contract');
  await page.setViewportSize({ width: 1366, height: 768 });
  const { white, whiteContext } = await startMatch(page, browser);
  try {
    const cells = [0, 1, 2, 4, 5];
    for (let index = 0; index < cells.length; index++) {
      await place(page, cells[index]!, 'black');
      await place(white, 360 - index * 2, 'white');
    }
    const confirm = page.getByRole('button', { name: '착수 확정', exact: true });
    const before = await confirm.boundingBox();
    if (!before) throw new Error('Confirmation is not visible');
    await page.getByRole('button', { name: '군사 배치', exact: true }).click();
    await page.locator('[data-cell="3"]').click();
    await expect(page.getByTestId('line-picker')).toBeVisible();
    await assertViewportFit(page);
    const during = await confirm.boundingBox();
    if (!during) throw new Error('Confirmation disappeared during line selection');
    expect(Math.abs(before.y - during.y)).toBeLessThanOrEqual(2);
    await page.locator('[data-line-key="1:1:0"]').click();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect.poll(async () => (await snapshot(page)).game?.completedLines.black[0]?.cells).toEqual([1, 2, 3, 4, 5]);
    for (const cell of [1, 2, 3, 4, 5]) await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute('aria-label', /보호됨/);
  } finally { await whiteContext.close(); }
});

test('서버 응답 대기 중에도 보드와 확정 버튼이 움직이지 않는다', async ({ page, browser }, testInfo) => {
  test.skip(Boolean(testInfo.project.use.isMobile), 'Desktop pending-state geometry contract');
  const acknowledged = Promise.withResolvers<void>();
  let holding = false;
  let actionId: string | null = null;
  const relay: { release?: () => void } = {};
  await page.routeWebSocket('**/socket', client => {
    const server = client.connectToServer();
    const buffered: (string | Buffer)[] = [];
    relay.release = () => { holding = false; for (const message of buffered.splice(0)) client.send(message); };
    client.onMessage(raw => {
      const command = commandSchema.parse(JSON.parse(String(raw)));
      if (command.type === 'action') { holding = true; actionId = command.commandId; }
      server.send(raw);
    });
    server.onMessage(raw => {
      if (holding) {
        buffered.push(raw);
        const message = serverMessageSchema.parse(JSON.parse(String(raw)));
        if (message.type === 'ack' && message.commandId === actionId) acknowledged.resolve();
      } else client.send(raw);
    });
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  const { whiteContext } = await startMatch(page, browser);
  try {
    await page.evaluate(() => document.fonts.ready);
    const board = page.locator('.game-board');
    const confirm = page.getByRole('button', { name: '착수 확정', exact: true });
    await page.getByRole('button', { name: '군사 배치', exact: true }).click();
    await page.locator('[data-cell="0"]').click();
    const beforeBoard = await board.boundingBox(), beforeConfirm = await confirm.boundingBox();
    if (!beforeBoard || !beforeConfirm) throw new Error('Game controls missing');
    await confirm.click();
    await acknowledged.promise;
    await expect(page.locator('.pending-summary')).toBeVisible();
    await assertViewportFit(page);
    const pendingBoard = await board.boundingBox(), pendingConfirm = await confirm.boundingBox();
    if (!pendingBoard || !pendingConfirm) throw new Error('Game controls disappeared');
    expect(Math.abs(pendingBoard.y - beforeBoard.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(pendingBoard.height - beforeBoard.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(pendingConfirm.y - beforeConfirm.y)).toBeLessThanOrEqual(1);
    if (!relay.release) throw new Error('WebSocket relay not established');
    relay.release();
    await expect(page.getByText('백의 차례', { exact: true })).toBeVisible();
    await expect(page.locator('.pending-summary')).not.toBeVisible();
  } finally { relay.release?.(); await whiteContext.close(); }
});

test('경기가 시작된 뒤에도 준비 요청을 같은 ID로 다시 확인할 수 있다', async ({ page, browser }) => {
  const readyIds: string[] = [];
  let dropped = false;
  await page.routeWebSocket('**/socket', client => {
    const server = client.connectToServer();
    client.onMessage(raw => {
      const command = commandSchema.parse(JSON.parse(String(raw)));
      if (command.type === 'ready') readyIds.push(command.commandId);
      server.send(raw);
    });
    server.onMessage(raw => {
      const message = serverMessageSchema.parse(JSON.parse(String(raw)));
      if (!dropped && message.type === 'ack' && readyIds.includes(message.commandId)) { dropped = true; return; }
      client.send(raw);
    });
  });
  const { whiteContext } = await startMatch(page, browser);
  try {
    await expect(page.getByRole('button', { name: '군사 배치', exact: true })).toBeDisabled();
    const retry = page.locator('.cockpit-command').getByRole('button', { name: '같은 요청 다시 확인', exact: true });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.locator('.pending-summary')).not.toBeVisible();
    expect(readyIds.length).toBeGreaterThanOrEqual(2);
    expect(new Set(readyIds).size).toBe(1);
    await place(page, 0, 'black');
    expect((await snapshot(page)).game?.players.black.food).toBe(1);
  } finally { await whiteContext.close(); }
});
