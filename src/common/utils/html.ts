/**
 * html.ts — Sanitasi HTML rich-text dari editor CMS sebelum disimpan.
 *
 * Konten dirender apa adanya di portal publik — tanpa ini editor (atau token
 * curian) bisa menyisipkan <script>/onerror yang jalan di browser warga.
 * Dipakai semua modul ber-konten HTML (berita, halaman, FAQ, …).
 */
import sanitizeHtml from "sanitize-html";

// Hanya properti tampilan yang dipakai editor (TipTap). url()/expression()
// tidak bisa lolos karena tiap nilai harus cocok pola di bawah.
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.,\s%]+\)|[a-z]+)$/i;
const LENGTH = /^\d+(\.\d+)?(px|%|em|rem)?$/;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...sanitizeHtml.defaults.allowedTags, "img"],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ["src", "alt", "title", "width", "height"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    "*": ["class", "style"],
  },
  allowedStyles: {
    "*": {
      color: [COLOR],
      "background-color": [COLOR],
      "text-align": [/^(left|right|center|justify)$/],
      width: [LENGTH],
      "min-width": [LENGTH],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
};

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, OPTIONS);
}
