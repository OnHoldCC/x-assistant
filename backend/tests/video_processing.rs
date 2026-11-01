use onhold_backend::video_processing::editing;
use serde_json::json;
#[test]
fn model_edits_are_bounded_coordinates_never_commands_or_large_subject_masks(){
 assert!(editing(&json!({"regions":[],"trim_end_seconds":0})).is_ok());
 assert!(editing(&json!({"regions":[{"x":20,"y":20,"width":100,"height":50}],"trim_end_seconds":1.5})).is_ok());
 for region in [json!({"x":-1,"y":20,"width":100,"height":50}),json!({"x":"20; shell","y":20,"width":100,"height":50}),json!({"x":0,"y":0,"width":1000,"height":1000}),json!({"x":400,"y":400,"width":100,"height":100}),json!({"x":950,"y":20,"width":100,"height":50})]{assert!(editing(&json!({"regions":[region],"trim_end_seconds":0})).is_err());}
 for trim in [-1.0,5.1,100.0]{assert!(editing(&json!({"regions":[],"trim_end_seconds":trim})).is_err());}
}

#[tokio::test]
async fn the_actual_last_frame_is_checked_even_when_only_one_frame_is_a_brand_card(){
 use std::{path::Path,process::Command};
 let dir=tempfile::tempdir().unwrap();let id=uuid::Uuid::new_v4().to_string();let folder=dir.path().join("media/tiktok").join(&id);std::fs::create_dir_all(&folder).unwrap();let source=folder.join("source.mp4");
 assert!(Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","color=c=blue:s=64x64:r=25:d=1","-vf","drawbox=x=0:y=0:w=iw:h=ih:color=white:t=fill:enable='gte(t,0.95)'","-c:v","libx264","-pix_fmt","yuv420p"]).arg(&source).status().unwrap().success());
 let last=onhold_backend::video_processing::last_frame(dir.path(),&id,Path::new(&source),"last.jpg").await.unwrap();
 let pixel=Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-i"]).arg(last).args(["-vf","scale=1:1","-frames:v","1","-f","rawvideo","-pix_fmt","rgb24","-"]).output().unwrap();assert!(pixel.status.success());assert_eq!(pixel.stdout.len(),3);assert!(pixel.stdout.iter().all(|v|*v>220),"the final white frame must not be replaced by an earlier blue sample");
}

#[tokio::test]
async fn watermark_coordinates_follow_the_displayed_rotation(){
 use std::process::Command;
 let dir=tempfile::tempdir().unwrap();let original=dir.path().join("original.mp4");let rotated=dir.path().join("rotated.mp4");
 assert!(Command::new("ffmpeg").args(["-hide_banner","-loglevel","error","-f","lavfi","-i","color=c=blue:s=96x64:d=1","-c:v","libx264"]).arg(&original).status().unwrap().success());
 let help=Command::new("ffmpeg").args(["-h","full"]).output().unwrap();let modern=String::from_utf8_lossy(&help.stdout).contains("-display_rotation");
 let mut command=Command::new("ffmpeg");command.args(["-hide_banner","-loglevel","error","-y"]);if modern{command.args(["-display_rotation:v:0","90"]);}command.arg("-i").arg(&original).args(["-c","copy"]);if !modern{command.args(["-metadata:s:v:0","rotate=90"]);}assert!(command.arg(&rotated).status().unwrap().success());
 let meta=onhold_backend::video_processing::probe(&rotated).await.unwrap();assert_eq!(meta["width"],64);assert_eq!(meta["height"],96);
}
