export function FreeBadge() {
  return (
    <picture className="free-policy">
      <source
        media="(prefers-reduced-motion: reduce)"
        srcSet="./free-policy.png"
      />
      <img
        src="./free-policy.gif"
        width="112"
        height="30"
        alt="软件免费使用标识"
      />
    </picture>
  );
}
