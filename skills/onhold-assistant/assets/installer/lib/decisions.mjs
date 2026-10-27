export function validateDecisionRequest(body){
 if(!body||body.model!=='multilingual'||typeof body.state!=='string'||!body.state.trim()||body.state.length>2000||!body.questions||typeof body.questions!=='object'||Array.isArray(body.questions))throw Error('无效的本地决策请求');
 const questions=Object.values(body.questions);if(!questions.length||questions.length>32)throw Error('一次支持 1–32 个决策问题');
 for(const question of questions){
  if(!question||typeof question.instructions!=='string'||!question.instructions.trim()||question.instructions.length>2000)throw Error('决策问题说明无效');
  if(question.type==='noul')continue;
  if(question.type==='choice'){
   const options=question.criteria;if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).length<2||Object.keys(options).length>32||Object.values(options).some(value=>typeof value!=='string'||!value.trim()||value.length>500))throw Error('Choice 需要 2–32 个有效选项');
  }else if(question.type==='score'){
   const levels=question.criteria;if(!Array.isArray(levels)||levels.length<2||levels.length>10||levels.some(value=>typeof value!=='string'||!value.trim()||value.length>500))throw Error('Score 需要 2–10 个有序等级');
  }else throw Error('仅支持 Choice、Score、Noul');
 }
 return {...body,max_len:1536,head_max_len:192};
}
