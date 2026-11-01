use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use crate::video::{folder, load, media_command};

pub fn editing(value: &Value) -> Result<Value, String> {
    if value.as_object().is_none_or(|v|v.len()!=2){return Err("水印处理字段无效".into());}
    let trim = value["trim_end_seconds"].as_f64().filter(|v| v.is_finite() && (0.0..=5.0).contains(v)).ok_or("片尾处理时间无效")?;
    let regions = value["regions"].as_array().filter(|v| v.len() <= 4).ok_or("水印区域无效")?;
    let mut area = 0;
    for region in regions {
        if region.as_object().is_none_or(|v|v.len()!=4){return Err("水印区域字段无效".into());}
        let n = |key| region[key].as_u64().filter(|v| *v <= 1000).ok_or("水印坐标无效");
        let (x,y,w,h) = (n("x")?,n("y")?,n("width")?,n("height")?);
        if x < 2 || y < 2 || w < 5 || h < 5 || x+w > 998 || y+h > 998 || w*h > 80_000 || !(x < 200 || y < 200 || x+w > 800 || y+h > 800) {
            return Err("水印区域过大或接近主体，需人工处理".into());
        }
        area += w*h;
    }
    if area > 160_000 { return Err("水印覆盖范围过大，需人工处理".into()); }
    Ok(json!({"regions":regions,"trim_end_seconds":trim}))
}

pub async fn probe(path: &Path) -> Result<Value, String> {
    let output = tokio::time::timeout(std::time::Duration::from_secs(15), media_command("ffprobe").args(["-v","error","-protocol_whitelist","file,crypto,data","-select_streams","v:0","-show_entries","stream=width,height,codec_name:stream_side_data=rotation:stream_tags=rotate:format=duration","-of","json"]).arg(path).output()).await.map_err(|_|"视频检查超时")?.map_err(|_|"未找到 FFprobe")?;
    let value: Value = serde_json::from_slice(&output.stdout).map_err(|_|"视频参数无法读取")?;
    let duration = value["format"]["duration"].as_str().and_then(|v|v.parse::<f64>().ok()).filter(|v|v.is_finite()&&*v>0.0&&*v<=140.0).ok_or("视频时长须为0–140秒，较长视频需人工处理")?;
    let (mut w,mut h) = (value["streams"][0]["width"].as_u64().unwrap_or(0),value["streams"][0]["height"].as_u64().unwrap_or(0));
    if !output.status.success() || !(32..=4096).contains(&w) || !(32..=4096).contains(&h) { return Err("视频分辨率无法安全处理".into()); }
    let rotation=value["streams"][0]["side_data_list"].as_array().and_then(|items|items.iter().find_map(|v|v["rotation"].as_i64())).or_else(||value["streams"][0]["tags"]["rotate"].as_str().and_then(|s|s.parse::<i64>().ok())).unwrap_or(0);
    if rotation.rem_euclid(90)!=0{return Err("视频旋转角度无法安全处理".into());}
    if rotation.rem_euclid(180)==90{std::mem::swap(&mut w,&mut h);}
    Ok(json!({"duration":duration,"width":w,"height":h,"codec":value["streams"][0]["codec_name"]}))
}

pub async fn tail(home: &Path, id: &str, source: &Path, name: &str) -> Result<PathBuf, String> {
    let meta = probe(source).await?;
    let path = folder(home,id)?.join(name);
    let start = (meta["duration"].as_f64().unwrap()-3.0).max(0.0).to_string();
    let output = tokio::time::timeout(std::time::Duration::from_secs(30),media_command("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-protocol_whitelist","file,crypto,data","-ss",&start,"-i"]).arg(source).args(["-an","-sn","-vf","fps=3,scale=240:-2,tile=3x3","-frames:v","1","-q:v","4"]).arg(&path).output()).await.map_err(|_|"片尾检查超时")?.map_err(|_|"未找到 FFmpeg")?;
    if !output.status.success() || std::fs::metadata(&path).map_or(true,|m|m.len()==0||m.len()>2_000_000) { return Err("无法读取视频片尾，未进入发布队列".into()); }
    Ok(path)
}

pub async fn last_frame(home: &Path, id: &str, source: &Path, name: &str) -> Result<PathBuf, String> {
    let path=folder(home,id)?.join(name);
    let output=tokio::time::timeout(std::time::Duration::from_secs(30),media_command("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-protocol_whitelist","file,crypto,data","-sseof","-0.5","-i"]).arg(source).args(["-an","-sn","-vf","scale=480:-2,reverse","-frames:v","1","-q:v","3"]).arg(&path).output()).await.map_err(|_|"最后一帧检查超时")?.map_err(|_|"未找到 FFmpeg")?;
    if !output.status.success()||std::fs::metadata(&path).map_or(true,|m|m.len()==0||m.len()>2_000_000){return Err("无法检查视频最后一帧，未安排发布".into());}Ok(path)
}

pub async fn prepare(home: &Path, id: &str, plan: &Value) -> Result<Value, String> {
    let plan = editing(plan)?;
    let data = load(home,id)?;
    let source = Path::new(data["filename"].as_str().ok_or("原视频缺失")?);
    let meta = probe(source).await?;
    let duration = meta["duration"].as_f64().unwrap();
    let trim = plan["trim_end_seconds"].as_f64().unwrap();
    if trim > duration*0.2 || duration-trim < 1.0 { return Err("片尾裁剪会丢失过多内容，需人工处理".into()); }
    let (w,h) = (meta["width"].as_u64().unwrap(),meta["height"].as_u64().unwrap());
    let mut filters = Vec::new();
    for r in plan["regions"].as_array().unwrap() {
        let x = (r["x"].as_u64().unwrap()*w/1000).max(2);
        let y = (r["y"].as_u64().unwrap()*h/1000).max(2);
        let available_w=w.checked_sub(x+2).filter(|n|*n>=2).ok_or("水印太靠近画面边界，需人工处理")?;
        let available_h=h.checked_sub(y+2).filter(|n|*n>=2).ok_or("水印太靠近画面边界，需人工处理")?;
        let rw = (r["width"].as_u64().unwrap()*w/1000).max(2).min(available_w);
        let rh = (r["height"].as_u64().unwrap()*h/1000).max(2).min(available_h);
        filters.push(format!("delogo=x={x}:y={y}:w={rw}:h={rh}"));
    }
    filters.push("scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1".into());
    let folder = folder(home,id)?;
    let temp = folder.join("processed.part.mp4");
    let target = folder.join("processed.mp4");
    let output = tokio::time::timeout(std::time::Duration::from_secs(180),media_command("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-protocol_whitelist","file,crypto,data","-i"]).arg(source).args(["-t",&(duration-trim).to_string(),"-map","0:v:0","-map","0:a:0?","-sn","-map_metadata","-1","-vf",&filters.join(","),"-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p","-c:a","aac","-b:a","128k","-movflags","+faststart","-threads","2"]).arg(&temp).output()).await;
    let valid = output.is_ok_and(|r|r.is_ok_and(|o|o.status.success())) && std::fs::metadata(&temp).is_ok_and(|m|m.len()>0&&m.len()<=100_000_000);
    if !valid { let _=std::fs::remove_file(&temp);return Err("视频处理失败或超过100MB，原视频已保留".into()); }
    probe(&temp).await?;
    std::fs::rename(temp,&target).map_err(|_|"处理后视频保存失败")?;
    let cached=folder.join("processed-preview.jpg");
    if cached.exists(){std::fs::remove_file(cached).map_err(|_|"旧的处理预览无法清理，未进入复核")?;}
    Ok(json!({"filename":target,"bytes":std::fs::metadata(&target).map_err(|_|"处理后文件缺失")?.len(),"editing":plan,"verified":false}))
}

pub fn prepared_file(home: &Path, id: &str) -> Result<PathBuf, String> {
    let folder = folder(home,id)?;
    let path = folder.join("processed.mp4").canonicalize().map_err(|_|"处理后视频不存在")?;
    if path.parent()!=Some(folder.as_path()) || std::fs::metadata(&path).map_or(true,|m|m.len()==0||m.len()>100_000_000) {return Err("处理后视频路径或大小无效".into());}
    Ok(path)
}
