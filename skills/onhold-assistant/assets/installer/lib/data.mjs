import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
export const fingerprint=text=>createHash('sha256').update(text.trim()).digest('hex');
export const resultKey=(...parts)=>fingerprint(JSON.stringify(parts));
function sourceUrl(value){let url;try{url=new URL(value);}catch{throw Error('来源 URL 无效');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('来源 URL 无效');url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);return url;}
export class HotCache{
 constructor({ttl=7*86400000,maxEntries=2000,maxBytes=32*1024**2,now=Date.now}={}){Object.assign(this,{ttl,maxEntries,maxBytes,now});this.entries=new Map();this.bytes=0;}
 delete(key){const item=this.entries.get(key);if(item){this.bytes-=item.bytes;this.entries.delete(key);}}
 get(key){const item=this.entries.get(key);if(!item)return null;if(this.now()-item.at>=this.ttl){this.delete(key);return null;}this.entries.delete(key);this.entries.set(key,item);return structuredClone(item.value);}
 set(key,value){const bytes=Buffer.byteLength(JSON.stringify(value));this.delete(key);if(bytes>this.maxBytes)return;this.entries.set(key,{value:structuredClone(value),bytes,at:this.now()});this.bytes+=bytes;while(this.entries.size>this.maxEntries||this.bytes>this.maxBytes)this.delete(this.entries.keys().next().value);}
}
export function openData(file,options={}){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});let db,warning='';
 try{db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');if(process.platform!=='win32')fs.chmodSync(file,0o600);}
 catch{try{db?.close();}catch{}db=new DatabaseSync(':memory:');warning='持久数据不可用，原文件保留；当前结果仅暂存内存';}
 db.exec(`CREATE TABLE IF NOT EXISTS contents(hash TEXT PRIMARY KEY,original TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,platform TEXT NOT NULL,post_id TEXT,url TEXT NOT NULL,current_hash TEXT NOT NULL,original_tags TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS documents_post ON documents(platform,post_id) WHERE post_id IS NOT NULL;
 CREATE INDEX IF NOT EXISTS documents_url ON documents(url);
 CREATE TABLE IF NOT EXISTS document_versions(document_id TEXT NOT NULL,content_hash TEXT NOT NULL,first_seen INTEGER NOT NULL,PRIMARY KEY(document_id,content_hash));
 CREATE TABLE IF NOT EXISTS document_parts(document_id TEXT NOT NULL,version_hash TEXT NOT NULL,part_hash TEXT NOT NULL,position INTEGER NOT NULL,PRIMARY KEY(document_id,version_hash,position));
 CREATE TABLE IF NOT EXISTS results(kind TEXT NOT NULL,key TEXT NOT NULL,content_hash TEXT NOT NULL,model_version TEXT NOT NULL,target_lang TEXT NOT NULL,value TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(kind,key));
 CREATE INDEX IF NOT EXISTS results_lookup ON results(kind,content_hash,target_lang,model_version);
 CREATE TABLE IF NOT EXISTS observations(document_id TEXT NOT NULL,observed_at INTEGER NOT NULL,value TEXT NOT NULL,PRIMARY KEY(document_id,observed_at));
 CREATE TABLE IF NOT EXISTS counters(id TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,imported_at INTEGER NOT NULL);`);
 const hot=new HotCache(options),pending=new Map();
 const counters=()=>JSON.parse(db.prepare("SELECT value FROM counters WHERE id='translations'").get()?.value||'{"since":null,"segments":0,"inference":0,"cache_hits":0,"total_ms":0}');
 function record(value){if(value.unchanged)return;try{const stats=counters();stats.since??=Date.now();stats.segments++;if(value.cached)stats.cache_hits++;else{stats.inference++;stats.total_ms+=Math.max(0,value.elapsed_ms||0);}db.prepare("INSERT OR REPLACE INTO counters VALUES('translations',?)").run(JSON.stringify(stats));}catch{warning='译文已生成，但统计保存失败';}}
 async function obtain(kind,key,contentHash,version,target,source,produce){
  const id=kind+':'+key,cached=hot.get(id);if(cached)return {...cached,cached:true,cache_layer:'memory',elapsed_ms:0};
  try{const row=db.prepare('SELECT value FROM results WHERE kind=? AND key=?').get(kind,key);if(row){const value=JSON.parse(row.value);hot.set(id,value);return {...value,cached:true,cache_layer:'sqlite',elapsed_ms:0};}}
  catch{warning='持久数据暂不可读，本次继续运行模型';}
  if(pending.has(id))return {...await pending.get(id),cached:true,cache_layer:'inflight',elapsed_ms:0};
  const job=(async()=>{const value=await produce();if(!value.unchanged){try{
   db.exec('BEGIN IMMEDIATE');if(source)db.prepare('INSERT OR IGNORE INTO contents VALUES(?,?,?)').run(contentHash,source,Date.now());
   db.prepare('INSERT OR REPLACE INTO results VALUES(?,?,?,?,?,?,?)').run(kind,key,contentHash,version,target,JSON.stringify(value),Date.now());db.exec('COMMIT');
  }catch{try{db.exec('ROLLBACK');}catch{}warning='结果已生成，但持久保存失败';}hot.set(id,value);}return {...value,cached:false,...(warning?{data_warning:warning,cache_warning:warning}:{})};})();
  pending.set(id,job);try{return await job;}finally{pending.delete(id);}
 }
 function observe(input){
  if(!input||typeof input.original!=='string'||!input.original.trim()||input.original.length>24000)throw Error('无效的正文');
  const url=sourceUrl(input.url);
  const match=['x.com','twitter.com'].includes(url.hostname)&&url.pathname.match(/^\/([^/]+)\/status\/(\d+)/),platform=match?'x':'web',postId=match?.[2]||null;
  const original=input.original.trim(),hash=fingerprint(original),id=postId?'x:'+postId:'web:'+fingerprint(url.href),at=Date.now(),tags=[...new Set(original.match(/#[\p{L}\p{N}_]+/gu)||[])];
  db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT OR IGNORE INTO contents VALUES(?,?,?)').run(hash,original,at);db.prepare('INSERT INTO documents VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET url=excluded.url,current_hash=excluded.current_hash,original_tags=excluded.original_tags,updated_at=excluded.updated_at').run(id,platform,postId,url.href,hash,JSON.stringify(tags),at);db.prepare('INSERT OR IGNORE INTO document_versions VALUES(?,?,?)').run(id,hash,at);
   let position=0;for(let line of original.split(/\n+/).map(x=>x.trim()).filter(Boolean)){while(line.length>2000){let end=line.lastIndexOf(' ',2000);if(end<1000)end=2000;if(/[\uD800-\uDBFF]/.test(line[end-1]))end--;db.prepare('INSERT OR IGNORE INTO document_parts VALUES(?,?,?,?)').run(id,hash,fingerprint(line.slice(0,end).trim()),position++);line=line.slice(end).trim();}if(line)db.prepare('INSERT OR IGNORE INTO document_parts VALUES(?,?,?,?)').run(id,hash,fingerprint(line),position++);}
   if(input.metrics){const metrics={};for(const name of ['views','replies','reposts','likes']){const raw=input.metrics[name],value=raw?.value??raw;if(value===null||value===undefined)continue;if(!Number.isFinite(value)||value<0)throw Error('互动数无效');metrics[name]={value,approximate:raw?.approximate===true};}db.prepare('INSERT OR REPLACE INTO observations VALUES(?,?,?)').run(id,at,JSON.stringify(metrics));}db.exec('COMMIT');return {id,content_hash:hash};
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
 function lookup({id,url,post_id,content_hash}={}){
  let doc;if(id)doc=db.prepare('SELECT * FROM documents WHERE id=?').get(id);else if(post_id)doc=db.prepare("SELECT * FROM documents WHERE platform='x' AND post_id=?").get(post_id);else if(url){const normalized=sourceUrl(url),post=['x.com','twitter.com'].includes(normalized.hostname)&&normalized.pathname.match(/^\/[^/]+\/status\/(\d+)/);doc=post?db.prepare("SELECT * FROM documents WHERE platform='x' AND post_id=?").get(post[1]):db.prepare('SELECT * FROM documents WHERE url=?').get(normalized.href);}
  const hash=content_hash||doc?.current_hash;if(!hash)return null;
  const content=db.prepare('SELECT original FROM contents WHERE hash=?').get(hash);const results=db.prepare('SELECT kind,model_version,target_lang,value,created_at FROM results WHERE content_hash=? OR content_hash IN (SELECT part_hash FROM document_parts WHERE document_id=? AND version_hash=?) ORDER BY created_at DESC').all(hash,doc?.id||'',hash).map(row=>({...row,value:JSON.parse(row.value)}));
  return {document:doc?{...doc,original_tags:JSON.parse(doc.original_tags)}:null,content_hash:hash,original:content?.original||null,results,versions:doc?db.prepare('SELECT content_hash,first_seen FROM document_versions WHERE document_id=? ORDER BY first_seen DESC').all(doc.id):[]};
 }
 function importStats(id,value){if(typeof id!=='string'||id.length>100)throw Error('无效统计来源');if(db.prepare('SELECT 1 FROM imports WHERE id=?').get(id))return;const old=counters();for(const key of ['segments','inference','cache_hits','total_ms']){const n=value?.[key]??0;if(!Number.isSafeInteger(n)||n<0||n>1e12)throw Error('无效统计');old[key]+=n;}if(Number.isFinite(value?.since))old.since=old.since?Math.min(old.since,value.since):value.since;db.exec('BEGIN');try{db.prepare("INSERT OR REPLACE INTO counters VALUES('translations',?)").run(JSON.stringify(old));db.prepare('INSERT INTO imports VALUES(?,?)').run(id,Date.now());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}}
 function importLegacy(file){
  if(!fs.existsSync(file))throw Error('找不到旧数据文件');const old=new DatabaseSync(file,{readOnly:true});let count=0;
  try{const tables=old.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name);
   const rows=tables.includes('memory')?old.prepare('SELECT cache_key AS key,version,target_lang,translated,source_lang,created_at FROM memory').all():[];
   db.exec('BEGIN');for(const row of rows){db.prepare('INSERT OR IGNORE INTO results VALUES(?,?,?,?,?,?,?)').run('legacy-python',row.key,'',row.version,row.target_lang,JSON.stringify({text:row.translated,source_lang:row.source_lang,target_lang:row.target_lang}),Math.round(row.created_at*1000));count++;}db.exec('COMMIT');return count;
  }catch(error){try{db.exec('ROLLBACK');}catch{}throw error;}finally{old.close();}
 }
 // Import legacy Node results once; the original table and any database file remain intact.
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cache'").get())db.exec("INSERT OR IGNORE INTO results SELECT 'translation',hash,'','legacy','',value,at FROM cache");
 return {db,hot,obtain,observe,lookup,record,counters,importStats,importLegacy,get warning(){return warning;},close:()=>db.close()};
}
