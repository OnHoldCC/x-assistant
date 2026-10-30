//! Public source discovery, following 60s hot-topics and news-aggregator-skill's RSS approach.
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::{BTreeMap, HashSet}, sync::Mutex};

const WEIBO: &str = "https://60s.viki.moe/v2/weibo";
const REDNOTE: &str = "https://60s.viki.moe/v2/rednote";
const BBC: &str = "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml";
const GUARDIAN: &str = "https://www.theguardian.com/culture/rss";

#[derive(Default)]
pub struct Sources { cache: Mutex<BTreeMap<String, (i64, Value)>> }

fn https_url(value: &str, hosts: &[&str]) -> bool {
    reqwest::Url::parse(value).is_ok_and(|u| u.scheme()=="https" && u.username().is_empty() && u.password().is_none() && u.port().is_none() && u.host_str().is_some_and(|h| hosts.contains(&h)))
}

fn topics(raw: &str, platform: &str) -> Result<Vec<Value>, String> {
    let value: Value = serde_json::from_str(raw).map_err(|_| "热榜返回无效 JSON")?;
    if value["code"] != 200 { return Err("热榜服务未返回成功状态".into()); }
    let data = value["data"].as_array().filter(|items| items.len()<=100).ok_or("热榜数据结构无效")?;
    let hosts: &[&str] = if platform=="weibo" { &["s.weibo.com"] } else { &["www.xiaohongshu.com"] };
    let mut seen=HashSet::new();let mut items=Vec::new();
    for (index, item) in data.iter().enumerate() {
        if item["is_ad"]==true || item["word_type"]=="荐" { continue; }
        let title=item["title"].as_str().filter(|s| !s.trim().is_empty() && s.chars().count()<=300 && !s.chars().any(char::is_control)).ok_or("热榜标题无效")?;
        let url=item["link"].as_str().filter(|s| s.len()<=4096 && https_url(s,hosts)).ok_or("热榜链接无效")?;
        if !seen.insert(title.trim().to_owned()) { continue; }
        items.push(json!({"kind":"topic","platform":platform,"title":title.trim(),"url":url,"rank":index+1,"heat":item.get("hot_value").or_else(||item.get("score")),"published_at":null}));
    }
    Ok(items)
}

#[derive(Deserialize)]
struct Rss { channel: Channel }
#[derive(Deserialize)]
struct Channel { #[serde(default)] item: Vec<RssItem> }
#[derive(Deserialize)]
struct RssItem {
    title: String, link: String,
    #[serde(rename="pubDate", default)] date: String,
    #[serde(default)] description: String,
}
fn plain_summary(html: &str) -> String {
    let mut text=String::new(); let mut in_tag=false;
    for c in html.chars() {
        match c {
            '<' => { in_tag=true; text.push(' '); }
            '>' => in_tag=false,
            _ if !in_tag => text.push(c),
            _ => (),
        }
    }
    let decoded=quick_xml::escape::unescape(&text).unwrap_or_else(|_|text.as_str().into());
    decoded.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(800).collect()
}
fn rss(raw: &str, source: &str, at: i64) -> Result<Vec<Value>, String> {
    if raw.contains("<!DOCTYPE") || raw.contains("<!ENTITY") { return Err("RSS 文档声明无效".into()); }
    let value: Rss=quick_xml::de::from_str(raw).map_err(|_| "RSS 格式无法解析")?;
    let hosts: &[&str]=if source=="bbc" { &["www.bbc.co.uk","www.bbc.com","bbc.co.uk","bbc.com"] } else { &["www.theguardian.com"] };
    let mut items=Vec::new();let mut seen=HashSet::new();
    for item in value.channel.item.into_iter().take(100) {
        let Ok(date)=chrono::DateTime::parse_from_rfc2822(&item.date) else { continue; };
        let published=date.timestamp_millis();
        if published>at || published<at-48*3600000 || !https_url(&item.link,hosts) || item.title.trim().is_empty() || item.title.chars().count()>300 || !seen.insert(item.link.clone()) { continue; }
        items.push(json!({"kind":"article","platform":source,"title":item.title.trim(),"url":item.link,"published_at":published,"summary":plain_summary(&item.description)}));
        if items.len()==20 { break; }
    }
    Ok(items)
}

async fn download(client: &reqwest::Client, url: &str) -> Result<String,String> {
    let mut response=client.get(url).send().await.map_err(|e| format!("网络请求失败：{e}"))?;
    if !response.status().is_success() { return Err(format!("HTTP {}",response.status().as_u16())); }
    let mut body=Vec::new();
    while let Some(chunk)=response.chunk().await.map_err(|_| "响应读取失败")? {
        if body.len()+chunk.len()>2_000_000 { return Err("取材响应超过大小限制".into()); }
        body.extend_from_slice(&chunk);
    }
    String::from_utf8(body).map_err(|_| "取材响应不是 UTF-8".into())
}

impl Sources {
    pub async fn fetch(&self, source: &str) -> Result<Value,String> {
        if !["weibo","rednote","hot_topics","international","mixed"].contains(&source) { return Err("此来源使用全网搜索，没有固定热榜".into()); }
        let at=crate::store::now();
        if let Some((stamp,value))=self.cache.lock().map_err(|_| "取材缓存忙")?.get(source) {
            if at-*stamp<300_000 { let mut cached=value.clone();cached["cached"]=json!(true);return Ok(cached); }
        }
        let redirects=reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len()>3 || !https_url(attempt.url().as_str(), &["60s.viki.moe","feeds.bbci.co.uk","www.theguardian.com"]) { attempt.error("取材重定向地址无效") } else { attempt.follow() }
        });
        let client=reqwest::Client::builder().timeout(std::time::Duration::from_secs(15)).redirect(redirects).user_agent("OnHold/0.9 news-source-reader").build().map_err(|_| "取材客户端初始化失败")?;
        let mut feeds=Vec::new();
        if ["weibo","hot_topics","mixed"].contains(&source) { feeds.push(("weibo",WEIBO)); }
        if ["rednote","hot_topics","mixed"].contains(&source) { feeds.push(("rednote",REDNOTE)); }
        if ["international","mixed"].contains(&source) { feeds.extend([("bbc",BBC),("guardian",GUARDIAN)]); }
        let mut tasks=tokio::task::JoinSet::new();
        for (platform,url) in feeds {
            let client=client.clone();
            tasks.spawn(async move { let outcome=download(&client,url).await.and_then(|text| if ["weibo","rednote"].contains(&platform) { topics(&text,platform) } else { rss(&text,platform,at) }); (platform,url,outcome) });
        }
        let mut items=Vec::new();let mut errors=Vec::new();let mut counts=BTreeMap::new();
        while let Some(result)=tasks.join_next().await {
            let (platform,url,outcome)=result.map_err(|_| "取材任务执行中断")?;
            match outcome {
                Ok(data) => { counts.insert(platform,data.len());items.extend(data); }
                Err(error) => { errors.push(json!({"platform":platform,"url":url,"error":error})); }
            }
        }
        items.sort_by(|a,b| a["platform"].as_str().cmp(&b["platform"].as_str()).then(a["rank"].as_u64().cmp(&b["rank"].as_u64())));
        let result=json!({"source":source,"retrieved_at":at,"provider":"60s hot-topics + news-aggregator RSS","cached":false,"counts":counts,"items":items,"errors":errors});
        if !items.is_empty() && errors.is_empty() { self.cache.lock().map_err(|_| "取材缓存忙")?.insert(source.into(),(at,result.clone())); }
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rss_summary_removes_tracking_html_and_is_bounded() {
        assert_eq!(plain_summary("<p>A &amp; B</p><a href=\"https://tracking.example/very-long-url\">Read more</a>"), "A & B Read more");
        assert_eq!(plain_summary(&"x".repeat(4000)).chars().count(),800);
    }
    #[test]
    fn hotlists_preserve_unknown_dates_and_never_accept_foreign_links_or_errors() {
        let raw=json!({"code":200,"data":[{"title":"娱乐热点","link":"https://s.weibo.com/weibo?q=test","hot_value":123},{"title":"娱乐热点","link":"https://s.weibo.com/weibo?q=test"}]}).to_string();
        let items=topics(&raw,"weibo").unwrap();assert_eq!(items.len(),1);assert!(items[0]["published_at"].is_null());assert_eq!(items[0]["heat"],123);
        assert!(topics(r#"{"code":403,"data":[]}"#,"weibo").is_err());
        assert!(topics(r#"{"code":200,"data":[{"title":"bad","link":"https://s.weibo.com.evil.example/"}]}"#,"weibo").is_err());
        assert!(topics(&raw,"rednote").is_err());
    }
    #[test]
    fn rss_requires_real_recent_dates_and_owned_links_and_handles_cdata_entities() {
        let at=crate::store::now();let date=chrono::DateTime::from_timestamp_millis(at-1000).unwrap().to_rfc2822();
        let xml=format!("<rss><channel><item><title><![CDATA[Music &amp; cinema]]></title><link>https://www.bbc.com/news/a?a=1&amp;b=2</link><pubDate>{date}</pubDate><description><![CDATA[<p>Verified facts</p>]]></description></item><item><title>No date</title><link>https://www.bbc.com/news/b</link></item></channel></rss>");
        let items=rss(&xml,"bbc",at).unwrap();assert_eq!(items.len(),1);assert_eq!(items[0]["url"],"https://www.bbc.com/news/a?a=1&b=2");assert_eq!(items[0]["kind"],"article");assert!(items[0]["published_at"].as_i64().unwrap()<=at);
        assert!(rss(&xml,"guardian",at).unwrap().is_empty());assert!(rss(&xml,"bbc",at+49*3600000).unwrap().is_empty());
        assert!(rss("<!DOCTYPE rss><rss/>","bbc",at).is_err());
    }
}
