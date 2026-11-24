import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.ts';
import { finishMatch, startMatch } from './helpers.ts';
import { analysisInputSchema, analysisPageSchema, recordDetailSchema, recordDownloadSchema, movesPageSchema } from '../src/protocol/records.ts';
import type { AnalysisInput } from '../src/protocol/records.ts';

async function branches(page: Page, code: string) {
  const response = await page.request.get(`/api/records/${code}/analysis`);
  expect(response.ok()).toBe(true);
  return analysisPageSchema.parse(await response.json()).nodes;
}

async function branchSoldier(page: Page, cell: number) {
  await page.getByRole('button', { name: '군사 배치', exact: true }).click();
  await page.locator(`[data-cell="${cell}"]`).click();
  await page.getByRole('button', { name: '분기 수 저장', exact: true }).click();
}

test('개인 중첩 분기는 재접속 후 보존되고 상대에게 공개되지 않으며 본선을 바꾸지 않는다', async ({ page, browser }, testInfo) => {
  const { white, whiteContext } = await startMatch(page, browser);
  try {
    const final = await finishMatch(page, white);
    const beforeResponse = await page.request.get(`/api/records/${final.code}/moves`);
    expect(beforeResponse.ok()).toBe(true);
    const before = movesPageSchema.parse(await beforeResponse.json());
    await page.getByRole('link', { name: '기보 복기·브랜치 분석', exact: true }).click();
    await page.getByRole('button', { name: '처음', exact: true }).click();
    await page.getByRole('button', { name: '여기서 분기 두기', exact: true }).click();
    await branchSoldier(page, 180);
    await expect.poll(async () => (await branches(page, final.code)).length).toBe(1);
    await expect(page.getByRole('button', { name: /^분기 1(?:\s|$)/ })).toBeVisible();
    await expect(page.locator('[data-cell="180"]')).toHaveAttribute('aria-label', /흑 군사/);
    await branchSoldier(page, 181);
    await expect.poll(async () => (await branches(page, final.code)).length).toBe(2);
    const nodes = await branches(page, final.code);
    expect(nodes[0]).toMatchObject({ actor: 'black', parent: { type: 'mainline', ply: 0 }, action: { type: 'placeSoldier', at: 180 } });
    expect(nodes[1]).toMatchObject({ actor: 'white', parent: { type: 'variation', nodeId: nodes[0]!.id }, action: { type: 'placeSoldier', at: 181 } });
    await expect(page.getByRole('button', { name: /^분기 2(?:\s|$)/ })).toContainText(/분기 1/);
    await page.reload();
    await page.getByRole('button', { name: /^분기 2(?:\s|$)/ }).click();
    await expect(page.locator('[data-cell="180"]')).toHaveAttribute('aria-label', /흑 군사/);
    await expect(page.locator('[data-cell="181"]')).toHaveAttribute('aria-label', /백 군사/);
    expect(await branches(page, final.code)).toEqual(nodes);
    await page.screenshot({ path: testInfo.outputPath('private-analysis.png'), fullPage: true });
    await page.getByRole('button', { name: '군사 배치', exact: true }).click();
    await page.locator('[data-cell="182"]').click();
    await expect(page.getByRole('button', { name: '분기 수 저장', exact: true })).toBeEnabled();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: /^분기 2(?:\s|$)/ }).click();
    await expect(page.locator('.intersection.preview')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '분기 수 저장', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '본선으로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: '마지막', exact: true }).click();
    await expect(page.locator('[data-cell="180"]')).toHaveAttribute('aria-label', /빈 교차점/);
    await expect(page.locator('[data-cell="23"]')).toHaveAttribute('aria-label', /흑 군사.*보호됨/);
    await white.getByRole('link', { name: '기보 복기·브랜치 분석', exact: true }).click();
    await expect(white.getByRole('button', { name: '처음', exact: true })).toBeVisible();
    await expect(white.getByRole('button', { name: /^분기 [12](?:\s|$)/ })).toHaveCount(0);
    expect(await branches(white, final.code)).toEqual([]);
    await white.reload();
    await expect(white.getByRole('button', { name: '처음', exact: true })).toBeVisible();
    await expect(white.getByRole('button', { name: /^분기 [12](?:\s|$)/ })).toHaveCount(0);
    for (const [owner, expectedNodes] of [[page, nodes], [white, []]] as const) {
      const response = await owner.request.get(`/api/records/${final.code}/download`);
      expect(response.ok()).toBe(true);
      const download = recordDownloadSchema.parse(await response.json());
      expect(download.analysis).toEqual(expectedNodes);
      expect(download.moves).toEqual(before.moves);
      expect(download.detail.finalState).toEqual(final.game);
    }
    const afterResponse = await page.request.get(`/api/records/${final.code}/moves`);
    expect(afterResponse.ok()).toBe(true);
    expect(movesPageSchema.parse(await afterResponse.json())).toEqual(before);
    const detailResponse = await page.request.get(`/api/records/${final.code}`);
    expect(detailResponse.ok()).toBe(true);
    expect(recordDetailSchema.parse(await detailResponse.json()).finalState).toEqual(final.game);
  } finally { await whiteContext.close(); }
});

test('저장 응답 유실과 일시적 429 뒤에도 원래 ID로 분기를 한 번만 저장한다', async ({ page, browser }) => {
  const { white, whiteContext } = await startMatch(page, browser);
  try {
    const final = await finishMatch(page, white);
    await page.getByRole('link', { name: '기보 복기·브랜치 분석', exact: true }).click();
    await page.getByRole('button', { name: '처음', exact: true }).click();
    const requests: AnalysisInput[] = [];
    await page.route(`**/api/records/${final.code}/analysis/nodes`, async route => {
      requests.push(analysisInputSchema.parse(route.request().postDataJSON()));
      if (requests.length === 1) {
        const saved = await route.fetch();
        expect(saved.ok()).toBe(true);
        await route.abort('failed');
      } else if (requests.length === 2) {
        // Only the failure response is injected; initial commit and final retry use the real server.
        await route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'RATE_LIMITED' }) });
      } else await route.continue();
    });
    await page.getByRole('button', { name: '여기서 분기 두기', exact: true }).click();
    await branchSoldier(page, 180);
    await expect(page.getByRole('button', { name: '분기 저장 다시 시도', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '분기 저장 다시 시도', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('요청이 너무 많습니다.');
    await expect(page.getByRole('button', { name: '분기 저장 다시 시도', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '분기 저장 다시 시도', exact: true }).click();
    await expect(page.getByRole('button', { name: /^분기 1(?:\s|$)/ })).toBeVisible();
    expect(requests).toHaveLength(3);
    expect(requests[1]).toEqual(requests[0]);
    expect(requests[2]).toEqual(requests[0]);
    expect(await branches(page, final.code)).toHaveLength(1);
    await page.reload();
    await page.getByRole('button', { name: /^분기 1(?:\s|$)/ }).click();
    await expect(page.locator('[data-cell="180"]')).toHaveAttribute('aria-label', /흑 군사/);
    expect(await branches(white, final.code)).toEqual([]);
  } finally { await whiteContext.close(); }
});
