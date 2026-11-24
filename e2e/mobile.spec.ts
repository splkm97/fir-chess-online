import {test,expect} from './fixtures.ts';
import {startMatch,snapshot} from './helpers.ts';
test('확대·이동·키보드 선택 후 명시적으로 착수를 확정한다',async({page,browser},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const {whiteContext}=await startMatch(page,browser);try{
 for(const width of [360,390,768]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'군사 배치',exact:true}).click();
 await page.getByRole('button',{name:'확대',exact:true}).click();
 await page.locator('[data-cell="360"]').click();
 expect((await snapshot(page)).game?.board[360]).toBeNull();
 await page.getByRole('button',{name:'선택 취소',exact:true}).click();
 await page.getByRole('button',{name:'군사 배치',exact:true}).click();
 await page.locator('[data-cell="0"]').focus();
 await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 expect((await snapshot(page)).game?.board[1]).toBeNull();
 await page.getByRole('button',{name:'착수 확정',exact:true}).click();
 await expect.poll(async()=> (await snapshot(page)).game?.board[1]?.color).toBe('black');
 await page.getByRole('button',{name:'전체 보기',exact:true}).click();
 await page.screenshot({path:testInfo.outputPath('mobile-board.png'),fullPage:true});
 expect(errors).toEqual([]);
 }finally{await whiteContext.close();}
});

test('터치 스와이프가 보드만 이동시키고 착수 초안을 만들지 않는다', async ({ page, browser, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium' || !testInfo.project.use.isMobile, 'Native touch gesture is exercised by the mobile Chromium project.');
  const { whiteContext } = await startMatch(page, browser);
  try {
    await page.getByRole('button', { name: '군사 배치', exact: true }).click();
    await page.getByRole('button', { name: '확대', exact: true }).click();
    const board = page.getByTestId('board');
    await board.scrollIntoViewIfNeeded();
    const bounds = await board.boundingBox();
    if (!bounds) throw new Error('Board not visible');
    const before = await board.evaluate(element => element.scrollTop);
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.round(bounds.x + Math.min(bounds.width / 2, 180)),
        y: Math.round(Math.min(bounds.y + bounds.height * 0.75, 650)),
        yDistance: -180, gestureSourceType: 'touch',
      });
    } finally { await cdp.detach(); }
    await expect.poll(() => board.evaluate(element => element.scrollTop)).toBeGreaterThan(before);
    await expect(page.getByRole('button', { name: '착수 확정', exact: true })).toBeDisabled();
    expect((await snapshot(page)).game?.board.every(cell => cell === null)).toBe(true);
  } finally { await whiteContext.close(); }
});
