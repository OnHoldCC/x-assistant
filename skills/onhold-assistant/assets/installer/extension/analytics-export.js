// Runs only in the extension's temporary Analytics reader; the CSV never reaches Downloads.
export async function captureAnalyticsCsv() {
  if (location.protocol !== 'https:' || !['x.com','twitter.com'].includes(location.hostname) || location.pathname !== '/i/account_analytics') throw Error('不是 X 官方分析页');
  const button=[...document.querySelectorAll('button,[role="button"]')].find(node=>/^(Download CSV|下载 CSV|导出 CSV)$/i.test((node.getAttribute('aria-label')||node.innerText||'').trim()));
  if(!button)throw Error('未找到 X 官方 CSV 导出入口');
  const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,dispatch=HTMLAnchorElement.prototype.dispatchEvent;
  let blob,resolveExport,rejectExport;
  const exported=new Promise((resolve,reject)=>{resolveExport=resolve;rejectExport=reject;});
  const timeout=setTimeout(()=>rejectExport(Error('X 官方 CSV 导出超时')),8000);
  try{
    URL.createObjectURL=function(value){if(value instanceof Blob&&/csv/i.test(value.type))blob=value;return create.call(this,value);};
    HTMLAnchorElement.prototype.click=function(){
      if(/\.csv$/i.test(this.download)&&/^(blob:|data:text\/csv)/i.test(this.href)){
        (blob?blob.text():fetch(this.href).then(response=>response.text())).then(resolveExport,rejectExport);return;
      }
      return click.call(this);
    };
    HTMLAnchorElement.prototype.dispatchEvent=function(event){
      if(event.type==='click'&&/\.csv$/i.test(this.download)&&/^(blob:|data:text\/csv)/i.test(this.href)){
        (blob?blob.text():fetch(this.href).then(response=>response.text())).then(resolveExport,rejectExport);return true;
      }
      return dispatch.call(this,event);
    };
    button.click();
    const text=await exported;if(typeof text!=='string'||text.length>1000000)throw Error('X 官方 CSV 格式或大小无效');return text;
  }finally{clearTimeout(timeout);URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;HTMLAnchorElement.prototype.dispatchEvent=dispatch;}
}

export function parseAnalyticsCsv(text){
  if(typeof text!=='string'||text.length>1000000)throw Error('分析 CSV 无效');
  text=text.replace(/^\uFEFF/,'');
  const rows=[];let row=[],field='',quoted=false;
  for(let index=0;index<=text.length;index++){
    const ch=text[index];
    if(ch==='"'){if(quoted&&text[index+1]==='"'){field+='"';index++;}else if(!quoted&&field||quoted&&text[index+1]&&!['\r','\n',','].includes(text[index+1]))throw Error('分析 CSV 引号无效');else quoted=!quoted;}
    else if((ch===','||ch==='\n'||ch===undefined)&&!quoted){row.push(field.replace(/\r$/,''));field='';if(ch!==','){if(row.some(Boolean))rows.push(row);row=[];if(rows.length>400)throw Error('分析 CSV 时间点过多');}}
    else if(ch!==undefined)field+=ch;
  }
  if(quoted||rows.length<2)throw Error('分析 CSV 缺少时间序列');
  const header=rows.shift().map(value=>value.replace(/^\uFEFF/,'').trim().toLowerCase());
  if(new Set(header).size!==header.length||header.length>40||!header.includes('date'))throw Error('分析 CSV 表头无效');
  const names={impressions:'impressions',likes:'likes',engagements:'engagements',bookmarks:'bookmarks',shares:'shares','new follows':'new_follows',unfollows:'unfollows',replies:'replies',reposts:'reposts','profile visits':'profile_visits','create post':'posts','video views':'video_views','media views':'media_views'};
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  const dates=new Set(),series=rows.map(row=>{
    if(row.length!==header.length)throw Error('分析 CSV 列数不一致');
    const raw=row[header.indexOf('date')].trim(),match=raw.match(/^(?:[A-Za-z]{3},\s*)?([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})$/);
    const date=/^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:match&&months[match[1].toLowerCase()]?`${match[3]}-${String(months[match[1].toLowerCase()]).padStart(2,'0')}-${match[2].padStart(2,'0')}`:null;
    if(!date||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||dates.has(date))throw Error('分析 CSV 日期无效');dates.add(date);
    const metrics={};header.forEach((key,index)=>{const name=names[key];if(!name)return;const raw=row[index].trim();if(!raw){metrics[name]=null;return;}if(!/^\d+(?:\.0+)?$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>1e15)throw Error('分析 CSV 数值无效');metrics[name]=Number(raw);});
    if(metrics.new_follows!=null&&metrics.unfollows!=null)metrics.net_follows=metrics.new_follows-metrics.unfollows;
    metrics.engagement_rate=metrics.impressions>0&&metrics.engagements!=null?metrics.engagements/metrics.impressions*100:null;
    return {date,metrics};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if(!series.some(point=>point.metrics.impressions!=null))throw Error('分析 CSV 缺少曝光指标');
  return series;
}
