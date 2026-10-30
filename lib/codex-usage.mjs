export function normalizeUsage(value){
 const integer=n=>Number.isSafeInteger(n)&&n>=0;
 if(!integer(value?.input_tokens)||!integer(value?.output_tokens))return null;
 const cached=value.cached_input_tokens??value.input_tokens_details?.cached_tokens??null;
 const total=value.input_tokens+value.output_tokens;
 if(!Number.isSafeInteger(total)||(cached!==null&&(!integer(cached)||cached>value.input_tokens)))return null;
 return {input_tokens:value.input_tokens,output_tokens:value.output_tokens,cached_input_tokens:cached,total_tokens:total};
}
export function codexUsage(events){
 let usage=null;
 for(const line of events.split('\n')){
  let event;try{event=JSON.parse(line);}catch{continue;}
  if(event.type!=='turn.completed')continue;
  const value=normalizeUsage(event.usage);if(!value)return null;
  usage=usage?normalizeUsage({input_tokens:usage.input_tokens+value.input_tokens,output_tokens:usage.output_tokens+value.output_tokens,cached_input_tokens:usage.cached_input_tokens===null||value.cached_input_tokens===null?null:usage.cached_input_tokens+value.cached_input_tokens}):value;
  if(!usage)return null;
 }
 return usage;
}
