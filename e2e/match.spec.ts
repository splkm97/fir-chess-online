import {test,expect} from './fixtures.ts';
import {startMatch,place,snapshot} from './helpers.ts';
test('실제 두 플레이어가 두 줄을 완성하면 동일한 승패를 본다',async({page,browser})=>{
 const {white,whiteContext}=await startMatch(page,browser);try{const black=[0,1,2,3,4,20,21,22,23,24];for(let i=0;i<black.length;i++){await place(page,black[i]!, 'black');if(i<9)await place(white,399-i*2,'white');}
 await expect(page.getByText('흑 승리',{exact:true})).toBeVisible();await expect(white.getByText('흑 승리',{exact:true})).toBeVisible();const a=await snapshot(page),b=await snapshot(white);expect(a.game).toEqual(b.game);expect(a.game?.completedLines.black).toHaveLength(2);await expect(page.getByRole('button',{name:'착수 확정',exact:true})).not.toBeVisible();
 }finally{await whiteContext.close();}
});
test('식량으로 룩을 배치하고 상대 군사를 포획해 공급처로 반환한다',async({page,browser})=>{
 const {white,whiteContext}=await startMatch(page,browser);try{for(let i=0;i<3;i++){await place(page,i*2,'black');await place(white,i===0?60:399-i*2,'white');}await page.getByRole('button',{name:'룩 배치',exact:true}).click();await page.locator('[data-cell="40"]').click();await page.getByRole('button',{name:'착수 확정',exact:true}).click();await expect.poll(async()=> (await snapshot(page)).game?.board[40]?.kind).toBe('rook');await place(white,393,'white');for(let i=0;i<2;i++){await place(page,6+i*2,'black');await place(white,391-i*2,'white');}const before=await snapshot(page);await page.locator('[data-cell="40"]').click();await page.locator('[data-cell="60"]').click();await page.getByRole('button',{name:'착수 확정',exact:true}).click();await expect.poll(async()=> (await snapshot(page)).game?.board[60]?.color).toBe('black');const after=await snapshot(page);expect(after.game?.players.black.food).toBe(0);expect(after.game?.players.white.soldiersInReserve).toBe((before.game?.players.white.soldiersInReserve??0)+1);
 }finally{await whiteContext.close();}
});
test('장목에서 고른 다섯 기물만 보호한다',async({page,browser})=>{
 const {white,whiteContext}=await startMatch(page,browser);try{const cells=[0,1,2,4,5];for(let i=0;i<cells.length;i++){await place(page,cells[i]!, 'black');await place(white,399-i*2,'white');}await page.getByRole('button',{name:'군사 배치',exact:true}).click();await page.locator('[data-cell="3"]').click();await expect(page.getByTestId('line-picker')).toBeVisible();await page.locator('[data-line-key="1:1:0"]').click();await page.getByRole('button',{name:'착수 확정',exact:true}).click();await expect.poll(async()=> (await snapshot(page)).game?.completedLines.black[0]?.cells).toEqual([1,2,3,4,5]);expect((await snapshot(page)).game?.status).toBe('playing');
 for (const cell of [1,2,3,4,5]) await expect(page.locator(`[data-cell="${cell}"]`)).toHaveAttribute('aria-label', /보호됨/);
 await expect(page.locator('[data-cell="0"]')).not.toHaveAttribute('aria-label', /보호됨/);
 }finally{await whiteContext.close();}
});
