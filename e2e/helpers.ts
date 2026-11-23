import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { roomSchema } from '../src/protocol/messages.ts';
import type { Color } from '../src/game/types.ts';
export async function login(page: Page, nickname: string) { await page.getByLabel('닉네임', {exact:true}).fill(nickname); await page.getByRole('button', {name:'시작하기',exact:true}).click(); }
export async function snapshot(page: Page) { const code=new URL(page.url()).pathname.split('/')[2]; const response=await page.request.get('/api/rooms/'+code); expect(response.ok()).toBe(true); return roomSchema.parse(await response.json()); }
export async function startMatch(page: Page, browser: Browser) {
  await page.goto('/'); await login(page,'흑 기사'); await page.getByRole('button',{name:'방 만들기',exact:true}).click(); await expect(page).toHaveURL(/\/room\/[0-9A-Z]{12}$/);
  const whiteContext=await browser.newContext({baseURL:new URL(page.url()).origin}); const white=await whiteContext.newPage();
  await white.goto(page.url()); await login(white,'백 기사');
  await expect.poll(async()=> (await snapshot(page)).players.white?.connected).toBe(true);
  await page.getByRole('button',{name:'준비 완료',exact:true}).click();
  await expect.poll(async()=> (await snapshot(white)).players.black?.ready).toBe(true);
  await expect(page.getByRole('button',{name:'준비됨',exact:true})).toBeDisabled();
  await white.getByRole('button',{name:'준비 완료',exact:true}).click();
  await expect.poll(async()=> (await snapshot(page)).status).toBe('active');
  await expect(page.getByText('흑의 차례',{exact:true})).toBeVisible();
  return {white,whiteContext};
}
export async function place(page:Page,cell:number,color:Color) {
  await expect(page.getByText(color==='black'?'흑의 차례':'백의 차례',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'군사 배치',exact:true}).click();
  await page.locator('[data-cell="'+cell+'"]').click();
  await page.getByRole('button',{name:'착수 확정',exact:true}).click();
  await expect.poll(async()=> (await snapshot(page)).game?.board[cell]?.color).toBe(color);
}
