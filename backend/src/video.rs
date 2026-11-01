use serde_json::{json, Value};
use std::{io::Write, path::Path};

const MAX_VIDEO: usize = 100_000_000;

fn video_page(raw: &str) -> Result<(String, String), String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "TikTok 页面地址无效")?;
    if url.scheme() != "https" || ![Some("www.tiktok.com"), Some("tiktok.com")].contains(&url.host_str()) || !url.username().is_empty() || url.password().is_some() || url.port().is_some() {
        return Err("仅支持 HTTPS TikTok 公开视频页面".into());
    }
    let parts: Vec<_> = url.path().trim_end_matches('/').split('/').collect();
    if parts.len()!=4 || !parts[1].starts_with('@') || !(2..=65).contains(&parts[1].len()) || !parts[1][1..].bytes().all(|c|c.is_ascii_alphanumeric()||b"_.-".contains(&c)) || parts[2]!="video" || parts[3].is_empty() || parts[3].len()>30 || !parts[3].bytes().all(|c|c.is_ascii_digit()) {
        return Err("请填写具体的 TikTok 视频页面 URL，不是首页或播放直链".into());
    }
    Ok((format!("https://www.tiktok.com/{}/video/{}",parts[1],parts[3]),parts[3].to_owned()))
}

fn permitted(url: &reqwest::Url) -> bool {
    url.scheme()=="https" && url.username().is_empty() && url.password().is_none() && url.port().is_none() && url.host_str().is_some_and(|host| ["tiktok.com","tiktokcdn.com","tiktokcdn-us.com","tiktokv.com"].iter().any(|base| host==*base || host.ends_with(&format!(".{base}"))))
}

fn embed_video(html: &str, id: &str) -> Result<Value, String> {
    let script = html.split("<script").skip(1).find_map(|part| {
        let (attributes, body)=part.split_once('>')?;
        (attributes.contains("id=\"__FRONTITY_CONNECT_STATE__\"")||attributes.contains("id='__FRONTITY_CONNECT_STATE__'")).then(||body.split("</script>").next()).flatten()
    }).ok_or("TikTok 未返回视频资料，可能需要登录或页面暂不可用")?;
    let value: Value=serde_json::from_str(script).map_err(|_|"TikTok 视频资料无法解析")?;
    let video=&value["source"]["data"][format!("/embed/v2/{id}")]["videoData"];
    if video["itemInfos"]["id"].as_str()!=Some(id) {return Err("TikTok 返回的视频与页面不匹配，未下载".into());}
    let author=video["authorInfos"]["uniqueId"].as_str().filter(|s|!s.is_empty()&&s.len()<=64).ok_or("TikTok 作者资料缺失")?;
    let urls=video["itemInfos"]["video"]["urls"].as_array().ok_or("TikTok 未返回视频下载地址")?;
    let urls=urls.iter().filter_map(Value::as_str).filter(|raw|raw.len()<=16000&&reqwest::Url::parse(raw).is_ok_and(|url|permitted(&url))).take(3).collect::<Vec<_>>();
    if urls.is_empty(){return Err("TikTok 未返回可信的视频下载地址".into());}
    Ok(json!({"id":id,"author":author,"title":video["itemInfos"]["text"].as_str().unwrap_or("").chars().take(4000).collect::<String>(),"urls":urls}))
}

pub async fn download(home: &Path, raw: &str) -> Result<Value,String> {
    let (source,id)=video_page(raw)?;
    let redirects=reqwest::redirect::Policy::custom(|attempt|if attempt.previous().len()>=3||!permitted(attempt.url()){attempt.error("视频重定向地址无效")}else{attempt.follow()});
    let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).redirect(redirects).user_agent("Mozilla/5.0").build().map_err(|_|"视频下载客户端初始化失败")?;
    let mut response=client.get(format!("https://www.tiktok.com/embed/v2/{id}")).send().await.map_err(|_|"TikTok 页面连接失败")?;
    if !response.status().is_success(){return Err(format!("TikTok 页面返回 HTTP {}",response.status().as_u16()));}
    let mut html=Vec::new();
    while let Some(chunk)=response.chunk().await.map_err(|_|"TikTok 页面读取失败")? {
        if html.len()+chunk.len()>3_000_000{return Err("TikTok 页面超过大小限制".into());}html.extend_from_slice(&chunk);
    }
    let mut metadata=embed_video(&String::from_utf8(html).map_err(|_|"TikTok 页面编码无效")?,&id)?;
    let mut media=None;
    for url in metadata["urls"].as_array().unwrap() {
        if let Ok(response)=client.get(url.as_str().unwrap()).header(reqwest::header::REFERER,"https://www.tiktok.com/").send().await {
            if response.status().is_success(){media=Some(response);break;}
        }
    }
    let mut media=media.ok_or("TikTok 拒绝视频下载，可能需要登录或播放地址已失效；未生成文件")?;
    if media.content_length().is_some_and(|n|n>MAX_VIDEO as u64){return Err("视频超过 100 MB 下载限制".into());}
    let download_id=uuid::Uuid::new_v4().to_string();
    let folder=home.join("media").join("tiktok").join(&download_id);
    std::fs::create_dir_all(&folder).map_err(|_|"视频保存目录创建失败")?;
    let part=folder.join("source.mp4.part");let target=folder.join("source.mp4");
    let outcome: Result<usize,String>=async {
        let mut file=std::fs::File::create(&part).map_err(|_|"视频文件创建失败")?;let mut total=0;let mut signature=Vec::new();
        while let Some(chunk)=media.chunk().await.map_err(|_|"视频传输中断，请重新尝试")? {
            total+=chunk.len();if total>MAX_VIDEO{return Err("视频超过 100 MB 下载限制".into());}
            if signature.len()<12 {signature.extend_from_slice(&chunk[..chunk.len().min(12-signature.len())]);}
            file.write_all(&chunk).map_err(|_|"视频保存失败，请检查磁盘空间")?;
        }
        if signature.get(4..8)!=Some(b"ftyp".as_slice()){return Err("TikTok 返回的不是 MP4 视频，未保存为成功下载".into());}
        file.sync_all().map_err(|_|"视频写入磁盘失败")?;
        std::fs::rename(&part,&target).map_err(|_|"视频保存失败")?;Ok(total)
    }.await;
    let bytes=match outcome{Ok(bytes)=>bytes,Err(error)=>{let _=std::fs::remove_file(&part);return Err(error);}};
    metadata.as_object_mut().unwrap().remove("urls");
    metadata["source"]=json!(source);metadata["filename"]=json!(target);metadata["bytes"]=json!(bytes);
    metadata["download_id"]=json!(download_id);
    metadata["requires_review"]=json!(true);metadata["published"]=json!(false);
    metadata["excluded_topics"]=json!(["国家政治","血腥"]);
    std::fs::write(folder.join("source.json"),serde_json::to_vec_pretty(&metadata).unwrap()).map_err(|_|"视频已保存，但来源记录保存失败")?;
    Ok(metadata)
}

pub fn folder(home:&Path,id:&str)->Result<std::path::PathBuf,String>{
    let id=uuid::Uuid::parse_str(id).map_err(|_|"视频下载标识无效")?;
    let root=home.join("media").join("tiktok").canonicalize().map_err(|_|"视频目录不存在")?;
    let folder=root.join(id.to_string()).canonicalize().map_err(|_|"视频下载不存在")?;
    if !folder.starts_with(&root)||folder==root{return Err("视频目录无效".into());}Ok(folder)
}
pub fn load(home:&Path,id:&str)->Result<Value,String>{
    let folder=folder(home,id)?;let path=folder.join("source.json");
    if std::fs::metadata(&path).map_err(|_|"视频来源记录不存在")?.len()>2_000_000{return Err("视频来源记录过大".into());}
    let mut value:Value=serde_json::from_slice(&std::fs::read(path).map_err(|_|"视频来源读取失败")?).map_err(|_|"视频来源记录无效")?;
    let source=folder.join("source.mp4").canonicalize().map_err(|_|"原视频不存在")?;
    if !source.starts_with(&folder){return Err("原视频路径无效".into());}
    if std::fs::metadata(&source).map_err(|_|"原视频读取失败")?.len()>MAX_VIDEO as u64{return Err("视频超过处理大小限制".into());}
    value["download_id"]=json!(id);value["filename"]=json!(source);Ok(value)
}
pub fn persist(home:&Path,id:&str,value:&Value)->Result<(),String>{
    let folder=folder(home,id)?;let temp=folder.join("source.json.tmp");
    std::fs::write(&temp,serde_json::to_vec_pretty(value).map_err(|_|"视频结果无效")?).map_err(|_|"视频结果保存失败")?;
    std::fs::rename(temp,folder.join("source.json")).map_err(|_|"视频结果保存失败".to_owned())
}
fn media_command(name:&str)->tokio::process::Command{
    let mut paths=vec![std::path::PathBuf::from(format!("/opt/homebrew/bin/{name}")),std::path::PathBuf::from(format!("/usr/local/bin/{name}"))];
    if let Some(home)=std::env::var_os("HOME"){paths.push(std::path::PathBuf::from(home).join(".homebrew/bin").join(name));}
    let executable=paths.into_iter().find(|p|p.is_file()).unwrap_or_else(||name.into());
    let mut command=tokio::process::Command::new(executable);command.kill_on_drop(true);command
}
pub async fn preview(home:&Path,id:&str)->Result<std::path::PathBuf,String>{
    let folder=folder(home,id)?;let metadata=load(home,id)?;let source=metadata["filename"].as_str().ok_or("视频路径缺失")?;
    let image=folder.join("caption-preview.jpg");
    if image.canonicalize().is_ok_and(|p|p.starts_with(&folder))&&std::fs::metadata(&image).is_ok_and(|m|m.len()<2_000_000){if let Ok(bytes)=std::fs::read(&image){if bytes.starts_with(&[255,216])&&bytes.ends_with(&[255,217]){return Ok(image);}}}
    let probe=tokio::time::timeout(std::time::Duration::from_secs(15),media_command("ffprobe").args(["-v","error","-protocol_whitelist","file,crypto,data","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",source]).output()).await.map_err(|_|"视频检查超时")?.map_err(|_|"未找到 FFprobe，请在后端安装 FFmpeg")?;
    let duration=String::from_utf8_lossy(&probe.stdout).trim().parse::<f64>().ok().filter(|d|d.is_finite()&&*d>0.0).filter(|_|probe.status.success()).ok_or("视频时长无法确认，未调用模型")?;
    let temp=folder.join("caption-preview.part.jpg");
    let filter=format!("fps={:.8},scale=240:-2,tile=4x3",12.0/duration);
    let output=tokio::time::timeout(std::time::Duration::from_secs(30),media_command("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-protocol_whitelist","file,crypto,data","-i",source,"-an","-sn","-vf",&filter,"-frames:v","1","-q:v","4"]).arg(&temp).output()).await.map_err(|_|"视频画面抽样超时，原视频已保留")?.map_err(|_|"未找到 FFmpeg，原视频已保留")?;
    if !output.status.success()||std::fs::metadata(&temp).map_or(true,|m|m.len()==0||m.len()>2_000_000){let _=std::fs::remove_file(&temp);return Err("视频画面无法读取，未生成配文".into());}
    std::fs::rename(temp,&image).map_err(|_|"视频预览保存失败")?;Ok(image)
}
pub fn excluded(text:&str)->bool{
    if ["国家政治","政治","总统","政党","选举","习近平","特朗普","拜登","普京","中共","共产党","战争","血腥","断肢","斩首","肢解"].iter().any(|word|text.contains(word)){return true;}
    text.to_ascii_lowercase().split(|c:char|!c.is_ascii_alphabetic()).any(|word|["politics","political","president","presidential","trump","biden","putin","election","elections","parliament","senate","war","warfare","gore","beheading","dismemberment"].contains(&word))
}
pub fn validate_caption(value:&Value)->Result<Value,String>{
    let root=value.as_object().filter(|o|o.len()==4).ok_or("配文格式无效")?;
    if value["schema_version"]!=1{return Err("配文版本无效".into());}
    let status=root.get("status").and_then(Value::as_str).filter(|s|["ready","rejected","needs_review"].contains(s)).ok_or("配文审核状态无效")?;
    let text=value["text"].as_str().filter(|s|s.chars().count()<=280&&!s.chars().any(|c|c.is_control()&&c!='\n')).ok_or("英文配文无效")?.trim();
    let reason=value["reason"].as_str().filter(|s|s.chars().count()<=400&&!s.chars().any(char::is_control)).ok_or("审核理由无效")?;
    if status=="ready" {
        if excluded(text){return validate_caption(&json!({"schema_version":1,"status":"rejected","text":"","reason":"配文涉及国家政治或血腥主题，已排除"}));}
        if text.is_empty()||!text.bytes().any(|c|c.is_ascii_alphabetic())||text.contains(['@','#'])||(text.to_lowercase().contains("http://")||text.to_lowercase().contains("https://")||text.to_lowercase().contains("www."))||text.chars().any(|c|('\u{3400}'..='\u{9fff}').contains(&c)){return Err("配文必须是无链接、无提及或话题的英文短帖".into());}
    }else if !text.is_empty()||reason.trim().is_empty(){return Err("排除或待检查的视频不得生成发布文案".into());}
    Ok(json!({"schema_version":1,"status":status,"text":text,"reason":reason,"sent":false,"skip_reason":if status=="ready"{""}else{reason},"requires_review":true}))
}
pub fn save_caption(home:&Path,id:&str,value:&Value)->Result<(),String>{
    let folder=folder(home,id)?;
    if value["status"]=="ready"{std::fs::write(folder.join("caption.txt"),value["text"].as_str().ok_or("配文正文缺失")?).map_err(|_|"文案保存失败，视频已保留")?;}
    Ok(())
}
pub fn snapshot(home:&Path,store:&crate::store::Store,id:&str)->Result<Value,String>{
    let mut value=load(home,id)?;let job=store.video_caption_job(id)?;
    value["caption_status"]=json!(match job["state"].as_str().unwrap_or(""){"queued"=>"queued","rewriting"=>"generating","failed"=>"failed",_=>job["result"]["status"].as_str().unwrap_or("needs_review")});
    value["caption_text"]=job["result"]["text"].clone();value["caption_reason"]=job["result"]["reason"].clone();value["caption_error"]=job["error"].clone();
    if value["caption_status"]=="ready"{value["caption_file"]=json!(folder(home,id)?.join("caption.txt"));}
    value["caption_job"]=job;Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_public_video_pages_and_owned_media_hosts_are_accepted(){
        assert_eq!(video_page("https://www.tiktok.com/@creator/video/123?tracking=1").unwrap(),("https://www.tiktok.com/@creator/video/123".into(),"123".into()));
        for url in ["http://www.tiktok.com/@a/video/1","https://127.0.0.1/@a/video/1","https://www.tiktok.com/","https://www.tiktok.com/@a","https://user@www.tiktok.com/@a/video/1","https://www.tiktok.com:444/@a/video/1","https://www.tiktok.com/@a/video/../1","https://www.tiktok.com/@a/video/not-number"]{assert!(video_page(url).is_err(),"{url}");}
        for url in ["http://v45.tiktokcdn-us.com/a","https://tiktokcdn-us.com.evil.example/a","https://localhost/a","https://user:pass@v45.tiktokcdn-us.com/a"]{assert!(!permitted(&reqwest::Url::parse(url).unwrap()));}
    }
    #[test]
    fn embed_requires_the_exact_video_and_never_returns_cover_images(){
        let html=format!("<script id=\"__FRONTITY_CONNECT_STATE__\">{}</script>",json!({"source":{"data":{"/embed/v2/123":{"videoData":{"itemInfos":{"id":"123","text":"Kitten","covers":["https://p16.tiktokcdn-us.com/cover.jpg"],"video":{"urls":["https://v45.tiktokcdn-us.com/video.mp4","https://evil.example/a"]}},"authorInfos":{"uniqueId":"creator"}}}}}}));
        let video=embed_video(&html,"123").unwrap();assert_eq!(video["urls"],json!(["https://v45.tiktokcdn-us.com/video.mp4"]));assert!(embed_video(&html,"456").is_err());assert!(embed_video("captcha","123").is_err());
    }
}
