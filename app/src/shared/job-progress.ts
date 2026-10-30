import type { Job } from "./types";
export function jobProgress(job:Job):{value:number|null;max:number;text:string}{
  if(job.action==='capture_for_you'||job.action==='capture_notifications'){
    const batch=job.result?.reply_progress,source=job.action==='capture_notifications'?'通知':'For You';
    if(batch&&job.state==='completed'){
      const summary=job.input?.capture_summary;
      const reasons=summary?([['ads','广告'],['truncated','未展开'],['source','来源缺失'],['text','正文不可用'],['own','自己的帖子'],['language','非英文原文'],['translated','已翻译内容']] as const).filter(([key])=>summary.filtered[key]>0).map(([key,label])=>`${label} ${summary.filtered[key]}`).join('，'):'';
      const empty=summary?`已读取 ${summary.scanned} 条 · 可用候选 ${summary.eligible} 条${reasons?` · 过滤：${reasons}`:''} · 未创建评论任务`:'本轮没有新的可回复帖子';
      return {value:batch.completed+batch.failed,max:batch.total||1,text:batch.total?`本轮 ${batch.completed+batch.failed}/${batch.total} · 已回复 ${batch.completed} · 失败 ${batch.failed}`:empty};
    }
    return {value:job.state==='running'?null:0,max:1,text:job.state==='failed'?`${source} 采集失败，查看错误详情`:job.state==='running'?`正在读取${source}并创建逐帖回复任务`:`等待读取${source}`};
  }
  if(job.action==='follow_back'||job.action==='unfollow'){
    const completed=new Set(job.result?.completed||[]),skipped=new Set((job.result?.skipped||[]).filter(target=>!completed.has(target)));
    const limit=job.input?.limit,targets=job.input?.targets;
    const total=limit&&Number.isInteger(limit)&&limit>0?(targets?Math.min(limit,new Set(targets).size):limit):null;
    const count=completed.size+skipped.size;
    const summary=`成功 ${completed.size} · 跳过 ${skipped.size}`;
    const ended=job.state==='failed'?'已停止':job.state==='completed'?'本轮结束':job.state==='queued'?'等待执行':'执行中';
    return {value:total==null?(job.state==='running'?null:0):Math.min(count,total),max:total||1,text:total==null?`${ended} · ${summary}（目标总数未知）`:`${ended} · 已确认 ${count}/${total} · ${summary}${job.state==='completed'&&count<total?` · 剩余 ${total-count} 未处理`:''}`};
  }
  if(job.action==='rewrite_publish'){
    const replicate=job.input?.mode==='replicate',reply=job.input?.mode==='reply',news=job.input?.mode==='news';
    if(job.state==='completed'){
      if(news&&job.input?.stage==='skipped'&&job.result?.sent===false)return {value:0,max:4,text:`本轮跳过：${job.result.skip_reason}`};
      const receipt=job.result?.url?.match(/^https:\/\/x\.com\/([a-zA-Z0-9_]{1,15})\/status\/\d+$/);
      return receipt&&receipt[1].toLowerCase()===job.account.toLowerCase()&&(!reply||job.result?.reply_to===job.input?.source?.id)?{value:4,max:4,text:reply?'4/4 · X 已确认回复到原帖':'4/4 · X 已确认发布'}:{value:3,max:4,text:'待核对发布结果'};
    }
    const ready=job.input?.stage==='ready',sending=job.input?.stage==='sending';
    if(job.state==='failed')return {value:sending?3:ready?2:0,max:4,text:sending?'发送结果待核对，不会自动重发':job.error|| (ready?'发布前已停止':'分析生成或格式校验失败，未发送')};
    if(job.state==='rewriting')return {value:null,max:4,text:news?'1/4 · Codex 联网查证新闻并生成短帖（进度未知）':reply?'1/4 · Codex 正在生成回复（进度未知）':replicate?'1/4 · Codex 分析原帖并生成正文（进度未知）':'1/4 · 正文生成中（进度未知）'};
    if(job.state==='running')return {value:3,max:4,text:sending?'3/4 · 等待 X 发布确认':'3/4 · 正在打开输入框并准备发送'};
    if(ready)return {value:2,max:4,text:reply?'2/4 · 回复已校验，等待自动发送':replicate?'2/4 · 固定格式已校验，等待自动发送':job.input?.publish_at?'2/4 · 正文已校验，等待计划时间':'2/4 · 正文已校验，待安排发布时间'};
    return {value:0,max:4,text:news?'等待 Codex 搜索新闻':reply?'等待 Codex 根据原帖生成回复':replicate?'等待 Codex 分析原帖':'等待生成正文'};
  }
  return {value:job.state==='completed'?1:job.state==='running'?null:0,max:1,text:job.state==='completed'?'数据已写入':job.state==='running'?'采集中，等待数据写入（进度未知）':job.state==='failed'?'采集已停止':'等待采集'};
}
