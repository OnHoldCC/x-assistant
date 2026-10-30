# OnHold typography alignment

The assistant follows the local [OnHold UI specification](ONHOLD-UI.md). Font tokens live in `app/src/styles/tokens.css` and are exported to the extension during the app build.

- UI text: `--font-family-sans` — native system sans-serif, with PingFang SC / Microsoft YaHei for Chinese. Brand text alone uses the bundled Nunito variable font through `--font-family-brand`. No external font request is required.
- Component titles: 14 px / 500; secondary labels: 12 px; catalog page headings: 25 px / 500. Reference metrics use 32 px / 400, with tabular figures.
- Type scale: caption 12, body 14, input 15, subtitle 18, title 24, display 36 px.
- Compact post summary: caption 12 px; text actions follow the shared Button specification.
- Statistics: tabular numerals; missing values remain separate from confirmed zero.
- Popup headings/body/inputs follow the corresponding type scale roles.
- Original X post and editor content retain X's own typography.

The mono role uses the system monospace stack for dates, comparisons and technical text. Original X content is not restyled by the admin theme; its injected assistant tools keep their existing font.
