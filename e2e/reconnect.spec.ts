import {test,expect} from './fixtures.ts';
import {startMatch,place,snapshot} from './helpers.ts';
import { commandSchema, serverMessageSchema } from '../src/protocol/messages.ts';
test('네트워크 단절 후 페이지 재진입으로 같은 경기와 자원을 복구한다',async({page,browser})=>{
 const {white,whiteContext}=await startMatch(page,browser);try{
 await place(page,0,'black');await place(white,360,'white');
 await page.getByRole('button',{name:'군사 배치',exact:true}).click();
 await page.locator('[data-cell="2"]').click();
 await expect(page.getByRole('button',{name:'착수 확정',exact:true})).toBeEnabled();
 const before=await snapshot(page);
 await page.context().setOffline(true);
 await page.goto('about:blank');
 await expect.poll(async()=> (await snapshot(white)).status,{timeout:15000}).toBe('paused');
 await page.context().setOffline(false);await page.goto(white.url());
 await expect(page.getByText('흑의 차례',{exact:true})).toBeVisible();
 const after=await snapshot(page);
 expect(after.you).toBe('black');expect(after.game).toEqual(before.game);
 expect(after.disconnectRemainingMs.black).toBeLessThan(180000);
 expect(after.clockRemainingMs?.black).toBeGreaterThan(0);
 expect(after.clockRemainingMs?.black).toBeLessThanOrEqual(before.clockRemainingMs!.black);
 expect(after.clockRemainingMs?.white).toBe(before.clockRemainingMs?.white);
 await expect(page.getByRole('button',{name:'착수 확정',exact:true})).toBeDisabled();
 }finally{await page.context().setOffline(false);await whiteContext.close();}
});
test('같은 세션의 새 탭이 연결을 교체해도 이전 탭이 재탈환하지 않는다',async({page,browser})=>{
 const {white,whiteContext}=await startMatch(page,browser);try{const replacement=await page.context().newPage();await replacement.goto(page.url());await expect(replacement.getByText('흑의 차례',{exact:true})).toBeVisible();await expect(page.locator('.connection-banner.replaced')).toBeVisible();await place(replacement,0,'black');await expect.poll(async()=> (await snapshot(white)).game?.board[0]?.color).toBe('black');expect((await snapshot(white)).players.black?.connected).toBe(true);await replacement.close();
 }finally{await whiteContext.close();}
});

test('ACK 유실 뒤 같은 요청 ID를 재전송하고 식량을 한 번만 반영한다', async ({ page, browser }) => {
  const sentIds: string[] = [];
  let dropped = false;
  await page.routeWebSocket('**/socket', client => {
    const server = client.connectToServer();
    client.onMessage(raw => {
      const parsed = commandSchema.safeParse(JSON.parse(String(raw)));
      if (parsed.success && parsed.data.type === 'action' && parsed.data.action.type === 'placeSoldier' && parsed.data.action.at === 0) sentIds.push(parsed.data.commandId);
      server.send(raw);
    });
    server.onMessage(async raw => {
      const message = serverMessageSchema.parse(JSON.parse(String(raw)));
      if (!dropped && message.type === 'ack' && sentIds.includes(message.commandId)) {
        dropped = true;
        await client.close({ code: 1012, reason: 'ACK_LOST' });
        await server.close({ code: 1012, reason: 'ACK_LOST' });
        return;
      }
      client.send(raw);
    });
  });
  const { white, whiteContext } = await startMatch(page, browser);
  try {
    await place(page, 0, 'black');
    await expect.poll(() => sentIds.length >= 2).toBe(true);
    expect(new Set(sentIds).size).toBe(1);
    const state = await snapshot(page);
    expect(state.game?.players.black).toMatchObject({ food: 1, soldiersInReserve: 19 });
    await place(white, 360, 'white');
    await place(page, 1, 'black');
    expect((await snapshot(page)).game?.players.black.food).toBe(2);
  } finally { await whiteContext.close(); }
});
