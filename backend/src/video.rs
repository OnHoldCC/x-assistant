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
    let folder=home.join("media").join("tiktok").join(uuid::Uuid::new_v4().to_string());
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
    metadata["requires_review"]=json!(true);metadata["published"]=json!(false);
    metadata["excluded_topics"]=json!(["国家政治","血腥"]);
    std::fs::write(folder.join("source.json"),serde_json::to_vec_pretty(&metadata).unwrap()).map_err(|_|"视频已保存，但来源记录保存失败")?;
    Ok(metadata)
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
