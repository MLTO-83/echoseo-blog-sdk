# Changelog

## 0.4.0 (2026-03-18)

### Breaking Changes

- **`content` renamed to `content_html`** — The `BlogPost` interface now uses `content_html` instead of `content`, reading from the `content_html` Firestore field. Update any code referencing `post.content` to use `post.content_html`.

## 0.3.0 (2026-03-16)

### Breaking Changes

- **Firestore collection paths** — Changed from `sites/{siteId}/articles` to `{siteId}_articles` (top-level collection). This requires updating your Firestore data structure accordingly.
- **Published-only filtering** — `getPosts()` and `getPost()` now only return articles with `status == "published"`. Draft or unpublished articles are no longer returned.

### Features

- `getPosts()` uses Firestore `runQuery` structured query to filter by `status == "published"` and order by `publishedAt` descending.
- `getPost()` verifies the document's `status` field is `"published"` before returning it.

### Notes

- The `getPosts()` query requires a Firestore composite index on `{siteId}_articles` for fields `status` (Ascending) + `publishedAt` (Descending). Firestore will log a link to create the index if it's missing.

## 0.2.1

- Bump version.

## 0.2.0

- Add `buildArticleMetadata` helper for OG/Twitter meta tags.

## 0.1.0

- Initial release with `getPosts()`, `getPost()`, and `initEchoseoBlog()`.
