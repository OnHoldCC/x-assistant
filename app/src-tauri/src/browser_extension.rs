use std::{
    fs, io,
    path::{Path, PathBuf},
};

fn copy_directory(source: &Path, target: &Path) -> io::Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let destination = target.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_dir() {
            copy_directory(&entry.path(), &destination)?;
        } else if kind.is_file() {
            fs::copy(entry.path(), destination)?;
        } else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "插件资源不支持链接文件",
            ));
        }
    }
    Ok(())
}

pub fn export(source: &Path, home: &Path) -> io::Result<PathBuf> {
    if !source.join("manifest.json").is_file() {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "安装包缺少 X 助手 manifest.json",
        ));
    }
    let target = home.join("browser-extension");
    let staging = home.join("browser-extension-update");
    let previous = home.join("browser-extension-previous");
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    copy_directory(source, &staging)?;
    if previous.exists() {
        fs::remove_dir_all(&previous)?;
    }
    if target.exists() {
        fs::rename(&target, &previous)?;
    }
    if let Err(error) = fs::rename(&staging, &target) {
        if previous.exists() {
            let _ = fs::rename(&previous, &target);
        }
        return Err(error);
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_path_stays_stable_and_invalid_updates_preserve_installed_files() {
        let root = std::env::temp_dir().join(format!(
            "onhold-extension-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let source = root.join("app/extension");
        let home = root.join("user-data");
        fs::create_dir_all(source.join("admin-ui/assets")).unwrap();
        fs::write(source.join("manifest.json"), "{\"version\":\"1.3.2\"}").unwrap();
        fs::write(source.join("admin-ui/assets/old.js"), "old").unwrap();
        let installed = export(&source, &home).unwrap();
        assert_eq!(installed, home.join("browser-extension"));
        let moved = root.join("moved-app/extension");
        fs::create_dir_all(moved.join("admin-ui/assets")).unwrap();
        fs::write(moved.join("manifest.json"), "{\"version\":\"1.3.3\"}").unwrap();
        fs::write(moved.join("admin-ui/assets/new.js"), "new").unwrap();
        assert_eq!(export(&moved, &home).unwrap(), installed);
        assert!(!installed.join("admin-ui/assets/old.js").exists());
        assert_eq!(
            fs::read_to_string(installed.join("admin-ui/assets/new.js")).unwrap(),
            "new"
        );
        assert!(export(&root.join("missing"), &home).is_err());
        assert!(installed.join("manifest.json").is_file());
        fs::remove_dir_all(root).unwrap();
    }
}
