import {test,expect} from './fixtures.ts';
import {login,snapshot,startMatch} from './helpers.ts';
test('초대 대전은 두 세션만 입장하고 새로고침 후 자리를 유지한다',async({page,browser})=>{
 const {white,whiteContext}=await startMatch(page,browser);
 try{ const before=await snapshot(page);expect(before.you).toBe('black');expect((await snapshot(white)).you).toBe('white');await page.reload();await expect(page.getByText('흑의 차례',{exact:true})).toBeVisible();expect((await snapshot(page)).you).toBe('black');expect(page.url()).not.toContain('token');
 const thirdContext=await browser.newContext({baseURL:new URL(page.url()).origin});try{const third=await thirdContext.newPage();await third.goto(page.url());await login(third,'세 번째');await expect(third.getByRole('alert')).toContainText(/가득|두 명|참가/);}finally{await thirdContext.close();}
 }finally{await whiteContext.close();}
});
