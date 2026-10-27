# OnHold typography alignment

The assistant follows `@onhold/ui` design foundations, `react/tokens.ts`, and its Typography documentation. It does not use the application-specific LaunchWizard/Nunito skin.

- UI text: `onHoldFonts.sans` — Arial, Helvetica, sans-serif.
- Type scale: caption 12, body 14, input 15, subtitle 18, title 24, display 36 px.
- Compact post summary: caption 12 px; text action weight 650 follows the shared Button specification.
- Statistics: tabular numerals; missing values remain separate from confirmed zero.
- Popup headings/body/inputs follow the corresponding type scale roles.
- Original X post and editor content retain X's own typography.

The source tokens also define mono/address and wallet font roles. They are not substituted for normal UI or post text.
