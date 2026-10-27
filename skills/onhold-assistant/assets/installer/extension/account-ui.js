(() => {
 const $=id=>document.getElementById(id);let busy=false;
 const number=item=>item&&Number.isFinite(item.value)?(item.approximate?'≈':'')+new Intl.NumberFormat('zh-CN',item.value>=10000?{notation:'compact',maximumFractionDigits:2}:{}).format(item.value):'—';
 function render({account,snapshot,assumptions}){
  $('x-account-name').textContent='@'+account;
  const analytics=snapshot?.analytics,metrics=analytics?.metrics||{},creator=snapshot?.creator;
  for(const key of ['impressions','engagements','profile_visits','followers','verified_followers','bookmarks'])$('x-'+key.replaceAll('_','-')).textContent=number(metrics[key]);
  $('x-engagement-rate').textContent=metrics.engagement_rate?.raw||'—';
  const rates=XAIMetrics.interactionRates(metrics);$('x-weighted-rate').textContent=rates.weighted===null?'—':(rates.approximate?'≈':'')+rates.weighted.toFixed(2)+'%';
  $('x-actions').textContent=['likes','replies','reposts'].map(key=>number(metrics[key])).join(' / ');
  const operating=XAIMetrics.operatingRates(metrics),estimated=operating.approximate?'≈':'';
  $('x-profile-visit-rate').textContent=operating.profileVisitRate===null?'—':estimated+operating.profileVisitRate.toFixed(2)+'%';
  $('x-operating-readout').textContent=operating.engagementsPer1000!==null&&operating.profileVisitsPer1000!==null?'每千次曝光带来 '+estimated+operating.engagementsPer1000.toFixed(2)+' 次互动、'+estimated+operating.profileVisitsPer1000.toFixed(2)+' 次主页访问。':'';
  for(const [name,item] of [['follower',creator?.verified_followers],['impression',creator?.verified_impressions]]){
   const progress=$('x-'+name+'-progress'),valid=Number.isFinite(item?.current?.value)&&item.current.value>=0&&Number.isFinite(item.target)&&item.target>0;
   $('x-'+name+'-progress-value').textContent=valid?number(item.current)+' / '+new Intl.NumberFormat('zh-CN').format(item.target):'—';
   progress.hidden=!valid;if(valid){progress.max=item.target;progress.value=Math.min(item.current.value,item.target);progress.title=(item.current.value/item.target*100).toFixed(2)+'%';}else progress.removeAttribute('value');
  }
  $('x-impression-progress-label').textContent=creator?.verified_impressions?.days?'近 '+creator.verified_impressions.days+' 天认证主页曝光':'认证主页曝光';
  $('x-impression-progress-note').textContent=creator?.verified_impressions?.exclude_replies?'不含回复':'';
  const outlook=XAIMetrics.creatorOutlook(creator,assumptions);
  $('creator-progress-section').hidden=outlook.graduated;$('x-creator-progress').textContent=outlook.progress===null?'—':outlook.progress.toFixed(2)+'%';
  $('x-account-kind').textContent=creator?.state==='enrolled'?'已开通':creator?.state==='eligible'?'可申请开通':outlook.graduated?'数值门槛已达标':outlook.blocked?'未开通':'资格未获取';
  $('x-earnings-title').textContent=outlook.blocked?'可获收益':'30 天预估收益';
  $('x-earnings').textContent=outlook.amount===null?'暂无法估算':new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:0,maximumFractionDigits:2}).format(outlook.amount);
  $('x-earnings-note').textContent=outlook.blocked?'按当前未达标／未开通状态估算，非历史到账；未来开通后需重新估算。':outlook.amount===null?'缺少近30天合格曝光或结算单价。':'假设已开通，按手动校准的合格曝光与结算单价估算，非官方收益。';
  $('earnings-qualified30').value=assumptions?.qualified30??'';$('earnings-rpm').value=assumptions?.rpmCny??'';
  $('x-account-period').textContent=analytics?analytics.period+(analytics.verified_only===true?' · 仅认证用户':''):'';
  $('x-account-status').textContent=snapshot?[new Date(snapshot.observed_at).toLocaleString('zh-CN'),...(snapshot.errors||[])].join(' · '):'点击刷新，一次读取本人 Analytics 和奖励资格进度。';
 }
 async function load(refresh=false){
  if(busy)return;busy=true;$('refresh-account').disabled=true;$('refresh-account').textContent=refresh?'读取中…':'刷新 X 数据';
  try{
   const response=await chrome.runtime.sendMessage({type:refresh?'REFRESH_ACCOUNT_SUMMARY':'GET_ACCOUNT_SUMMARY'});
   if(!response?.ok)throw Error(response?.error||'账号数据未获取');render(response.data);
  }catch(error){$('x-account-status').textContent=error.message;}
  finally{busy=false;$('refresh-account').disabled=false;$('refresh-account').textContent='刷新 X 数据';}
 }
 $('save-earnings').onclick=async()=>{
  const button=$('save-earnings');button.disabled=true;
  try{const count=$('earnings-qualified30'),rpm=$('earnings-rpm');if(count.value===''||rpm.value===''||!count.checkValidity()||!rpm.checkValidity())throw Error('请填写有效的合格曝光与收益单价。');const response=await chrome.runtime.sendMessage({type:'SAVE_EARNINGS_ASSUMPTIONS',data:{qualified30:Number(count.value),rpmCny:Number(rpm.value)}});if(!response?.ok)throw Error(response?.error||'未保存');render(response.data);$('earnings-status').textContent='已保存在本机，仅用于当前账号估算。';}catch(error){$('earnings-status').textContent=error.message;}finally{button.disabled=false;}
 };
 $('refresh-account').onclick=()=>load(true);load();
})();
