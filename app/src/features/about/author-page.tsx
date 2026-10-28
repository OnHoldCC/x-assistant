import { Card } from "@/components/onhold";
import { Send } from "lucide-react";
function Github() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .7a11.3 11.3 0 0 0-3.6 22c.6.1.8-.2.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.5-1.3-1.3-1.6-1.3-1.6-1.1-.8.1-.8.1-.8 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.7 0-1.2.4-2.2 1.2-3-.1-.3-.5-1.5.1-3 0 0 1-.3 3.1 1.2a10.6 10.6 0 0 1 5.6 0C16.9 5 17.9 5.3 17.9 5.3c.6 1.5.2 2.7.1 3 .8.8 1.2 1.8 1.2 3 0 4.4-2.8 5.4-5.5 5.7.4.4.8 1.1.8 2.2v3c0 .4.2.7.8.6A11.3 11.3 0 0 0 12 .7z" />
    </svg>
  );
}
const versions = [
  {
    version: "0.9.2",
    date: "2026-10-28",
    items: [
      "创作者进度整合到顶部栏，点击查看资格与收益。",
      "金色扫光标签，放大文字。",
      "检测已加载的插件版本，引导重载并验证更新。",
    ],
  },
  {
    version: "0.9.1",
    date: "2026-10-28",
    items: [
      "账号指标和曲线优先展示，创作者进度放到分析下方。",
      "创作者数据未采集时简洁显示，不绘制空进度条。",
      "Mac 使用固定目录的覆盖安装包，保留用户数据。",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-28",
    items: [
      "账号分析使用 X 官方逐日导出，多指标曲线支持单项查看。",
      "创作者门槛、合格曝光与收益估算分开显示。",
      "收藏与标签、本地运营记忆、可选外部模型接入。",
      "自动化任务和限制暂停状态、系统日志。",
      "黑灰蓝界面，简化插件操作，保留离线快照。",
    ],
  },
  {
    version: "0.8.7",
    date: "2026-10-28",
    items: [
      "帖子指标改为图标与数字。",
      "分别保存官方统计周期，保留缺失值与近似标记。",
    ],
  },
  {
    version: "0.8.6",
    date: "2026-10-28",
    items: [
      "统一采集入口，补齐插件指标摘要。",
      "改善连接引导、重试和安装目录定位。",
    ],
  },
];
function XLogo() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-7.4L5.5 22H2.3l7.2-8.3L.8 2h6.5l4.5 6.8L18.9 2Zm-1.1 18h1.7L6.4 3.9H4.6L17.8 20Z" />
    </svg>
  );
}
export function AuthorPage() {
  return (
    <Card className="author-page">
      <div className="author-links">
        {[
          [XLogo, "X", "https://x.com/OnHoldCC"],
          [Send, "Telegram", "https://t.me/On_Hold_CC"],
          [Github, "GitHub", "https://github.com/OnHoldCC/x-assistant"],
        ].map(([Icon, label, url]) => {
          const Symbol = Icon as typeof Github;
          return (
            <a
              href={url as string}
              key={label as string}
              target="_blank"
              rel="noreferrer"
              aria-label={label + " " + url}
            >
              <Symbol aria-hidden="true" />
              <span>{url as string}</span>
            </a>
          );
        })}
      </div>

      <div className="release-notes" aria-label="版本日志">
        {versions.map((release) => (
          <details key={release.version}>
            <summary>
              <strong>v{release.version}</strong>
              <time>{release.date}</time>
            </summary>
            <ul>
              {release.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </Card>
  );
}
