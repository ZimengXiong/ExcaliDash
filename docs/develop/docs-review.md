# Review the docs

Run `npm run docs:dev` to open the docs with the review panel. Production builds show the docs without the editor.

## Edit a page

1. Open a page using the docs navigation or the panel's **Page** menu.
2. Edit its Markdown draft on the right. The published page stays on the left.
3. Add general feedback under **Page notes**.
4. Select text on either side and choose **Comment on selection** to attach feedback.

Edits autosave after you stop typing and when you switch pages. **Saved to server** confirms that the server received the draft. The editor also keeps a local backup while a save is pending.

Use **Hide** to read the page at full width. Select **Edit & comment** to reopen the panel. On smaller screens, the panel appears below the page.

## Revise from feedback

Drafts, notes, and comments are stored in `artifacts/docs-review/`. This directory is ignored by Git. Each record includes the source page, draft, selected quotes, and comments.

Select **Export all reviews** to download the review data. To apply feedback, revise the Markdown files under `docs/`; the review panel does not publish edits automatically.

If another tab changes the draft, export your edits before loading its server copy.

## Writing references

Use direct instructions, sentence-case headings, and numbered steps for procedures. Include prerequisites and the result a reader should expect. Keep reference tables separate from tutorials.

- [Google developer documentation style guide](https://developers.google.com/style/highlights)
- [Google's procedure guidance](https://developers.google.com/style/procedures)
- [Docker's getting-started tutorial](https://docs.docker.com/get-started/tutorials/run-an-app/)
- [Vite's getting-started guide](https://vite.dev/guide/)
