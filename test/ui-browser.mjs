import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const port=process.env.ONHOLD_UI_TEST_PORT||'21432',base=`http://127.0.0.1:${port}/ui.html`;
const child=spawn(process.execPath,[path.resolve('app/node_modules/vite/bin/vite.js'),'preview','--host','127.0.0.1','--port',port,'--strictPort'],{cwd:path.resolve('app'),stdio:['ignore','pipe','pipe']});
child.stderr.on('data',chunk=>process.stderr.write(chunk));
let browser;
try{
  for(let index=0;;index++){
    if(child.exitCode!==null)throw Error('Preview server exited');
    try{if((await fetch(base)).ok)break;}catch{}
    if(index>100)throw Error('Preview server did not start');
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  browser=await chromium.launch({headless:true,channel:'chromium'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);assert.equal(await page.getByRole('main').count(),1,'one main landmark per page');
  const navigate=async(id,title)=>{await page.goto(base+'#'+id);await page.getByRole('heading',{name:title,exact:true}).waitFor();};
  fs.mkdirSync('app/screenshots',{recursive:true});
  for(const theme of ['light','dark']){
    if(theme==='dark')await page.getByRole('button',{name:'切换为深色'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),theme==='dark');
    const pairs=await page.evaluate(()=>{
      const ctx=document.createElement('canvas').getContext('2d'),style=getComputedStyle(document.documentElement);
      const luminance=token=>{
        const color=style.getPropertyValue('--'+token).trim();
        if(!CSS.supports('color',color))throw Error('Invalid color: '+token);
        ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);
        const data=ctx.getImageData(0,0,1,1).data;
        if(data[3]!==255)throw Error('Contrast pairs require opaque surfaces: '+token);
        const rgb=[...data].slice(0,3).map(value=>{const s=value/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});
        return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      };
      return [['foreground','background'],['card-foreground','card'],['muted-foreground','background'],['muted-foreground','muted'],['primary-foreground','primary'],['destructive-foreground','destructive'],['success','success-surface'],['warning','warning-surface'],['info','info-surface'],['destructive','danger-surface']].map(([fg,bg])=>{const a=luminance(fg),b=luminance(bg);return {fg,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
    });
    for(const pair of pairs)assert.ok(pair.ratio>=4.5,`${theme}: ${pair.fg}/${pair.bg} = ${pair.ratio}`);
    await page.screenshot({path:`app/screenshots/onhold-ui-${theme}.png`,fullPage:true,animations:'disabled'});
  }
  await page.getByRole('button',{name:'切换为浅色'}).click();
  for(const [size,value] of [['sm','6px'],['md','8px'],['lg','10px'],['xl','14px']])assert.equal(await page.locator('[data-radius-example='+size+']').evaluate(node=>getComputedStyle(node).borderTopLeftRadius),value,'radius specimen matches its token');
  await navigate('components','基础组件');
  await page.getByRole('button',{name:'主操作',exact:true}).click();
  await page.getByRole('status').filter({hasText:'已点击主操作'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'处理中',exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'处理中',exact:true}).getAttribute('aria-busy'),'true');
  assert.equal(await page.getByLabel('账号链接',{exact:true}).getAttribute('aria-invalid'),'true');
  const input=page.getByLabel('账号名称',{exact:true});
  const before=await input.evaluate(node=>getComputedStyle(node).boxShadow);await input.focus();
  assert.notEqual(await input.evaluate(node=>getComputedStyle(node).boxShadow),before,'keyboard focus must have a visible ring');
  await page.getByLabel('自动采集（示例）',{exact:true}).click();assert.equal(await page.getByRole('checkbox').isChecked(),false);
  await page.getByRole('combobox',{name:'采集频率'}).click();await page.getByRole('option',{name:'每 15 分钟',exact:true}).click();
  assert.match(await page.getByRole('combobox',{name:'采集频率'}).innerText(),/15/);
  await page.getByRole('tab',{name:'概览',exact:true}).focus();await page.keyboard.press('ArrowRight');
  await page.getByText('已选择详情。',{exact:true}).waitFor();
  await navigate('skeleton','骨架屏');assert.ok(await page.locator('[data-slot=skeleton]').count()>20);await page.screenshot({path:'app/screenshots/onhold-ui-skeleton.png',fullPage:true,animations:'disabled'});await page.getByRole('button',{name:'查看完成态',exact:true}).click();assert.equal(await page.locator('[data-slot=skeleton]').count(),0);await page.getByText('卡片内容已加载。',{exact:true}).waitFor();await page.getByRole('button',{name:'返回骨架屏',exact:true}).click();
  await navigate('patterns','组合组件');
  await page.getByText('≈5,600',{exact:true}).waitFor();await page.getByText('0',{exact:true}).waitFor();await page.getByText('—',{exact:true}).waitFor();
  for(const state of ['未连接','已连接','采集中','需要登录','采集失败'])assert.equal(await page.getByText(state,{exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'添加示例内容',exact:true}).click();await page.getByRole('status').filter({hasText:'已添加一条示例内容'}).waitFor();
  await page.getByRole('button',{name:'重置示例',exact:true}).click();await page.getByRole('heading',{name:'暂无内容',exact:true}).waitFor();
  await page.screenshot({path:'app/screenshots/onhold-ui-patterns.png',fullPage:true,animations:'disabled'});
  await navigate('data','数据展示');
  await page.getByRole('combobox',{name:'示例表格排序'}).click();await page.getByRole('option',{name:'数量排序',exact:true}).click();
  const table=page.getByRole('table',{name:'OnHold 示例账号'});
  assert.match(await table.getByRole('row').nth(1).innerText(),/示例账号 B/);
  await page.getByRole('checkbox',{name:'选择示例账号 B'}).click();assert.equal(await table.getByRole('row').nth(1).getAttribute('data-state'),'selected');
  const trigger=page.getByRole('button',{name:'查看示例账号 B',exact:true});await trigger.click();
  await page.getByRole('dialog',{name:'示例账号 B',exact:true}).waitFor();await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(node=>node===document.activeElement),true,'Escape returns focus to the original row action');
  await page.getByRole('link',{name:'跳到内容'}).focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#catalog-content').evaluate(node=>node===document.activeElement),true);await page.getByRole('heading',{name:'数据展示',exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'搜索示例账号'}).fill('账号 A');assert.equal(await table.getByRole('row').count(),2);
  await page.getByRole('searchbox',{name:'搜索示例账号'}).fill('不存在');await page.getByRole('heading',{name:'没有匹配的账号',exact:true}).waitFor();
  await page.getByRole('searchbox',{name:'搜索示例账号'}).fill('');
  await page.screenshot({path:'app/screenshots/onhold-ui-data.png',fullPage:true,animations:'disabled'});
  await navigate('layout','布局与交互');
  for(const title of ['连接账号','设置完成']){await page.getByRole('button',{name:'下一步',exact:true}).click();await page.getByText(title,{exact:true}).waitFor();}
  await page.getByRole('button',{name:'重新演示',exact:true}).click();await page.getByText('安装助手',{exact:true}).waitFor();
  for(const [width,height] of [[375,812],[768,900],[1024,900],[1440,1000],[812,375]]){
    await page.setViewportSize({width,height});
    for(const [id,title] of [['foundations','基础规范'],['components','基础组件'],['skeleton','骨架屏'],['patterns','组合组件'],['data','数据展示'],['layout','布局与交互']]){
      await navigate(id,title);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${id} overflow at ${width}×${height}`);
    }
  }
  await page.setViewportSize({width:375,height:812});await navigate('foundations','基础规范');
  await page.getByRole('button',{name:'切换侧栏',exact:true}).click();await page.getByRole('dialog').waitFor();
  await page.getByRole('link',{name:'基础组件',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  assert.ok(await page.getByRole('button',{name:'主操作',exact:true}).evaluate(node=>node.getBoundingClientRect().height)>=44,'mobile control hit area is at least 44px');
  await navigate('data','数据展示');assert.ok(await page.getByRole('button',{name:'查看示例账号 B',exact:true}).evaluate(node=>node.getBoundingClientRect().height)>=44,'Radix asChild preserves the button touch area');await navigate('components','基础组件');
  const checkbox=page.getByRole('checkbox');await checkbox.scrollIntoViewIfNeeded();const checked=await checkbox.isChecked(),box=await checkbox.boundingBox();await page.mouse.click(box.x-5,box.y+box.height/2);assert.equal(await checkbox.isChecked(),!checked,'checkbox touch area extends beyond its visual box');
  await page.emulateMedia({reducedMotion:'reduce'});await navigate('skeleton','骨架屏');
  assert.equal(await page.getByLabel('卡片骨架示例').locator('[data-slot=skeleton]').first().evaluate(node=>getComputedStyle(node).animationName),'none');
  await page.screenshot({path:'app/screenshots/onhold-ui-mobile.png',fullPage:true,animations:'disabled'});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  for(const [id,title] of [['foundations','基础规范'],['components','基础组件'],['skeleton','骨架屏'],['patterns','组合组件'],['data','数据展示'],['layout','布局与交互']]){await navigate(id,title);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`200% text overflow in ${id}`);}
  assert.deepEqual(errors,[]);
  console.log('Passed: OnHold UI light/dark contrast, focus, component states, missing/zero/approximate values, table search/sort/selection, Sheet focus return, step flow, mobile navigation and touch targets, five viewport sizes, reduced motion and 200% text.');
}finally{
  if(browser)await browser.close();
  if(child.exitCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}
}
