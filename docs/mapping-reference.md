# Quip → Notion Mapping Reference

## Document elements

| Quip element | Notion equivalent | Notes |
|-------------|-----------------|-------|
| H1 heading | Heading 1 block | |
| H2 heading | Heading 2 block | |
| H3 heading | Heading 3 block | |
| Paragraph | Paragraph block | Inline formatting stripped in v0.1 |
| Bulleted list | Bulleted list item | |
| Numbered list | Numbered list item | |
| Code block | Code block | Language detected from class attribute |
| Blockquote | Callout block | |
| Horizontal rule | Divider block | |
| Inline image | Image block (external URL) | Binary upload in v0.2 |
| Embedded file | External URL link | Binary upload in v0.2 |
| Comment | Toggle block ("Comments archive") | Or Notion comment if permission allows |

## Spreadsheet mapping

| Quip spreadsheet | Notion equivalent | Notes |
|-----------------|-----------------|-------|
| Sheet | Database | One sheet per Notion database |
| Column header row | Database property | First column = Title; rest = Rich text |
| Data rows | Database rows | |
| Formula cell | Rich text (last computed value) | |
| Merged cells | Unmerged, content in first cell | |

## Metadata

Each migrated Notion page preserves the original Quip document title. Future versions will add a "Quip Source" property group with created date, last edited date, and original Quip URL.

## Known limitations

- Notion blocks have a 2000-character limit per rich-text element. Long paragraphs are truncated with "…".
- Notion pages have a max nesting depth. Quip folders deeper than Notion's limit are flattened with a warning.
- Quip's proprietary rich-text formatting (highlight colors, custom fonts) has no Notion equivalent and is stripped.
