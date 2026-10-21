"""page_profile.py — Profil de page sans stocker le texte.

Objectif : savoir ce qui fait qu'un bot IA lit une zone (tableau, liste,
texte, longueur) sans collecter de contenu personnel. Uniquement des
métriques structurelles dérivées du HTML.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any, Dict, Optional

# Cap défensif : le profiler ne lit jamais plus que ça d'octets HTML.
_MAX_SCAN = 256 * 1024

_TAG_RE = re.compile(rb"</?([a-zA-Z0-9]+)(\s|>|/)", re.I)
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_WORD_RE = re.compile(r"[^\W_]{2,}", re.U)


class _StructureParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.counts: Dict[str, int] = {
            "table": 0, "ul": 0, "ol": 0, "li": 0, "p": 0,
            "h1": 0, "h2": 0, "h3": 0, "h4": 0, "pre": 0, "code": 0,
            "img": 0, "a": 0,
        }
        self.in_title = False
        self.title = ""
        self._skip_depth = 0
        self.text_chunks: list = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip_depth += 1
            return
        if tag == "title":
            self.in_title = True
        if tag in self.counts:
            self.counts[tag] += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript") and self._skip_depth > 0:
            self._skip_depth -= 1
        if tag == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        if self.in_title:
            self.title += data
        elif data and data.strip():
            self.text_chunks.append(data)


def extract_page_profile(html: Any) -> Optional[Dict[str, Any]]:
    """Retourne un profil structurel, ou None si rien d'exploitable.

    Champs :
      word_count      approx. nombre de mots de texte visible
      has_table       au moins un <table>
      has_list        au moins une <ul>/<ol>
      list_item_count nombre de <li>
      heading_count   h1..h4 cumulés
      paragraph_count <p>
      link_count      <a>
      image_count     <img>
      title           titre de page (tronqué)
      format          format dominant déduit : table | list | mixed | text
    """
    if html is None:
        return None
    if isinstance(html, bytes):
        raw = html[:_MAX_SCAN]
        try:
            text = raw.decode("utf-8", errors="replace")
        except Exception:
            return None
    else:
        text = str(html)[:_MAX_SCAN]
    if not text or "<" not in text:
        return None

    parser = _StructureParser()
    try:
        parser.feed(text)
        parser.close()
    except Exception:
        return None

    joined = " ".join(parser.text_chunks)
    words = _WORD_RE.findall(joined)
    counts = parser.counts
    has_table = counts["table"] > 0
    has_list = (counts["ul"] + counts["ol"]) > 0

    if has_table and has_list:
        dominant = "mixed"
    elif has_table:
        dominant = "table"
    elif has_list and counts["li"] >= 5:
        dominant = "list"
    else:
        dominant = "text"

    title = " ".join(parser.title.split())[:200] if parser.title else ""

    return {
        "word_count": len(words),
        "has_table": has_table,
        "has_list": has_list,
        "list_item_count": counts["li"],
        "heading_count": counts["h1"] + counts["h2"] + counts["h3"] + counts["h4"],
        "paragraph_count": counts["p"],
        "link_count": counts["a"],
        "image_count": counts["img"],
        "title": title,
        "format": dominant,
    }
